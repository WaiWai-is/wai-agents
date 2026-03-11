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
  abortHandler?: () => void;
  conversationId: string;
  toolName: string;
}

const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum consecutive denials per tool before auto-blocking for the rest of the run */
const MAX_DENIALS_PER_TOOL = 3;

/**
 * ApprovalGate manages pending tool approval requests for agent loops.
 *
 * - requestApproval() emits a Socket.IO event and returns a Promise that resolves
 *   when the client sends a decision (or auto-denies after timeout / abort).
 * - resolveApproval() is called by the socket handler when the client responds.
 * - Session and always caches skip the gate for previously-approved tools.
 * - Denial counts track repeated denials to prevent infinite retry loops.
 */
export class ApprovalGate {
  /** Pending requests keyed by requestId */
  private pending = new Map<string, PendingRequest>();

  /** Session-level approvals: conversationId -> Set<toolName> */
  private sessionCache = new Map<string, Set<string>>();

  /** Always-level approvals: conversationId -> Set<toolName> */
  private alwaysCache = new Map<string, Set<string>>();

  /** Denial counts: conversationId -> Map<toolName, count> */
  private denialCounts = new Map<string, Map<string, number>>();

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
   * Check if a tool has been denied too many times and should be auto-blocked.
   */
  isDeniedTooManyTimes(conversationId: string, toolName: string): boolean {
    const counts = this.denialCounts.get(conversationId);
    if (!counts) return false;
    return (counts.get(toolName) ?? 0) >= MAX_DENIALS_PER_TOOL;
  }

  /**
   * Record a denial for a tool in a conversation.
   */
  private recordDenial(conversationId: string, toolName: string): void {
    let counts = this.denialCounts.get(conversationId);
    if (!counts) {
      counts = new Map();
      this.denialCounts.set(conversationId, counts);
    }
    counts.set(toolName, (counts.get(toolName) ?? 0) + 1);
  }

  /**
   * Reset denial count for a tool when it gets approved.
   */
  private resetDenials(conversationId: string, toolName: string): void {
    const counts = this.denialCounts.get(conversationId);
    if (counts) {
      counts.delete(toolName);
    }
  }

  /**
   * Request approval for a tool call. Emits a `tool_approval_request` agent event
   * and returns a Promise that resolves when the user decides, the timeout fires,
   * or the abort signal fires.
   */
  requestApproval(
    conversationId: string,
    toolName: string,
    args: Record<string, unknown>,
    abortSignal?: AbortSignal,
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
      // If already aborted, deny immediately
      if (abortSignal?.aborted) {
        resolve({ approved: false, scope: 'deny' });
        return;
      }

      const cleanup = () => {
        const entry = this.pending.get(requestId);
        if (!entry) return;
        clearTimeout(entry.timer);
        if (entry.abortHandler && abortSignal) {
          abortSignal.removeEventListener('abort', entry.abortHandler);
        }
        this.pending.delete(requestId);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({ approved: false, scope: 'deny' });
      }, APPROVAL_TIMEOUT_MS);

      const abortHandler = abortSignal
        ? () => {
            cleanup();
            resolve({ approved: false, scope: 'deny' });
          }
        : undefined;

      this.pending.set(requestId, {
        resolve: (decision: ApprovalDecision) => {
          cleanup();
          resolve(decision);
        },
        timer,
        abortHandler,
        conversationId,
        toolName,
      });

      if (abortSignal && abortHandler) {
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  /**
   * Resolve a pending approval request. Called by the Socket.IO handler.
   */
  resolveApproval(requestId: string, decision: 'approve' | 'deny', scope: ApprovalScope): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;

    const approved = decision === 'approve';

    if (approved && scope === 'allow_session') {
      let set = this.sessionCache.get(entry.conversationId);
      if (!set) {
        set = new Set();
        this.sessionCache.set(entry.conversationId, set);
      }
      set.add(entry.toolName);
      this.resetDenials(entry.conversationId, entry.toolName);
    }

    if (approved && scope === 'allow_always') {
      let set = this.alwaysCache.get(entry.conversationId);
      if (!set) {
        set = new Set();
        this.alwaysCache.set(entry.conversationId, set);
      }
      set.add(entry.toolName);
      this.resetDenials(entry.conversationId, entry.toolName);
    }

    if (approved && scope === 'allow_once') {
      this.resetDenials(entry.conversationId, entry.toolName);
    }

    if (!approved) {
      this.recordDenial(entry.conversationId, entry.toolName);
    }

    // entry.resolve calls cleanup() internally, which clears timer and abort listener
    entry.resolve({ approved, scope });
  }

  /**
   * Cancel all pending requests for a conversation (e.g. when the agent loop ends).
   */
  cancelPending(conversationId: string): void {
    // Collect matching entries first to avoid modifying the map during iteration
    const toCancel: PendingRequest[] = [];
    for (const entry of this.pending.values()) {
      if (entry.conversationId === conversationId) {
        toCancel.push(entry);
      }
    }
    for (const entry of toCancel) {
      entry.resolve({ approved: false, scope: 'deny' });
    }
  }

  /**
   * Clear session cache and always cache for a conversation (e.g. when session ends).
   */
  clearSession(conversationId: string): void {
    this.sessionCache.delete(conversationId);
    this.alwaysCache.delete(conversationId);
    this.denialCounts.delete(conversationId);
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
    this.denialCounts.clear();
  }
}

/**
 * Singleton gate instance shared between agent loops and the socket handler.
 */
export const approvalGate = new ApprovalGate();
