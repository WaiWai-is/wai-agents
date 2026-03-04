import { Server as SocketIOServer } from 'socket.io';
import { jwtVerify } from 'jose';
import type { IncomingMessage, Server as HttpServer } from 'http';
import { setupConversationHandlers } from './conversation-channel.js';
import { setupAgentHandlers } from './agent-channel.js';
import { setupUserHandlers } from './user-channel.js';
import { setIO } from './emitter.js';
import { addToPresence, removeFromPresence } from './presence.js';

export function createSocketServer(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'https://openraccoon.com'],
      credentials: true,
    },
    path: '/socket.io',
  });

  const jwtSecretValue = process.env.JWT_SECRET || (() => {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
    return 'dev-secret-change-in-production';
  })();
  const jwtSecret = new TextEncoder().encode(jwtSecretValue);

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const { payload } = await jwtVerify(token, jwtSecret);
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
