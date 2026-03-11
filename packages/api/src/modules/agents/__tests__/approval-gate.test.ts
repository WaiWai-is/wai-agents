import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock emitter before importing the module under test
vi.mock('../../../ws/emitter.js', () => ({
  emitAgentEvent: vi.fn(),
}));

import { emitAgentEvent } from '../../../ws/emitter.js';
import { ApprovalGate } from '../approval-gate.js';

/** Helper to extract requestId from the nth emitAgentEvent call */
function getRequestId(callIndex: number): string {
  return (vi.mocked(emitAgentEvent).mock.calls[callIndex][1] as { request_id: string }).request_id;
}

describe('ApprovalGate', () => {
  let gate: ApprovalGate;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    gate = new ApprovalGate();
  });

  afterEach(() => {
    gate.destroy();
    vi.useRealTimers();
  });

  it('emits tool_approval_request event and returns a pending promise', async () => {
    const promise = gate.requestApproval('conv-1', 'web_search', { query: 'test' });

    expect(emitAgentEvent).toHaveBeenCalledWith('conv-1', {
      type: 'tool_approval_request',
      request_id: expect.any(String),
      tool_name: 'web_search',
      args_preview: '{"query":"test"}',
      scopes: ['allow_once', 'allow_session', 'allow_always'],
    });
    expect(gate.pendingCount).toBe(1);

    // Resolve it to clean up
    gate.resolveApproval(getRequestId(0), 'approve', 'allow_once');

    const decision = await promise;
    expect(decision.approved).toBe(true);
  });

  it('approval flow: request -> approve -> resolves with approved=true', async () => {
    const promise = gate.requestApproval('conv-1', 'dangerous_tool', { arg: 'value' });

    gate.resolveApproval(getRequestId(0), 'approve', 'allow_once');

    const decision = await promise;
    expect(decision.approved).toBe(true);
    expect(decision.scope).toBe('allow_once');
    expect(gate.pendingCount).toBe(0);
  });

  it('denial flow: request -> deny -> resolves with approved=false', async () => {
    const promise = gate.requestApproval('conv-1', 'dangerous_tool', { arg: 'value' });

    gate.resolveApproval(getRequestId(0), 'deny', 'deny');

    const decision = await promise;
    expect(decision.approved).toBe(false);
    expect(decision.scope).toBe('deny');
    expect(gate.pendingCount).toBe(0);
  });

  it('timeout: auto-denies after 5 minutes', async () => {
    const promise = gate.requestApproval('conv-1', 'slow_tool', {});

    expect(gate.pendingCount).toBe(1);

    // Advance time by 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000);

    const decision = await promise;
    expect(decision.approved).toBe(false);
    expect(decision.scope).toBe('deny');
    expect(gate.pendingCount).toBe(0);
  });

  it('session cache: allow_session skips gate for same tool on subsequent calls', async () => {
    // First call: request approval
    const promise = gate.requestApproval('conv-1', 'web_search', { query: 'first' });

    gate.resolveApproval(getRequestId(0), 'approve', 'allow_session');
    await promise;

    // Now the tool should be cached
    expect(gate.isApproved('conv-1', 'web_search')).toBe(true);

    // Different tool should NOT be cached
    expect(gate.isApproved('conv-1', 'other_tool')).toBe(false);

    // Different conversation should NOT be cached
    expect(gate.isApproved('conv-2', 'web_search')).toBe(false);
  });

  it('always cache: allow_always skips gate for same tool on subsequent calls', async () => {
    const promise = gate.requestApproval('conv-1', 'code_exec', { code: 'print("hi")' });

    gate.resolveApproval(getRequestId(0), 'approve', 'allow_always');
    await promise;

    expect(gate.isApproved('conv-1', 'code_exec')).toBe(true);
  });

  it('allow_once does NOT cache the tool', async () => {
    const promise = gate.requestApproval('conv-1', 'web_search', { query: 'test' });

    gate.resolveApproval(getRequestId(0), 'approve', 'allow_once');
    await promise;

    expect(gate.isApproved('conv-1', 'web_search')).toBe(false);
  });

  it('concurrent requests: multiple pending approvals resolve independently', async () => {
    const promise1 = gate.requestApproval('conv-1', 'tool_a', { a: 1 });
    const promise2 = gate.requestApproval('conv-1', 'tool_b', { b: 2 });

    expect(gate.pendingCount).toBe(2);

    gate.resolveApproval(getRequestId(1), 'deny', 'deny');
    const decision2 = await promise2;
    expect(decision2.approved).toBe(false);
    expect(gate.pendingCount).toBe(1);

    gate.resolveApproval(getRequestId(0), 'approve', 'allow_session');
    const decision1 = await promise1;
    expect(decision1.approved).toBe(true);
    expect(gate.pendingCount).toBe(0);
  });

  it('resolveApproval on unknown requestId is a no-op', () => {
    gate.resolveApproval('nonexistent-id', 'approve', 'allow_once');
    expect(gate.pendingCount).toBe(0);
  });

  it('clearSession removes session cache for a conversation', async () => {
    const promise = gate.requestApproval('conv-1', 'web_search', {});

    gate.resolveApproval(getRequestId(0), 'approve', 'allow_session');
    await promise;

    expect(gate.isApproved('conv-1', 'web_search')).toBe(true);

    gate.clearSession('conv-1');
    expect(gate.isApproved('conv-1', 'web_search')).toBe(false);
  });

  it('destroy cleans up all pending requests and caches', async () => {
    const promise1 = gate.requestApproval('conv-1', 'tool_a', {});
    const promise2 = gate.requestApproval('conv-2', 'tool_b', {});

    // Approve one to populate cache
    gate.resolveApproval(getRequestId(0), 'approve', 'allow_session');
    await promise1;

    expect(gate.isApproved('conv-1', 'tool_a')).toBe(true);
    expect(gate.pendingCount).toBe(1);

    gate.destroy();

    // All pending should be auto-denied
    const decision2 = await promise2;
    expect(decision2.approved).toBe(false);

    // Caches should be cleared
    expect(gate.isApproved('conv-1', 'tool_a')).toBe(false);
    expect(gate.pendingCount).toBe(0);
  });

  // ---- New tests for abort signal support ----

  describe('abort signal', () => {
    it('denies immediately when abort signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const promise = gate.requestApproval('conv-1', 'tool_a', {}, controller.signal);

      const decision = await promise;
      expect(decision.approved).toBe(false);
      expect(decision.scope).toBe('deny');
      // Should not leave a pending entry
      expect(gate.pendingCount).toBe(0);
    });

    it('denies when abort signal fires while waiting', async () => {
      const controller = new AbortController();
      const promise = gate.requestApproval('conv-1', 'tool_a', {}, controller.signal);

      expect(gate.pendingCount).toBe(1);

      controller.abort();

      const decision = await promise;
      expect(decision.approved).toBe(false);
      expect(decision.scope).toBe('deny');
      expect(gate.pendingCount).toBe(0);
    });

    it('abort after resolution is a no-op (no double-resolve)', async () => {
      const controller = new AbortController();
      const promise = gate.requestApproval('conv-1', 'tool_a', {}, controller.signal);

      gate.resolveApproval(getRequestId(0), 'approve', 'allow_once');
      const decision = await promise;
      expect(decision.approved).toBe(true);

      // Aborting after resolution should not throw or change anything
      controller.abort();
      expect(gate.pendingCount).toBe(0);
    });

    it('timeout after abort is a no-op (no double-resolve)', async () => {
      const controller = new AbortController();
      const promise = gate.requestApproval('conv-1', 'tool_a', {}, controller.signal);

      controller.abort();
      const decision = await promise;
      expect(decision.approved).toBe(false);

      // Advancing time past the timeout should not throw
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(gate.pendingCount).toBe(0);
    });
  });

  // ---- Denial count tracking ----

  describe('denial tracking', () => {
    it('isDeniedTooManyTimes returns false initially', () => {
      expect(gate.isDeniedTooManyTimes('conv-1', 'tool_a')).toBe(false);
    });

    it('isDeniedTooManyTimes returns true after 3 denials', async () => {
      for (let i = 0; i < 3; i++) {
        const promise = gate.requestApproval('conv-1', 'tool_a', {});
        gate.resolveApproval(getRequestId(i), 'deny', 'deny');
        await promise;
      }

      expect(gate.isDeniedTooManyTimes('conv-1', 'tool_a')).toBe(true);
    });

    it('isDeniedTooManyTimes does not cross conversations', async () => {
      for (let i = 0; i < 3; i++) {
        const promise = gate.requestApproval('conv-1', 'tool_a', {});
        gate.resolveApproval(getRequestId(i), 'deny', 'deny');
        await promise;
      }

      expect(gate.isDeniedTooManyTimes('conv-2', 'tool_a')).toBe(false);
    });

    it('isDeniedTooManyTimes does not cross tools', async () => {
      for (let i = 0; i < 3; i++) {
        const promise = gate.requestApproval('conv-1', 'tool_a', {});
        gate.resolveApproval(getRequestId(i), 'deny', 'deny');
        await promise;
      }

      expect(gate.isDeniedTooManyTimes('conv-1', 'tool_b')).toBe(false);
    });

    it('approval resets denial count', async () => {
      // Deny twice
      for (let i = 0; i < 2; i++) {
        const promise = gate.requestApproval('conv-1', 'tool_a', {});
        gate.resolveApproval(getRequestId(i), 'deny', 'deny');
        await promise;
      }

      // Approve once
      const approvePromise = gate.requestApproval('conv-1', 'tool_a', {});
      gate.resolveApproval(getRequestId(2), 'approve', 'allow_once');
      await approvePromise;

      // Deny count should be reset, not at 3
      expect(gate.isDeniedTooManyTimes('conv-1', 'tool_a')).toBe(false);
    });

    it('clearSession also clears denial counts', async () => {
      for (let i = 0; i < 3; i++) {
        const promise = gate.requestApproval('conv-1', 'tool_a', {});
        gate.resolveApproval(getRequestId(i), 'deny', 'deny');
        await promise;
      }

      expect(gate.isDeniedTooManyTimes('conv-1', 'tool_a')).toBe(true);

      gate.clearSession('conv-1');
      expect(gate.isDeniedTooManyTimes('conv-1', 'tool_a')).toBe(false);
    });
  });

  // ---- cancelPending ----

  describe('cancelPending', () => {
    it('cancels all pending requests for a specific conversation', async () => {
      const promise1 = gate.requestApproval('conv-1', 'tool_a', {});
      const promise2 = gate.requestApproval('conv-1', 'tool_b', {});
      const promise3 = gate.requestApproval('conv-2', 'tool_c', {});

      expect(gate.pendingCount).toBe(3);

      gate.cancelPending('conv-1');

      const decision1 = await promise1;
      const decision2 = await promise2;
      expect(decision1.approved).toBe(false);
      expect(decision2.approved).toBe(false);

      // conv-2 request should still be pending
      expect(gate.pendingCount).toBe(1);

      // Clean up conv-2
      gate.resolveApproval(getRequestId(2), 'approve', 'allow_once');
      await promise3;
    });

    it('cancelPending is a no-op when no pending requests exist', () => {
      gate.cancelPending('conv-1');
      expect(gate.pendingCount).toBe(0);
    });
  });

  // ---- Race condition: double resolve ----

  describe('double resolve safety', () => {
    it('resolveApproval called twice with same requestId resolves only once', async () => {
      const promise = gate.requestApproval('conv-1', 'tool_a', {});
      const requestId = getRequestId(0);

      gate.resolveApproval(requestId, 'approve', 'allow_once');
      // Second call should be a no-op
      gate.resolveApproval(requestId, 'deny', 'deny');

      const decision = await promise;
      expect(decision.approved).toBe(true);
      expect(decision.scope).toBe('allow_once');
    });

    it('resolveApproval after timeout is a no-op', async () => {
      const promise = gate.requestApproval('conv-1', 'tool_a', {});
      const requestId = getRequestId(0);

      // Let timeout fire
      vi.advanceTimersByTime(5 * 60 * 1000);
      const decision = await promise;
      expect(decision.approved).toBe(false);

      // Now try to resolve — should be a no-op
      gate.resolveApproval(requestId, 'approve', 'allow_once');
      expect(gate.pendingCount).toBe(0);
    });
  });

  // ---- Edge case: clearSession clears all caches to prevent memory leaks ----

  describe('always cache persistence', () => {
    it('clearSession clears always cache to prevent memory leaks', async () => {
      const promise = gate.requestApproval('conv-1', 'tool_a', {});
      gate.resolveApproval(getRequestId(0), 'approve', 'allow_always');
      await promise;

      expect(gate.isApproved('conv-1', 'tool_a')).toBe(true);

      gate.clearSession('conv-1');

      // Always cache is cleared along with session cache to prevent memory leaks
      expect(gate.isApproved('conv-1', 'tool_a')).toBe(false);
    });

    it('destroy clears always cache', async () => {
      const promise = gate.requestApproval('conv-1', 'tool_a', {});
      gate.resolveApproval(getRequestId(0), 'approve', 'allow_always');
      await promise;

      gate.destroy();
      expect(gate.isApproved('conv-1', 'tool_a')).toBe(false);
    });
  });
});
