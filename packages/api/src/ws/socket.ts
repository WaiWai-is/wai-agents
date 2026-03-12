import type { Server as HttpServer } from 'node:http';
import { jwtVerify } from 'jose';
import { Server as SocketIOServer } from 'socket.io';
import { JWT_SECRET_STRING } from '../modules/auth/auth.service.js';
import { isTokenBlacklisted } from '../modules/auth/token-blacklist.js';
import { setupAgentHandlers } from './agent-channel.js';
import { setupConversationHandlers } from './conversation-channel.js';
import { setIO } from './emitter.js';
import { addToPresence, removeFromPresence } from './presence.js';
import { setupUserHandlers } from './user-channel.js';

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'https://openraccoon.com'],
      credentials: true,
    },
    path: '/socket.io',
  });

  const jwtSecret = new TextEncoder().encode(JWT_SECRET_STRING);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      if (isTokenBlacklisted(token)) {
        return next(new Error('Token has been revoked'));
      }
      const { payload } = await jwtVerify(token, jwtSecret);
      if (payload.type === 'refresh') {
        return next(new Error('Refresh tokens cannot be used for WebSocket auth'));
      }
      const userId = payload.sub as string;
      if (!userId) {
        return next(new Error('Invalid token: missing subject'));
      }
      socket.data.userId = userId;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;

    // Auto-join user to their personal room
    socket.join(`user:${userId}`);
    addToPresence(io, userId, socket.id);

    socket.on('disconnect', () => {
      removeFromPresence(io, userId, socket.id);
    });
  });

  setIO(io);
  setupConversationHandlers(io);
  setupAgentHandlers(io);
  setupUserHandlers(io);

  return io;
}
