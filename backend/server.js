import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import multer from 'multer';

// Prevent missing dotenv crash in production
try {
  if (process.env.NODE_ENV !== "production") {
    const dotenv = await import("dotenv");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Look for .env in the backend folder OR the root folder
    dotenv.config({ path: path.join(__dirname, '.env') });
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
    console.log("✅ Dotenv loaded for local development");
  }
} catch (e) {
  // Ignore missing dotenv
}

// Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({ storage: multer.memoryStorage() });

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://logistics-alpha-steel.vercel.app"
];

// Flexible CORS setup
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Setup Server and Socket.IO (Moved to top for reliability) ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  },
});

app.set('socketio', io); // Attach to app for potential use in routes

// --- Socket.io Connection Logic ---
io.on("connection", (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // When a user logs in, they join a room named after their Supabase UUID
  socket.on("join", (userId) => {
    if (userId) {
      socket.join(userId);
      console.log(`👤 User joined room: ${userId} (Socket: ${socket.id})`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

/**
 * 🔥 REAL-TIME FALLBACK LISTENER
 * This watches the 'tasks' table directly. 
 * If the Webhook fails (due to localhost/ngrok issues), this will still catch the task
 * and trigger the email/notification.
 */
const taskChannel = supabase
  .channel('backend-task-monitor')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'tasks' },
    async (payload) => {
      console.log('📡 REAL-TIME: New task detected via DB listener:', payload.new.id);
      processTaskNotification(payload.new, 'INSERT');
    }
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'tasks' },
    async (payload) => {
      const isRestarted = payload.new.status === 'Pending' && payload.old.status === 'Completed';
      const isEdit = (payload.new.title !== payload.old.title) ||
        (payload.new.description !== payload.old.description) ||
        (payload.new.deadline_at !== payload.old.deadline_at);

      if (isRestarted || isEdit) {
        console.log(`📡 REAL-TIME: Task ${isRestarted ? 'restart' : 'edit'} detected via DB listener:`, payload.new.id);
        processTaskNotification(payload.new, 'UPDATE', { isRestart: isRestarted, isEdit });
      }
    }
  )
  .subscribe();


async function processTaskNotification(record, type, options = {}) {
  const { isRestart = false, isEdit = false } = options;
  try {
    console.log(`🔍 [Processing] Task ${record.id} for receiver ${record.receiver_id} (Restart: ${isRestart}, Edit: ${isEdit})`);

    // 1. Fetch profiles
    const { data: receiver } = await supabase.from('profiles').select('email, full_name').eq('id', record.receiver_id).single();
    const { data: sender } = await supabase.from('profiles').select('full_name').eq('id', record.sender_id).single();

    if (receiver?.email) {
      const isPersonal = record.sender_id === record.receiver_id;
      const senderName = sender?.full_name || 'A team member';

      let subject = isPersonal ? "Personal Task Reminder" : "New Task Allocated";
      let title = isPersonal ? "Your to-do jobs in my tasks" : "Task Assignment";

      if (isRestart) {
        subject = isPersonal ? "Personal Task Restarted" : "Assigned Task Restarted";
        title = "Task Reactivated";
      } else if (isEdit) {
        subject = isPersonal ? "Personal Task Updated" : "Assigned Task Updated";
        title = "Task Details Modified";
      }

      const deadlineInfo = record.deadline_at ? `\nDeadline: ${new Date(record.deadline_at).toLocaleString()}` : '';

      let body = isPersonal
        ? `Reminder: "${record.title}".\n\nDetails: ${record.description || 'No description.'}`
        : `${senderName} assigned you: "${record.title}".\n\nDetails: ${record.description || 'No description.'}`;

      if (isRestart) {
        body = `Task "${record.title}" has been restarted.${deadlineInfo}\n\nDetails: ${record.description || 'No description.'}`;
      } else if (isEdit) {
        body = `Task "${record.title}" has been updated with new details.${deadlineInfo}\n\nDetails: ${record.description || 'No description.'}`;
      }

      // 2. Send Email
      await sendSealEmail({
        to: receiver.email,
        subject: subject,
        title: title,
        body: body,
        actionLink: "https://logistics-alpha-steel.vercel.app/job-allocation",
        actionText: "View Task",
        type: (isRestart || isEdit) ? 'reminder' : (isPersonal ? 'assignment' : 'info')
      });

      // 3. Emit Real-time Socket Alert
      io.to(record.receiver_id).emit("new_notification", {
        id: Date.now(),
        title: isRestart ? "Task Restarted" : (isEdit ? "Task Updated" : (isPersonal ? "Personal Task Added" : "New Task Assigned")),
        message: record.title,
        type: (isRestart || isEdit) ? "reminder" : (isPersonal ? "task" : "assignment"),
        task_id: record.id
      });

      console.log(`✅ [Success] Processed notification for ${receiver.email}`);
    }
  } catch (err) {
    console.error("❌ [Error] Failed to process notification:", err.message);
  }
}

// Root route - Friendly landing page
app.get("/", (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; text-align: center; padding: 50px;">
      <h1 style="color: #4f46e5;">Seal Logistics Gateway</h1>
      <p>The logistics messaging and notification server is online.</p>
      <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; display: inline-block; border-radius: 8px;">
        Status: <span style="color: #10b981; font-weight: bold;">● Active</span>
      </div>
    </div>
  `);
});

// Basic health check routes
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "websocket-messaging",
    socketConnected: io.engine.clientsCount,
    resendConfigured: !!resend
  });
});

// Test endpoint to verify everything works
app.get("/api/test-notification", async (req, res) => {
  let { userId, email } = req.query;

  // If only email is provided, try to find the userId
  if (!userId && email) {
    console.log(`🔍 Looking up userId for email: ${email}`);
    const { data: profile } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
    if (profile) {
      userId = profile.id;
      console.log(`✅ Found userId: ${userId}`);
    } else {
      return res.status(404).json({ error: "User profile not found for this email" });
    }
  }

  if (!userId) return res.status(400).json({ error: "userId or email required" });

  console.log(`🧪 Running manual notification test for user: ${userId}`);
  let results = { socket: false, email: false, db: false };

  // 1. Test Socket
  try {
    io.to(userId).emit("new_notification", {
      title: "Test Popup Success",
      message: "If you see this, your live notifications are working!",
      type: 'info',
      timestamp: new Date().toISOString()
    });
    results.socket = true;
  } catch (e) { results.socket = e.message; }

  // 2. Test DB
  try {
    await supabase.from('notifications').insert([{
      user_id: userId,
      title: "Test Bell Notification",
      message: "This confirms your notification database is connected.",
      type: 'info'
    }]);
    results.db = true;
  } catch (e) { results.db = e.message; }

  // 3. Test Email
  if (email && resend) {
    try {
      await sendSealEmail({
        to: email,
        subject: "Manual Notification Test",
        title: "Test Successful",
        body: "This is a test email to confirm your Resend configuration is working.",
        type: 'info'
      });
      results.email = true;
    } catch (e) { results.email = e.message; }
  }

  res.json({ msg: "Test complete", results });
});

// --- NOTIFICATION UTILS ---
const SEAL_LOGO = "https://logistics.prudata-tech.workers.dev/supabase/storage/v1/object/public/assets/seal.png";

/**
 * Universal email sender with Seal Logistics branding
 */
async function sendSealEmail({ to, subject, title, body, actionLink, actionText, type = 'info' }) {
  if (!resend || !to) return;

  const colors = {
    assignment: '#4f46e5',
    reminder: '#f59e0b',
    deadline: '#dc2626',
    info: '#4f46e5'
  };
  const themeColor = colors[type] || colors.info;

  try {
    await resend.emails.send({
      from: 'Seal Logistics <alerts@mail.prudata.info>',
      to: Array.isArray(to) ? to : [to],
      subject: `Seal Logistics: ${subject}`,
      html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: ${themeColor}; padding: 30px; text-align: center;">
                  <img src="${SEAL_LOGO}" alt="Seal Logistics" style="height: 50px; filter: brightness(0) invert(1);">
                </div>
                 <div style="padding: 40px;">
                   <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #111827;">${title || 'Seal Logistics Update'}</h1>
                   <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #4b5563;">${body}</p>
                  
                  ${actionLink ? `
                  <div style="text-align: center; margin-top: 30px;">
                    <a href="${actionLink}" style="display: inline-block; background-color: ${themeColor}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      ${actionText || 'View Details'}
                    </a>
                  </div>
                  ` : ''}
                </div>
                <div style="padding: 20px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #f3f4f6;">
                  <p style="margin: 0; font-size: 12px; color: #9ca3af;">&copy; 2024 Seal Logistics. This is an automated notification.</p>
                </div>
              </div>
            </div>
            `
    });
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

// --- NOTIFICATION ENDPOINTS ---

/**
 * Custom File Attachment Email Endpoint
 */
app.post("/api/send-email", upload.single('file'), async (req, res) => {
  if (!resend) {
    return res.status(500).json({ error: "Resend API key not configured" });
  }

  try {
    const { to, cc, bcc, subject, body, fileName, fileBase64 } = req.body;
    let fileBuffer;
    let finalFileName = fileName;

    // Support both FormData (multer) and JSON (Base64)
    if (req.file) {
      fileBuffer = req.file.buffer;
      finalFileName = req.file.originalname;
    } else if (fileBase64) {
      fileBuffer = Buffer.from(fileBase64, 'base64');
    }

    if (!to || !subject) {
      return res.status(400).json({ error: "Missing required fields: to, subject" });
    }

    const emailPayload = {
      from: 'Seal Logistics <alerts@mail.prudata.info>',
      to: to.split(',').map(e => e.trim()),
      subject: subject,
      html: `<div style="font-family: sans-serif;">
              <p>${body ? body.replace(/\n/g, '<br/>') : 'Please find the attached file.'}</p>
             </div>`
    };

    if (cc) emailPayload.cc = cc.split(',').map(e => e.trim());
    if (bcc) emailPayload.bcc = bcc.split(',').map(e => e.trim());

    if (fileBuffer) {
      emailPayload.attachments = [
        {
          filename: finalFileName || 'attachment.xlsx',
          content: fileBuffer,
        }
      ];
    }

    const result = await resend.emails.send(emailPayload);
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    res.json({ success: true, message: "Email sent successfully" });
  } catch (err) {
    console.error("Error sending email with attachment:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cron: Greeting Messages (Morning/Night)
 * Triggered by Vercel Cron
 */
app.get("/api/cron/greetings", async (req, res) => {
  const { type } = req.query; // 'morning' or 'night'

  if (!resend) {
    return res.status(500).json({ error: "Resend API key not configured" });
  }

  try {
    // 1. Get all users from profiles table 
    const { data: users, error } = await supabase
      .from('profiles')
      .select('email, full_name');

    if (error) throw error;
    if (!users || users.length === 0) return res.json({ msg: "No users found" });

    const getSubject = () => {
      if (type === 'morning') return "Daily Update: Seal Logistics System";
      if (type === 'afternoon') return "Mid-Day Status: Seal Logistics";
      return "System Status: Seal Logistics";
    };

    const getGreetingAndBody = () => {
      if (type === 'morning') return {
        greeting: "Good morning",
        body: "Your daily logistics summary is ready. All systems are operating normally."
      };
      if (type === 'afternoon') return {
        greeting: "Good afternoon",
        body: "Mid-day system diagnostic completed. All operations are running smoothly."
      };
      return {
        greeting: "Hello",
        body: "System integrity check: All shipments and data are secure. All services online."
      };
    };

    const subject = getSubject();
    const { greeting, body: bodyText } = getGreetingAndBody();

    const logoUrl = "https://logistics.prudata-tech.workers.dev/supabase/storage/v1/object/public/assets/seal.png";

    // 2. Send emails with premium template
    const results = await Promise.allSettled(users.filter(u => u.email).map(user =>
      resend.emails.send({
        from: 'Seal Logistics <alerts@mail.prudata.info>',
        to: user.email,
        subject: subject,
        html: `
          <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 40px 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <div style="background-color: #4f46e5; padding: 30px; text-align: center;">
                <img src="${logoUrl}" alt="Seal Logistics" style="height: 50px; filter: brightness(0) invert(1);">
              </div>
               <div style="padding: 40px;">
                 <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #111827;">${greeting},</h1>
                 <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #4b5563;">${bodyText}</p>
                <div style="padding: 20px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                  <p style="margin: 0; font-size: 14px; font-weight: 600; color: #374151;">System Status: <span style="color: #10b981;">● Online & Secure</span></p>
                </div>
              </div>
              <div style="padding: 20px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #f3f4f6;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af;">&copy; 2024 Seal Logistics Platform. All rights reserved.</p>
              </div>
            </div>
          </div>
        `
      })
    ));

    res.json({ success: true, type, count: results.length });
  } catch (err) {
    console.error("Cron Greetings Catch:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cron: Payment Alerts
 */
app.get("/api/cron/payments", async (req, res) => {
  if (!resend) return res.status(500).json({ error: "Resend API key not configured" });

  try {
    const { data: failedPayments, error } = await supabase
      .from('shipments')
      .select('id, amount, vendorName, email')
      .eq('payment_status', 'failed');

    if (error) throw error;
    if (!failedPayments || failedPayments.length === 0) return res.json({ msg: "No failed payments today" });

    const logoUrl = "https://logistics.prudata-tech.workers.dev/supabase/storage/v1/object/public/assets/seal.png";

    for (const payment of failedPayments) {
      if (payment.email) {
        await resend.emails.send({
          from: 'Seal Logistics <alerts@mail.prudata.info>',
          to: payment.email,
          subject: "Seal Logistics: Important Update Regarding Your Payment",
          html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #fff5f5; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #feb2b2;">
                <div style="background-color: #c53030; padding: 30px; text-align: center;">
                  <img src="${logoUrl}" alt="Seal Logistics" style="height: 50px; filter: brightness(0) invert(1);">
                </div>
                <div style="padding: 40px;">
                  <h1 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #2d3748;">Payment Failed</h1>
                  <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4a5568;">Hello, we noticed a failed payment for shipment <strong>#${payment.id}</strong>.</p>
                  <div style="margin: 30px 0; padding: 20px; border-left: 4px solid #c53030; background-color: #fff5f5;">
                    <p style="margin: 0 0 10px; font-weight: bold; color: #c53030;">Shipment Details:</p>
                    <p style="margin: 0; font-size: 14px; color: #718096;">Amount: ₹${payment.amount || '0'}<br>Vendor: ${payment.vendorName || 'N/A'}</p>
                  </div>
                  <a href="https://logistics-alpha-steel.vercel.app/dashboard" style="display: inline-block; background-color: #c53030; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Fix Payment Now</a>
                </div>
              </div>
            </div>
          `
        });
      }
    }

    res.json({ success: true, count: failedPayments.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Webhook: Shipment Status Update
 */
app.post("/api/webhooks/shipments", async (req, res) => {
  const payload = req.body;
  const logoUrl = "https://logistics.prudata-tech.workers.dev/supabase/storage/v1/object/public/assets/seal.png";

  const isStatusUpdate = payload.type === 'UPDATE' && payload.record.status !== payload.old_record.status;
  const isPaymentFailure = payload.type === 'UPDATE' && payload.record.payment_status === 'failed' && payload.old_record.payment_status !== 'failed';
  const isPaymentSuccess = payload.type === 'UPDATE' && payload.record.payment_status === 'paid' && payload.old_record.payment_status !== 'paid';

  if (isStatusUpdate || isPaymentFailure || isPaymentSuccess) {
    const shipmentId = payload.record.id;

    if (!resend) return res.status(200).json({ msg: "Webhook received but Resend not config" });

    try {
      // Fetch all users to notify everyone as requested
      const { data: profiles } = await supabase.from('profiles').select('id, email');
      const allRecipients = profiles ? profiles.map(p => p.email).filter(e => e && e.includes('@')) : [];

      if (allRecipients.length === 0) {
        console.warn("No valid profile emails found for notification.");
        return res.status(200).json({ received: true, msg: "No recipients" });
      }

      if (isStatusUpdate) {
        const newStatus = payload.record.status;

        // Fetch or Generate public tracking token
        let trackToken = shipmentId;
        try {
          const { data: existingLink } = await supabase
            .from('shipment_updates')
            .select('remarks')
            .eq('shipment_id', shipmentId)
            .eq('status', 'Link Generated')
            .not('remarks', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingLink && existingLink.remarks) {
            trackToken = existingLink.remarks.trim();
          } else {
            const newToken = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
              const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
              return v.toString(16);
            });
            await supabase.from('shipment_updates').insert([{
              shipment_id: shipmentId,
              status: 'Link Generated',
              remarks: newToken,
              update_time: new Date().toISOString()
            }]);
            trackToken = newToken;
          }
        } catch (e) {
          console.error("Token gen error", e);
        }

        const trackingUrl = `https://logistics-alpha-steel.vercel.app/track/${trackToken}`;
        const whatsappMsg = encodeURIComponent(`Track your shipment ${shipmentId} update here: ${trackingUrl}`);
        const whatsappLink = `https://wa.me/?text=${whatsappMsg}`;

        await resend.emails.send({
          from: 'Seal Logistics <alerts@mail.prudata.info>',
          to: allRecipients,
          subject: "Seal Logistics: Shipment Status Update",
          html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #4f46e5; padding: 30px; text-align: center;">
                  <img src="${logoUrl}" alt="Seal Logistics" style="height: 50px; filter: brightness(0) invert(1);">
                </div>
                <div style="padding: 40px; text-align: center;">
                  <div style="display: inline-block; padding: 8px 16px; background-color: #e0e7ff; color: #4338ca; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 20px;">
                    Shipment Update
                  </div>
                  <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #111827;">A shipment status has changed!</h1>
                  <p style="margin: 0 0 30px; font-size: 18px; color: #4b5563;">Shipment <strong>#${shipmentId}</strong> is now: <span style="color: #4f46e5; font-weight: bold;">${newStatus}</span></p>
                  
                  <div style="margin-bottom: 30px;">
                    <a href="${trackingUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Track Shipment</a>
                  </div>
                  
                  <div style="border-top: 1px solid #f3f4f6; margin-top: 30px; padding-top: 30px;">
                    <p style="margin: 0 0 15px; font-size: 14px; color: #6b7280;">Quickly share this update via WhatsApp:</p>
                    <a href="${whatsappLink}" style="display: inline-block; background-color: #25D366; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" width="16" height="16" style="vertical-align: middle; margin-right: 8px;">
                      Share on WhatsApp
                    </a>
                  </div>
                </div>
                <div style="padding: 20px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #f3f4f6;">
                  <p style="margin: 0; font-size: 12px; color: #9ca3af;">This is an automated notification from Seal Logistics. Team update regarding Shipment #${shipmentId}.</p>
                </div>
              </div>
            </div>
          `
        });
      }

      if (isPaymentFailure) {
        const amount = payload.record.freight || payload.record.amount || '0';
        const vendor = payload.record.client || payload.record.vendor_name || 'N/A';

        await resend.emails.send({
          from: 'Seal Logistics <alerts@mail.prudata.info>',
          to: allRecipients,
          subject: "Seal Logistics: Important Update Regarding A Payment",
          html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #fff5f5; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #feb2b2;">
                <div style="background-color: #c53030; padding: 30px; text-align: center;">
                  <img src="${logoUrl}" alt="Seal Logistics" style="height: 50px; filter: brightness(0) invert(1);">
                </div>
                <div style="padding: 40px;">
                  <h1 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #2d3748;">Payment Failed</h1>
                  <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4a5568;">This is a system alert: A payment has failed for shipment <strong>#${shipmentId}</strong>.</p>
                  <div style="margin: 30px 0; padding: 20px; border-left: 4px solid #c53030; background-color: #fff5f5;">
                    <p style="margin: 0 0 10px; font-weight: bold; color: #c53030;">Transaction Details:</p>
                    <p style="margin: 0; font-size: 14px; color: #718096;">Amount: ₹${amount}<br>Client/Vendor: ${vendor}</p>
                  </div>
                  <a href="https://logistics-alpha-steel.vercel.app/dashboard" style="display: inline-block; background-color: #c53030; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Check Dashboard</a>
                </div>
              </div>
            </div>
          `
        });
      }

      if (isPaymentSuccess) {
        const amount = payload.record.freight || payload.record.amount || '0';
        const vendor = payload.record.client || payload.record.vendor_name || 'N/A';
        const clientEmail = payload.record.client_email || payload.record.email;
        const recipients = clientEmail ? [clientEmail, ...allRecipients] : allRecipients;

        await resend.emails.send({
          from: 'Seal Logistics <alerts@mail.prudata.info>',
          to: [...new Set(recipients)],
          subject: "Seal Logistics: Payment Received Confirmation",
          html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f0fdf4; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #bbf7d0;">
                <div style="background-color: #15803d; padding: 30px; text-align: center;">
                  <img src="${logoUrl}" alt="Seal Logistics" style="height: 50px; filter: brightness(0) invert(1);">
                </div>
                <div style="padding: 40px;">
                  <h1 style="margin: 0 0 20px; font-size: 22px; font-weight: 700; color: #166534;">Payment Successful</h1>
                  <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #166534;">Thank you! We have successfully received payment for shipment <strong>#${shipmentId}</strong>.</p>
                  <div style="margin: 30px 0; padding: 20px; border-left: 4px solid #15803d; background-color: #f0fdf4;">
                    <p style="margin: 0 0 10px; font-weight: bold; color: #15803d;">Transaction Details:</p>
                    <p style="margin: 0; font-size: 14px; color: #166534;">Amount: ₹${amount}<br>Client/Vendor: ${vendor}<br>Payment Method: ${payload.record.payment_method || 'Online/Cash'}</p>
                  </div>
                  <a href="https://logistics-alpha-steel.vercel.app/dashboard" style="display: inline-block; background-color: #15803d; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Check Dashboard</a>
                </div>
              </div>
            </div>
          `
        });
      }

      // --- GLOBAL DASHBOARD BELL NOTIFICATION ---
      // Insert a notification record for ALL users so the bell rings globally
      if (profiles && profiles.length > 0) {
        const notificationRecords = profiles.map(p => ({
          user_id: p.id,
          title: isStatusUpdate ? "Shipment Status Updated" : (isPaymentFailure ? "Payment Failed" : "Payment Successful"),
          message: isStatusUpdate
            ? `Shipment #${payload.record.shipment_id || shipmentId} changed to ${payload.record.status}`
            : `Payment ${payload.record.payment_status} for Shipment #${payload.record.shipment_id || shipmentId}`,
          type: 'shipment_update',
          metadata: { shipment_id: shipmentId }
        }));

        if (notificationRecords.length > 0) {
          await supabase.from('notifications').insert(notificationRecords);
        }
      }
      console.log(`✅ Webhook: Notified ${allRecipients.length} users via email and dashboard bell.`);
    } catch (err) {
      console.error("Global Webhook Notification Error:", err);
    }
  }

  res.status(200).json({ received: true });
});

/**
 * Webhook: Job Allocation
 */
app.post("/api/webhooks/jobs", async (req, res) => {
  const payload = req.body;
  const { type, record, old_record } = payload;

  if (!record) return res.status(400).json({ error: "Missing record in payload" });

  console.log(`📡 WEBHOOK: Received Job Event. Type: ${type}, Record:`, record.id);

  // 1. Handle Global Notification for NEW JOBS
  if (type === 'INSERT') {
    try {
      const { data: profiles } = await supabase.from('profiles').select('id');
      if (profiles) {
        const globalNotifications = profiles.map(p => ({
          user_id: p.id,
          title: "New Global Job Logged",
          message: `A new job #${record.job_no || record.id} has been created for ${record.client || 'a customer'}.`,
          type: 'assignment',
          job_id: record.id
        }));
        await supabase.from('notifications').insert(globalNotifications);
      }
    } catch (err) {
      console.error("Global Job Notification Error:", err);
    }
  }

  // 2. Check if job was assigned or re-assigned (for targeted notification)
  const isNewAssignment = record.assigned_to && (type === 'INSERT' || (old_record && record.assigned_to !== old_record.assigned_to));

  if (isNewAssignment) {
    try {
      // 1. Fetch user email
      let email = record.assigned_to?.includes('@') ? record.assigned_to : null;
      let fullName = 'Team Member';

      if (!email) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', record.assigned_to)
          .single();

        if (profile) {
          email = profile.email;
          fullName = profile.full_name || fullName;
        }
      }

      if (email) {
        // 2. Send Email
        await sendSealEmail({
          to: email,
          subject: "Job Allocation Request",
          title: "New Job Allocation Request",
          body: `You have received a new job allocation (Job ID: ${record.job_no || record.id}). Please review the details in your dashboard.`,
          actionLink: "https://logistics-alpha-steel.vercel.app/dashboard",
          actionText: "Open Dashboard",
          type: 'assignment'
        });

        // 3. Emit Socket.io event for real-time app notification
        io.to(record.assigned_to).emit("new_notification", {
          title: "New Job Assigned",
          message: `You have been assigned to Job #${record.job_no || record.id}`,
          type: 'assignment',
          job_id: record.id,
          timestamp: new Date().toISOString()
        });

        // 4. Save to notifications table
        await supabase.from('notifications').insert([{
          user_id: record.assigned_to,
          title: "New Job Assigned",
          message: `You have been assigned to Job #${record.job_no || record.id}`,
          type: 'assignment',
          job_id: record.id
        }]);
      }
    } catch (err) {
      console.error("Job Webhook Error:", err);
    }
  }

  res.status(200).json({ received: true });
});

/**
 * Webhook: Peer-to-Peer Tasks (Tickets)
 */
// Webhook Status (for browser checking)
app.get("/api/webhooks/tasks", (req, res) => {
  res.json({
    status: "active",
    message: "This endpoint is ready to receive POST webhooks from Supabase.",
    method_received: "GET",
    expected_method: "POST"
  });
});

app.post("/api/webhooks/tasks", async (req, res) => {
  const payload = req.body;
  const { type, record, old_record } = payload;

  if (!record) return res.status(400).json({ error: "Missing record in payload" });

  console.log(`📡 WEBHOOK: Received Task allocation via HTTP. Type: ${type}, Record:`, record.id);

  // Check if task is being newly assigned
  const isNewTask = record.receiver_id && (!old_record || record.receiver_id !== old_record.receiver_id);
  const isRestarted = type === 'UPDATE' && record.status === 'Pending' && old_record?.status === 'Completed';
  const isEdit = type === 'UPDATE' && !isRestarted &&
    (record.title !== old_record?.title || record.description !== old_record?.description || record.deadline_at !== old_record?.deadline_at);

  if (isNewTask || type === 'INSERT' || isRestarted || isEdit) {
    // Call the shared logic
    processTaskNotification(record, type, { isRestart: isRestarted, isEdit });
  }

  res.status(200).json({ received: true });
});

// --- SCHEDULED TASKS (Daily Reminders & Deadlines) ---

cron.schedule('0 9 * * *', async () => {
  console.log("⏰ Running daily job reminders...");

  try {
    // Find active jobs with assignments and upcoming deadlines
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: activeJobs } = await supabase
      .from('jobs')
      .select('*, profiles(email, full_name)')
      .not('assigned_to', 'is', null)
      .neq('status', 'completed');

    if (!activeJobs) return;

    for (const job of activeJobs) {
      const assignee = job.profiles;
      if (!assignee || !assignee.email) continue;

      const deadline = job.deadline_at ? new Date(job.deadline_at) : null;

      // 1. Daily Reminder (Basic)
      await sendSealEmail({
        to: assignee.email,
        subject: "Daily Job Reminder",
        title: "You have a job allocated",
        body: `This is a daily reminder for Job #${job.job_no || job.id}. Please ensure progress is tracked in the system.`,
        actionLink: "https://logistics-alpha-steel.vercel.app/dashboard",
        type: 'reminder'
      });

      // 2. Deadline approaching (within 24 hours)
      if (deadline && deadline > today && deadline <= tomorrow) {
        await sendSealEmail({
          to: assignee.email,
          subject: "Immediate Action: Deadline Approaching",
          title: "Action Required: Job Deadline",
          body: `The deadline for Job #${job.job_no || job.id} is in less than 24 hours (${deadline.toLocaleDateString()}). Please complete the task or update the status.`,
          actionLink: "https://logistics-alpha-steel.vercel.app/dashboard",
          type: 'deadline'
        });
      }

      // 3. Job Ended
      if (deadline && deadline < today) {
        await sendSealEmail({
          to: assignee.email,
          subject: "Job Timeframe Ended",
          title: "Notification: Job Overdue",
          body: `The allocated timeframe for Job #${job.job_no || job.id} has ended. If the work is still in progress, please update the deadline.`,
          actionLink: "https://logistics-alpha-steel.vercel.app/dashboard",
          type: 'deadline'
        });
      }
    }
  } catch (err) {
    console.error("Daily Cron Error:", err);
  }
});

/**
 * Create Payment Link (Razorpay)
 */
app.post("/api/payments/generate-link", async (req, res) => {
  const { amount, client_email, client_contact, shipment_no, reference_id, description } = req.body;

  const RAZORPAY_KEY_ID = process.env.VITE_RAZORPAY_KEY_ID;
  const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: "Razorpay credentials not configured in backend" });
  }

  try {
    const response = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from(RAZORPAY_KEY_ID + ":" + RAZORPAY_KEY_SECRET).toString("base64")
      },
      body: JSON.stringify({
        amount: Math.round(parseFloat(amount) * 100),
        currency: "INR",
        accept_partial: false,
        expire_by: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours expiry
        reference_id: reference_id?.toString() || shipment_no || "",
        description: description || `Payment for Shipment ${shipment_no}`,
        customer: {
          name: req.body.client_name || "Customer",
          email: client_email || "",
          contact: client_contact || ""
        },
        notify: {
          sms: false,
          email: !!client_email
        },
        reminder_enable: true,
        notes: {
          shipment_no: shipment_no
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.description || "Failed to create Razorypay link");
    }

    res.json({ success: true, link_id: data.id, short_url: data.short_url, status: data.status });
  } catch (err) {
    console.error("Razorpay link error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Razorpay Webhook
 * Handles events from Razorpay like payment_link.paid
 */
app.post("/api/webhooks/razorpay", express.json(), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  try {
    const crypto = require("crypto");
    // Verify Razorpay signature if secret is configured
    if (secret && req.headers['x-razorpay-signature']) {
      const shasum = crypto.createHmac("sha256", secret);
      shasum.update(JSON.stringify(req.body));
      const digest = shasum.digest("hex");

      if (digest !== req.headers["x-razorpay-signature"]) {
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    const { event, payload } = req.body;

    if (event === "payment_link.paid") {
      const paymentLink = payload.payment_link.entity;
      const shipmentId = paymentLink.reference_id;

      if (shipmentId) {
        // Find shipment by id or shipment_no
        const { data: shipment } = await supabase
          .from("shipments")
          .select("id")
          .eq("id", shipmentId) // Assuming reference_id was set to shipment.id
          .single();

        if (shipment) {
          // Update shipment status -> this triggers our Supabase webhook for Resend mails!
          await supabase
            .from("shipments")
            .update({ payment_status: "paid" })
            .eq("id", shipment.id);

          // Record payment transaction
          await supabase
            .from("payments")
            .insert([{
              shipment_id: shipment.id,
              amount: paymentLink.amount_paid / 100, // convert from paise
              currency: "INR",
              status: "paid",
              payment_method: "razorpay_link",
              link_id: paymentLink.id,
              paid_at: new Date().toISOString()
            }]);
        }
      }
    }

    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Razorpay Webhook Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- Socket.IO Connection Handler ---
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  // When a user logs in / connects, they join their own private room
  socket.on("join", (userId) => {
    if (userId) {
      socket.join(userId);
      console.log(`👤 User joined room: ${userId}`);
    }
  });

  // When they open a group chat, join the group's room
  socket.on("join_group", (groupId) => {
    if (groupId) {
      socket.join(`group_${groupId}`);
      console.log(`👥 User joined group room: group_${groupId}`);
    }
  });

  socket.on("leave_group", (groupId) => {
    if (groupId) {
      socket.leave(`group_${groupId}`);
      console.log(`🚪 User left group room: group_${groupId}`);
    }
  });

  // The core message forwarding logic
  socket.on("send_message", (messageData) => {
    // ROBUSTNESS: Ensure data exists before processing
    if (!messageData || (!messageData.isGroup && !messageData.receiver_id)) {
      console.warn("⚠️ Invalid message packet received:", messageData);
      return;
    }

    console.log(`📨 Relaying message from ${messageData.sender_id} to ${messageData.isGroup ? `group_${messageData.conversation_id}` : messageData.receiver_id}`);

    if (messageData.isGroup && messageData.conversation_id) {
      // Broadcast to everyone in the group room
      io.to(`group_${messageData.conversation_id}`).emit("receive_message", messageData);
    } else if (messageData.receiver_id) {
      // Forward directly to the receiving user
      io.to(messageData.receiver_id).emit("receive_message", messageData);

      // Also bounce back to sender (in case they have multiple tabs open)
      io.to(messageData.sender_id).emit("receive_message", messageData);
    }
  });

  // Keep-alive/ping logic
  socket.on("heartbeat", () => {
    socket.emit("heartbeat_ack");
  });

  socket.on("user_typing", (data) => {
    if (!data) return;
    if (data.isGroup && data.conversation_id) {
      socket.to(`group_${data.conversation_id}`).emit("user_typing", data);
    } else if (data.receiver_id) {
      socket.to(data.receiver_id).emit("user_typing", data);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ Client disconnected: ${socket.id} (${reason})`);
  });
});

// Start the server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║         WEBSOCKET MESSAGING BACKEND RUNNING        ║
╚════════════════════════════════════════════════════╝
🚀 Server running on port ${PORT}
📍 Health check: http://localhost:${PORT}/api/health
  `);
});
