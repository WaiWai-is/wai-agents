import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock emitter before importing the module under test
vi.mock('../../../ws/emitter.js', () => ({
  emitAgentEvent: vi.fn(),
}));

import { emitAgentEvent } from '../../../ws/emitter.js';
import { ApprovalGate } from '../approval-gate.js';

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
    const emitCall = vi.mocked(emitAgentEvent).mock.calls[0];
    const requestId = (emitCall[1] as { request_id: string }).request_id;
    gate.resolveApproval(requestId, 'approve', 'allow_once');

    const decision = await promise;
    expect(decision.approved).toBe(true);
  });

  it('approval flow: request -> approve -> resolves with approved=true', async () => {
    const promise = gate.requestApproval('conv-1', 'dangerous_tool', { arg: 'value' });

    const emitCall = vi.mocked(emitAgentEvent).mock.calls[0];
    const requestId = (emitCall[1] as { request_id: string }).request_id;

    gate.resolveApproval(requestId, 'approve', 'allow_once');

    const decision = await promise;
    expect(decision.approved).toBe(true);
    expect(decision.scope).toBe('allow_once');
    expect(gate.pendingCount).toBe(0);
  });

  it('denial flow: request -> deny -> resolves with approved=false', async () => {
    const promise = gate.requestApproval('conv-1', 'dangerous_tool', { arg: 'value' });

    const emitCall = vi.mocked(emitAgentEvent).mock.calls[0];
    const requestId = (emitCall[1] as { request_id: string }).request_id;

    gate.resolveApproval(requestId, 'deny', 'deny');

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
    const emitCall = vi.mocked(emitAgentEvent).mock.calls[0];
    const requestId = (emitCall[1] as { request_id: string }).request_id;

    gate.resolveApproval(requestId, 'approve', 'allow_session');
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
    const emitCall = vi.mocked(emitAgentEvent).mock.calls[0];
    const requestId = (emitCall[1] as { request_id: string }).request_id;

    gate.resolveApproval(requestId, 'approve', 'allow_always');
    await promise;

    expect(gate.isApproved('conv-1', 'code_exec')).toBe(true);
  });

  it('allow_once does NOT cache the tool', async () => {
    const promise = gate.requestApproval('conv-1', 'web_search', { query: 'test' });
    const emitCall = vi.mocked(emitAgentEvent).mock.calls[0];
    const requestId = (emitCall[1] as { request_id: string }).request_id;

    gate.resolveApproval(requestId, 'approve', 'allow_once');
    await promise;

    expect(gate.isApproved('conv-1', 'web_search')).toBe(false);
  });

  it('concurrent requests: multiple pending approvals resolve independently', async () => {
    const promise1 = gate.requestApproval('conv-1', 'tool_a', { a: 1 });
    const promise2 = gate.requestApproval('conv-1', 'tool_b', { b: 2 });

    expect(gate.pendingCount).toBe(2);

    const requestId1 = (vi.mocked(emitAgentEvent).mock.calls[0][1] as { request_id: string })
      .request_id;
    const requestId2 = (vi.mocked(emitAgentEvent).mock.calls[1][1] as { request_id: string })
      .request_id;

    gate.resolveApproval(requestId2, 'deny', 'deny');
    const decision2 = await promise2;
    expect(decision2.approved).toBe(false);
    expect(gate.pendingCount).toBe(1);

    gate.resolveApproval(requestId1, 'approve', 'allow_session');
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
    const requestId = (vi.mocked(emitAgentEvent).mock.calls[0][1] as { request_id: string })
      .request_id;

    gate.resolveApproval(requestId, 'approve', 'allow_session');
    await promise;

    expect(gate.isApproved('conv-1', 'web_search')).toBe(true);

    gate.clearSession('conv-1');
    expect(gate.isApproved('conv-1', 'web_search')).toBe(false);
  });

  it('destroy cleans up all pending requests and caches', async () => {
    const promise1 = gate.requestApproval('conv-1', 'tool_a', {});
    const promise2 = gate.requestApproval('conv-2', 'tool_b', {});

    // Approve one to populate cache
    const requestId1 = (vi.mocked(emitAgentEvent).mock.calls[0][1] as { request_id: string })
      .request_id;
    gate.resolveApproval(requestId1, 'approve', 'allow_session');
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
});
