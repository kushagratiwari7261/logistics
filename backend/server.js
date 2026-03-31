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
    const greeting = type === 'morning' ? "Good Morning!" : "Good Night!";
    const bodyText = type === 'morning' 
      ? "Have a productive day ahead with Seal Freight. We are here to keep your logistics moving smoothly." 
      : "The system is okay. All your shipments and data are secure. Sleep well, we've got you covered.";

    // 2. Batch send (Resend supports up to 100 recips per call in some plans, but simple loop is safer for now)
    const results = await Promise.allSettled(users.filter(u => u.email).map(user => 
      resend.emails.send({
        from: 'Seal Freight <notifications@sealfreight.com>', // Note: Needs domain verification in Resend dashboard
        to: user.email,
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #4f46e5;">Hello ${user.full_name || 'there'}!</h2>
            <p style="font-size: 16px; line-height: 1.5; color: #374151;">${greeting}</p>
            <p style="font-size: 16px; line-height: 1.5; color: #374151;">${bodyText}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #9ca3af;">This is an automated system check from Seal Freight Logistics Platform.</p>
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
 * Checks for failed/pending payments
 */
app.get("/api/cron/payments", async (req, res) => {
  if (!resend) return res.status(500).json({ error: "Resend API key not configured" });

  try {
    // Note: Assuming a 'payments' or 'shipments' table has a 'payment_status' 
    // This part is illustrative based on schema check earlier
    const { data: failedPayments, error } = await supabase
      .from('shipments')
      .select('id, amount, vendorName, email')
      .eq('payment_status', 'failed'); // Example status

    if (error) throw error;
    if (!failedPayments || failedPayments.length === 0) return res.json({ msg: "No failed payments today" });

    for (const payment of failedPayments) {
      if (payment.email) {
        await resend.emails.send({
          from: 'Seal Freight Alerts <alerts@sealfreight.com>',
          to: payment.email,
          subject: "⚠️ Payment Failed - Seal Freight System",
          html: `<h3>Hello! Checkout the payment failed.</h3><p>Your payment for shipment #${payment.id} has failed. Please log in to resolve this issue.</p>`
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
 * Triggered by Supabase Webhook when 'shipments' table is updated
 */
app.post("/api/webhooks/shipments", async (req, res) => {
  const payload = req.body; // Supabase webhook sends the row data
  
  // payload.record = current row, payload.old_record = previous row
  if (payload.type === 'UPDATE' && payload.record.status !== payload.old_record.status) {
    const shipmentId = payload.record.id;
    const newStatus = payload.record.status;
    const trackingUrl = `https://logistics-alpha-steel.vercel.app/tracking?id=${shipmentId}`;
    const whatsappMsg = encodeURIComponent(`Hello! My shipment #${shipmentId} status has been updated to: ${newStatus}. Check it here: ${trackingUrl}`);
    const whatsappLink = `https://wa.me/?text=${whatsappMsg}`;

    if (!resend) return res.status(200).json({ msg: "Webhook received but Resend not config" });

    try {
      // Notify all users as requested
      const { data: users } = await supabase.from('profiles').select('email');
      
      const recipients = users.map(u => u.email).filter(Boolean);
      
      if (recipients.length > 0) {
        await resend.emails.send({
          from: 'Seal Freight System <system@sealfreight.com>',
          to: recipients,
          subject: `📦 Shipment Updated: #${shipmentId}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Shipment Status Updated!</h2>
              <p>Shipment #${shipmentId} is now: <strong>${newStatus}</strong></p>
              <br>
              <a href="${trackingUrl}" style="background: #4f46e5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Shipment</a>
              <br><br>
              <p>Share this update:</p>
              <a href="${whatsappLink}" style="color: #25D366; font-weight: bold;">Share on WhatsApp</a>
            </div>
          `
        });
      }
    } catch (err) {
      console.error("Webhook mail error:", err);
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
