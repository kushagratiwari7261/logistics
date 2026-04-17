import { useEffect } from 'react';
import { io } from 'socket.io-client';

// Intelligent URL detection
const getSocketUrl = () => {
  if (import.meta.env.VITE_WEBSOCKET_URL) return import.meta.env.VITE_WEBSOCKET_URL;

  // Default fallbacks based on environment
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocal
    ? 'http://localhost:3001'
    : 'https://logistics-production-5141.up.railway.app';
};

export const socket = io(getSocketUrl(), {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  transports: ['websocket'],
});

export const useMessageSubscription = (userId, callback) => {
  useEffect(() => {
    if (!userId) return;

    console.log('🔌 Connecting to WebSocket message subscription for user:', userId);

    socket.emit('join', userId);

    const handleNewMessage = (payload) => {
      console.log('📨 New message received via WebSocket:', payload);
      if (typeof callback === 'function') {
        callback(payload);
      }
    };

    socket.on('receive_message', handleNewMessage);

    // Cleanup function: only unbind the listener, don't close the entire socket
    return () => {
      socket.off('receive_message', handleNewMessage);
    };
  }, [userId]); // Remove callback from dependencies to prevent the infinite reconnect loop
};

export default useMessageSubscription;