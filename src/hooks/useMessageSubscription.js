import { useEffect } from 'react';
import { io } from 'socket.io-client';

// Connect to the backend (assumes backend runs on same host or uses Vite proxy/env var)
// We default to port 3001 if locally developing
const SOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:3001';
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  reconnection: true,
});

export const useMessageSubscription = (userId, callback) => {
  useEffect(() => {
    if (!userId) return;

    console.log('🔌 Connecting to WebSocket message subscription for user:', userId);

    socket.emit('join', userId);

    const handleNewMessage = (payload) => {
      console.log('📨 New message received via WebSocket:', payload);
      callback(payload);
    };

    socket.on('receive_message', handleNewMessage);

    // Cleanup function
    return () => {
      console.log('Cleaning up WebSocket message subscription');
      socket.off('receive_message', handleNewMessage);
    };
  }, [userId, callback]);
};

export default useMessageSubscription;