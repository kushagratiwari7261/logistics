import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from 'url';

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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "websocket-messaging" });
});

app.get("/", (req, res) => {
  res.send("WebSocket Messaging Server is running.");
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
    // messageData expects: sender_id, receiver_id, conversation_id, isGroup
    console.log("📨 Received message to forward:", messageData);

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

  socket.on("user_typing", (data) => {
    // data expects: sender_id, receiver_id, conversation_id, isGroup
    if (data.isGroup && data.conversation_id) {
      socket.to(`group_${data.conversation_id}`).emit("user_typing", data);
    } else if (data.receiver_id) {
      socket.to(data.receiver_id).emit("user_typing", data);
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
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
