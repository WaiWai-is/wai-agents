import type { Server as SocketIOServer } from 'socket.io';

// userId → set of active socketIds
const presenceMap = new Map<string, Set<string>>();
// userId → pending disconnect timeout handle
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

const RECONNECT_GRACE_MS = 30_000;

export function addToPresence(io: SocketIOServer, userId: string, socketId: string): void {
  // Cancel pending removal if user reconnects within grace period
  const existing = disconnectTimers.get(userId);
  if (existing) {
    clearTimeout(existing);
    disconnectTimers.delete(userId);
  }

  const sockets = presenceMap.get(userId) ?? new Set();
  const wasOffline = sockets.size === 0;
  sockets.add(socketId);
  presenceMap.set(userId, sockets);

  if (wasOffline) {
    io.emit('presence:update', { userId, online: true });
  }
}

export function removeFromPresence(io: SocketIOServer, userId: string, socketId: string): void {
  const sockets = presenceMap.get(userId);
  if (sockets) {
    sockets.delete(socketId);
  }

  // If user still has other active sockets, no need to start a disconnect timer
  if (sockets && sockets.size > 0) return;

  const timer = setTimeout(() => {
    disconnectTimers.delete(userId);

    // Re-check in case user reconnected during the grace period
    const currentSockets = presenceMap.get(userId);
    if (currentSockets && currentSockets.size > 0) return;

    presenceMap.delete(userId);
    io.emit('presence:update', { userId, online: false });
  }, RECONNECT_GRACE_MS);

  // Clear any existing timer for this user before setting a new one
  const existingTimer = disconnectTimers.get(userId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  disconnectTimers.set(userId, timer);
}

export function getOnlineUsers(): string[] {
  return Array.from(presenceMap.keys());
}

export function isUserOnline(userId: string): boolean {
  const sockets = presenceMap.get(userId);
  return sockets !== undefined && sockets.size > 0;
}
