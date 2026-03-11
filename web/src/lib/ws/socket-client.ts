import { io, type Socket } from 'socket.io-client';

// biome-ignore lint/suspicious/noExplicitAny: Socket.IO callbacks require any[] for compatibility
type AnyCallback = (...args: any[]) => void;

type ListenerEntry = {
  event: string;
  callback: AnyCallback;
};

function resolveSocketUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  return 'ws://127.0.0.1:4000';
}

export class SocketClient {
  private socket: Socket | null = null;
  private listeners: ListenerEntry[] = [];
  private joinedConversationRooms = new Set<string>();
  private joinedAgentRooms = new Set<string>();

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    const url = resolveSocketUrl();
    this.socket = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
    });

    this.socket.on('connect', () => {
      console.log('[WS] connected, id:', this.socket?.id);
      this.resubscribe();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[WS] connection error:', err.message);
    });

    // Apply all existing listeners
    for (const entry of this.listeners) {
      this.socket.on(entry.event, entry.callback);
    }
  }

  disconnect(): void {
    if (!this.socket) {
      return;
    }
    this.socket.disconnect();
    this.socket = null;
    this.joinedConversationRooms.clear();
    this.joinedAgentRooms.clear();
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  joinConversation(conversationId: string): void {
    if (!this.socket) {
      return;
    }
    this.joinedConversationRooms.add(conversationId);
    this.socket.emit('join:conversation', conversationId);
  }

  leaveConversation(conversationId: string): void {
    if (!this.socket) {
      return;
    }
    this.joinedConversationRooms.delete(conversationId);
    this.socket.emit('leave:conversation', conversationId);
  }

  joinAgent(conversationId: string): void {
    if (!this.socket) {
      return;
    }
    this.joinedAgentRooms.add(conversationId);
    this.socket.emit('join:agent', conversationId);
  }

  leaveAgent(conversationId: string): void {
    if (!this.socket) {
      return;
    }
    this.joinedAgentRooms.delete(conversationId);
    this.socket.emit('leave:agent', conversationId);
  }

  onMessage(callback: (msg: Record<string, unknown>) => void): () => void {
    return this.addListener('message:new', callback);
  }

  onMessageUpdated(callback: (msg: Record<string, unknown>) => void): () => void {
    return this.addListener('message:updated', callback);
  }

  onMessageDeleted(callback: (msg: Record<string, unknown>) => void): () => void {
    return this.addListener('message:deleted', callback);
  }

  onAgentEvent(callback: (event: AgentStreamEvent) => void): () => void {
    return this.addListener('agent:event', callback);
  }

  onTyping(
    callback: (data: { conversationId: string; userId: string; isTyping: boolean }) => void,
  ): () => void {
    const listeners: Array<ListenerEntry> = [
      {
        event: 'typing',
        callback: (payload: { conversationId: string; userId: string; isTyping?: boolean }) => {
          callback({
            conversationId: payload.conversationId,
            userId: payload.userId,
            isTyping: payload.isTyping ?? true,
          });
        },
      },
      {
        event: 'typing:start',
        callback: (payload: { conversationId: string; userId: string }) => {
          callback({ ...payload, isTyping: true });
        },
      },
      {
        event: 'typing:stop',
        callback: (payload: { conversationId: string; userId: string }) => {
          callback({ ...payload, isTyping: false });
        },
      },
    ];

    return this.addListeners(listeners);
  }

  onPresence(callback: (data: { userId: string; online: boolean }) => void): () => void {
    const listeners: Array<ListenerEntry> = [
      {
        event: 'presence:update',
        callback: (payload: { userId: string; online: boolean }) => {
          callback(payload);
        },
      },
      {
        event: 'presence:snapshot',
        callback: (payload: { onlineUsers?: string[] }) => {
          for (const userId of payload.onlineUsers ?? []) {
            callback({ userId, online: true });
          }
        },
      },
    ];

    return this.addListeners(listeners);
  }

  emitTyping(conversationId: string): void {
    this.socket?.emit('typing:start', conversationId);
  }

  emitStopTyping(conversationId: string): void {
    this.socket?.emit('typing:stop', conversationId);
  }

  emitRead(conversationId: string, messageId: string): void {
    this.socket?.emit('read', { conversationId, messageId });
  }

  emitApprovalDecision(
    conversationId: string,
    requestId: string,
    decision: 'approve' | 'deny',
    scope: string = 'allow_once',
  ): void {
    this.socket?.emit('approval_decision', {
      conversationId,
      requestId,
      decision,
      scope,
    });
  }

  emitStopAgent(conversationId: string): void {
    this.socket?.emit('agent:stop', { conversationId });
  }

  private addListener(event: string, callback: AnyCallback): () => void {
    const entry: ListenerEntry = { event, callback };
    this.listeners.push(entry);

    if (this.socket) {
      this.socket.on(event, callback);
    }

    return () => {
      this.listeners = this.listeners.filter((e) => e !== entry);
      if (this.socket) {
        this.socket.off(event, callback);
      }
    };
  }

  private addListeners(entries: ListenerEntry[]): () => void {
    for (const entry of entries) {
      this.listeners.push(entry);
      if (this.socket) {
        this.socket.on(entry.event, entry.callback);
      }
    }

    return () => {
      this.listeners = this.listeners.filter((entry) => !entries.includes(entry));
      if (this.socket) {
        for (const entry of entries) {
          this.socket.off(entry.event, entry.callback);
        }
      }
    };
  }

  private resubscribe(): void {
    // Re-join rooms after reconnection
    for (const roomId of this.joinedConversationRooms) {
      this.socket?.emit('join:conversation', roomId);
    }

    for (const roomId of this.joinedAgentRooms) {
      this.socket?.emit('join:agent', roomId);
    }
  }
}

export type AgentStreamEvent = {
  type:
    | 'run_started'
    | 'text_delta'
    | 'tool_call_start'
    | 'tool_call_end'
    | 'thinking'
    | 'run_finished'
    | 'run_error'
    | 'status'
    | 'tool_approval_request';
  runId?: string;
  agentId?: string;
  conversationId?: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  durationMs?: number;
  usage?: { inputTokens: number; outputTokens: number };
  message?: string;
  error?: string;
  // Tool approval request fields
  request_id?: string;
  tool_name?: string;
  args_preview?: string;
  scopes?: string[];
};
