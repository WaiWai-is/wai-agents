import { randomUUID } from 'node:crypto';
import { emitAgentEvent } from '../../ws/emitter.js';

export type ApprovalScope = 'allow_once' | 'allow_session' | 'allow_always' | 'deny';

export interface ApprovalDecision {
  approved: boolean;
  scope: ApprovalScope;
}

interface PendingRequest {
  resolve: (decision: ApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
  conversationId: string;
  toolName: string;
}

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * ApprovalGate manages pending tool approval requests for agent loops.
 *
 * - requestApproval() emits a Socket.IO event and returns a Promise that resolves
 *   when the client sends a decision (or auto-denies after timeout).
 * - resolveApproval() is called by the socket handler when the client responds.
 * - Session and always caches skip the gate for previously-approved tools.
 */
export class ApprovalGate {
  /** Pending requests keyed by requestId */
  private pending = new Map<string, PendingRequest>();

  /** Session-level approvals: conversationId -> Set<toolName> */
  private sessionCache = new Map<string, Set<string>>();

  /** Always-level approvals: conversationId -> Set<toolName> */
  private alwaysCache = new Map<string, Set<string>>();

  /**
   * Check if a tool is already approved via session or always cache.
   */
  isApproved(conversationId: string, toolName: string): boolean {
    const always = this.alwaysCache.get(conversationId);
    if (always?.has(toolName)) return true;

    const session = this.sessionCache.get(conversationId);
    if (session?.has(toolName)) return true;

    return false;
  }

  /**
   * Request approval for a tool call. Emits a `tool_approval_request` agent event
   * and returns a Promise that resolves when the user decides or the timeout fires.
   */
  requestApproval(
    conversationId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ApprovalDecision> {
    const requestId = randomUUID();
    const argsPreview = JSON.stringify(args);
    const scopes: string[] = ['allow_once', 'allow_session', 'allow_always'];

    emitAgentEvent(conversationId, {
      type: 'tool_approval_request',
      request_id: requestId,
      tool_name: toolName,
      args_preview: argsPreview,
      scopes,
    });

    return new Promise<ApprovalDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ approved: false, scope: 'deny' });
      }, APPROVAL_TIMEOUT_MS);

      this.pending.set(requestId, {
        resolve,
        timer,
        conversationId,
        toolName,
      });
    });
  }

  /**
   * Resolve a pending approval request. Called by the Socket.IO handler.
   */
  resolveApproval(requestId: string, decision: 'approve' | 'deny', scope: ApprovalScope): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.pending.delete(requestId);

    const approved = decision === 'approve';

    if (approved && scope === 'allow_session') {
      let set = this.sessionCache.get(entry.conversationId);
      if (!set) {
        set = new Set();
        this.sessionCache.set(entry.conversationId, set);
      }
      set.add(entry.toolName);
    }

    if (approved && scope === 'allow_always') {
      let set = this.alwaysCache.get(entry.conversationId);
      if (!set) {
        set = new Set();
        this.alwaysCache.set(entry.conversationId, set);
      }
      set.add(entry.toolName);
    }

    entry.resolve({ approved, scope });
  }

  /**
   * Clear session cache for a conversation (e.g. when session ends).
   */
  clearSession(conversationId: string): void {
    this.sessionCache.delete(conversationId);
  }

  /**
   * Get the number of pending requests (for testing).
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Clean up all pending requests and timers.
   */
  destroy(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve({ approved: false, scope: 'deny' });
    }
    this.pending.clear();
    this.sessionCache.clear();
    this.alwaysCache.clear();
  }
}

/**
 * Singleton gate instance shared between agent loops and the socket handler.
 */
export const approvalGate = new ApprovalGate();
