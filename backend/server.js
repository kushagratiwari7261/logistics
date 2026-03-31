import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

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

// Flexible CORS setup
app.use(
  cors({
    origin: "*", 
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json());

// Basic health check routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "websocket-messaging" });
});

// --- NOTIFICATION ENDPOINTS ---

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

    const subject = type === 'morning' ? "Good Morning from Seal Freight System ☀️" : "Good Night from Seal Freight System 🌙";
    const greeting = type === 'morning' ? "Good Morning" : "Good Night";
    const bodyText = type === 'morning' 
      ? "Have a productive day ahead with Seal Freight. We are here to keep your logistics moving smoothly." 
      : "The system is okay. All your shipments and data are secure. Sleep well, we've got you covered.";

    const logoUrl = "https://xgihvwtiaqkpusrdvclk.supabase.co/storage/v1/object/public/assets/seal.png";

    // 2. Send emails with premium template
    const results = await Promise.allSettled(users.filter(u => u.email).map(user => 
      resend.emails.send({
        from: 'Seal Freight <system@prudata.info>',
        to: user.email,
        subject: subject,
        html: `
          <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 40px 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <div style="background-color: #4f46e5; padding: 30px; text-align: center;">
                <img src="${logoUrl}" alt="Seal Freight" style="height: 50px; filter: brightness(0) invert(1);">
              </div>
              <div style="padding: 40px;">
                <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #111827;">${greeting}, ${user.full_name || 'there'}!</h1>
                <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #4b5563;">${bodyText}</p>
                <div style="padding: 20px; background-color: #f3f4f6; border-radius: 8px; text-align: center;">
                  <p style="margin: 0; font-size: 14px; font-weight: 600; color: #374151;">System Status: <span style="color: #10b981;">● Online & Secure</span></p>
                </div>
              </div>
              <div style="padding: 20px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #f3f4f6;">
                <p style="margin: 0; font-size: 12px; color: #9ca3af;">&copy; 2024 Seal Freight Logistics Platform. All rights reserved.</p>
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

    const logoUrl = "https://xgihvwtiaqkpusrdvclk.supabase.co/storage/v1/object/public/assets/seal.png";

    for (const payment of failedPayments) {
      if (payment.email) {
        await resend.emails.send({
          from: 'Seal Freight Alerts <alerts@prudata.info>',
          to: payment.email,
          subject: "⚠️ Action Required: Payment Failed",
          html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #fff5f5; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #feb2b2;">
                <div style="background-color: #c53030; padding: 30px; text-align: center;">
                  <img src="${logoUrl}" alt="Seal Freight" style="height: 50px; filter: brightness(0) invert(1);">
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
  const logoUrl = "https://xgihvwtiaqkpusrdvclk.supabase.co/storage/v1/object/public/assets/seal.png";
  
  const isStatusUpdate = payload.type === 'UPDATE' && payload.record.status !== payload.old_record.status;
  const isPaymentFailure = payload.type === 'UPDATE' && payload.record.payment_status === 'failed' && payload.old_record.payment_status !== 'failed';
  
  if (isStatusUpdate || isPaymentFailure) {
    const shipmentId = payload.record.id;
    
    if (!resend) return res.status(200).json({ msg: "Webhook received but Resend not config" });

    try {
      // Fetch all users to notify everyone as requested
      const { data: profiles } = await supabase.from('profiles').select('email');
      const allRecipients = profiles ? profiles.map(p => p.email).filter(e => e && e.includes('@')) : [];

      if (allRecipients.length === 0) {
        console.warn("No valid profile emails found for notification.");
        return res.status(200).json({ received: true, msg: "No recipients" });
      }

      if (isStatusUpdate) {
        const newStatus = payload.record.status;
        const trackingUrl = `https://logistics-alpha-steel.vercel.app/tracking?id=${shipmentId}`;
        const whatsappMsg = encodeURIComponent(`📦 *Shipment Update from Seal Freight*\nShipment #${shipmentId} status is now: *${newStatus}*\n\nTrack here: ${trackingUrl}`);
        const whatsappLink = `https://wa.me/?text=${whatsappMsg}`;

        await resend.emails.send({
          from: 'Seal Freight System <system@prudata.info>',
          to: allRecipients,
          subject: `📦 Status Update: Shipment #${shipmentId}`,
          html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #f9fafb; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <div style="background-color: #4f46e5; padding: 30px; text-align: center;">
                  <img src="${logoUrl}" alt="Seal Freight" style="height: 50px; filter: brightness(0) invert(1);">
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
                  <p style="margin: 0; font-size: 12px; color: #9ca3af;">This is an automated notification from Seal Freight. Team update regarding Shipment #${shipmentId}.</p>
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
          from: 'Seal Freight Alerts <alerts@prudata.info>',
          to: allRecipients,
          subject: "⚠️ Critical: Payment Failed",
          html: `
            <div style="font-family: 'Inter', Helvetica, Arial, sans-serif; background-color: #fff5f5; padding: 40px 0;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #feb2b2;">
                <div style="background-color: #c53030; padding: 30px; text-align: center;">
                  <img src="${logoUrl}" alt="Seal Freight" style="height: 50px; filter: brightness(0) invert(1);">
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
    } catch (err) {
      console.error("Global Webhook Notification Error:", err);
    }
  }

  res.status(200).json({ received: true });
});

// Setup Server and Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  },
});

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
