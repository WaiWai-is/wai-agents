import { describe, expect, it } from 'vitest';
import {
  CollaborationAcceptedEventSchema,
  CollaborationCompletedEventSchema,
  CollaborationRejectedEventSchema,
  CollaborationRequestedEventSchema,
  CollaborationStatusSchema,
} from '../types/agent-collaborations.js';

/* ================================================================
 * CollaborationStatusSchema
 * ================================================================ */
describe('CollaborationStatusSchema', () => {
  it('accepts all valid statuses', () => {
    const validStatuses = ['pending', 'accepted', 'in_progress', 'completed', 'failed', 'rejected'];
    for (const status of validStatuses) {
      const result = CollaborationStatusSchema.safeParse(status);
      expect(result.success, `status "${status}" should be accepted`).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = CollaborationStatusSchema.safeParse('unknown');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = CollaborationStatusSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects number', () => {
    const result = CollaborationStatusSchema.safeParse(1);
    expect(result.success).toBe(false);
  });

  it('rejects null', () => {
    const result = CollaborationStatusSchema.safeParse(null);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CollaborationRequestedEventSchema
 * ================================================================ */
describe('CollaborationRequestedEventSchema', () => {
  it('accepts valid data with all fields', () => {
    const data = {
      type: 'collaboration:requested',
      collaboration_id: 'collab-1',
      requester_agent_id: 'agent-1',
      responder_agent_id: 'agent-2',
      task_description: 'Please analyze this data',
      priority: 'normal',
    };
    expect(CollaborationRequestedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const data = {
      type: 'collaboration:accepted',
      collaboration_id: 'collab-1',
      requester_agent_id: 'agent-1',
      responder_agent_id: 'agent-2',
      task_description: 'Test',
    };
    const result = CollaborationRequestedEventSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing collaboration_id', () => {
    const result = CollaborationRequestedEventSchema.safeParse({
      type: 'collaboration:requested',
      requester_agent_id: 'agent-1',
      responder_agent_id: 'agent-2',
      task_description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing requester_agent_id', () => {
    const result = CollaborationRequestedEventSchema.safeParse({
      type: 'collaboration:requested',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
      task_description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing responder_agent_id', () => {
    const result = CollaborationRequestedEventSchema.safeParse({
      type: 'collaboration:requested',
      collaboration_id: 'collab-1',
      requester_agent_id: 'agent-1',
      task_description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing task_description', () => {
    const result = CollaborationRequestedEventSchema.safeParse({
      type: 'collaboration:requested',
      collaboration_id: 'collab-1',
      requester_agent_id: 'agent-1',
      responder_agent_id: 'agent-2',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CollaborationAcceptedEventSchema
 * ================================================================ */
describe('CollaborationAcceptedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'collaboration:accepted',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
    };
    expect(CollaborationAcceptedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = CollaborationAcceptedEventSchema.safeParse({
      type: 'collaboration:requested',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing collaboration_id', () => {
    const result = CollaborationAcceptedEventSchema.safeParse({
      type: 'collaboration:accepted',
      responder_agent_id: 'agent-2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing responder_agent_id', () => {
    const result = CollaborationAcceptedEventSchema.safeParse({
      type: 'collaboration:accepted',
      collaboration_id: 'collab-1',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CollaborationCompletedEventSchema
 * ================================================================ */
describe('CollaborationCompletedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'collaboration:completed',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
      result: 'Analysis complete with findings...',
    };
    expect(CollaborationCompletedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = CollaborationCompletedEventSchema.safeParse({
      type: 'collaboration:accepted',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
      result: 'Done',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing result', () => {
    const result = CollaborationCompletedEventSchema.safeParse({
      type: 'collaboration:completed',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing collaboration_id', () => {
    const result = CollaborationCompletedEventSchema.safeParse({
      type: 'collaboration:completed',
      responder_agent_id: 'agent-2',
      result: 'Done',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing responder_agent_id', () => {
    const result = CollaborationCompletedEventSchema.safeParse({
      type: 'collaboration:completed',
      collaboration_id: 'collab-1',
      result: 'Done',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CollaborationRejectedEventSchema
 * ================================================================ */
describe('CollaborationRejectedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'collaboration:rejected',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
      reason: 'Not available right now',
    };
    expect(CollaborationRejectedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = CollaborationRejectedEventSchema.safeParse({
      type: 'collaboration:accepted',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
      reason: 'Busy',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing reason', () => {
    const result = CollaborationRejectedEventSchema.safeParse({
      type: 'collaboration:rejected',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing collaboration_id', () => {
    const result = CollaborationRejectedEventSchema.safeParse({
      type: 'collaboration:rejected',
      responder_agent_id: 'agent-2',
      reason: 'Busy',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing responder_agent_id', () => {
    const result = CollaborationRejectedEventSchema.safeParse({
      type: 'collaboration:rejected',
      collaboration_id: 'collab-1',
      reason: 'Busy',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string reason', () => {
    const result = CollaborationRejectedEventSchema.safeParse({
      type: 'collaboration:rejected',
      collaboration_id: 'collab-1',
      responder_agent_id: 'agent-2',
      reason: 42,
    });
    expect(result.success).toBe(false);
  });
});
