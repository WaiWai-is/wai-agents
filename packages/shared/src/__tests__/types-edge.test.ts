import { describe, expect, it } from 'vitest';
import {
  CollaborationAcceptedEventSchema,
  CollaborationCompletedEventSchema,
  CollaborationRejectedEventSchema,
  CollaborationRequestedEventSchema,
  CollaborationStatusSchema,
} from '../types/agent-collaborations.js';
import {
  CrewErrorEventSchema,
  CrewFinishedEventSchema,
  CrewStepCompletedEventSchema,
  CrewStepSchema,
  CrewStepStartedEventSchema,
} from '../types/crews.js';
import {
  TriggerConditionGroupSchema,
  TriggerConditionSchema,
  TriggerFiredEventSchema,
} from '../types/triggers.js';
import {
  WorkflowRunCompletedEventSchema,
  WorkflowRunFailedEventSchema,
  WorkflowRunStartedEventSchema,
  WorkflowStepCompletedEventSchema,
  WorkflowStepStartedEventSchema,
} from '../types/workflows.js';

/* ================================================================
 * TriggerConditionSchema Edge Cases
 * ================================================================ */
describe('TriggerConditionSchema — edge cases', () => {
  it('accepts valid eq condition', () => {
    const data = { field: 'action', op: 'eq', value: 'push' };
    expect(TriggerConditionSchema.parse(data)).toEqual(data);
  });

  it('accepts valid neq condition', () => {
    const data = { field: 'status', op: 'neq', value: 'closed' };
    expect(TriggerConditionSchema.parse(data)).toEqual(data);
  });

  it('accepts valid contains condition', () => {
    const data = { field: 'message', op: 'contains', value: 'urgent' };
    expect(TriggerConditionSchema.parse(data)).toEqual(data);
  });

  it('accepts valid exists condition without value', () => {
    const data = { field: 'metadata', op: 'exists' };
    expect(TriggerConditionSchema.parse(data)).toEqual(data);
  });

  it('rejects empty field', () => {
    const result = TriggerConditionSchema.safeParse({ field: '', op: 'eq', value: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid operator', () => {
    const result = TriggerConditionSchema.safeParse({ field: 'x', op: 'gt', value: '5' });
    expect(result.success).toBe(false);
  });

  it('rejects missing field', () => {
    const result = TriggerConditionSchema.safeParse({ op: 'eq', value: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects missing op', () => {
    const result = TriggerConditionSchema.safeParse({ field: 'x', value: 'y' });
    expect(result.success).toBe(false);
  });

  it('value is optional (for exists op)', () => {
    const result = TriggerConditionSchema.safeParse({ field: 'x', op: 'exists' });
    expect(result.success).toBe(true);
  });
});

/* ================================================================
 * TriggerConditionGroupSchema Edge Cases
 * ================================================================ */
describe('TriggerConditionGroupSchema — edge cases', () => {
  it('accepts empty object (pass-through)', () => {
    expect(TriggerConditionGroupSchema.parse({})).toEqual({});
  });

  it('accepts all conditions only', () => {
    const data = { all: [{ field: 'x', op: 'eq' as const, value: 'y' }] };
    expect(TriggerConditionGroupSchema.parse(data)).toEqual(data);
  });

  it('accepts any conditions only', () => {
    const data = { any: [{ field: 'x', op: 'exists' as const }] };
    expect(TriggerConditionGroupSchema.parse(data)).toEqual(data);
  });

  it('accepts both all and any conditions', () => {
    const data = {
      all: [{ field: 'a', op: 'eq' as const, value: '1' }],
      any: [{ field: 'b', op: 'neq' as const, value: '2' }],
    };
    expect(TriggerConditionGroupSchema.parse(data)).toEqual(data);
  });

  it('accepts empty all array', () => {
    const result = TriggerConditionGroupSchema.safeParse({ all: [] });
    expect(result.success).toBe(true);
  });

  it('accepts empty any array', () => {
    const result = TriggerConditionGroupSchema.safeParse({ any: [] });
    expect(result.success).toBe(true);
  });

  it('rejects invalid condition within all', () => {
    const result = TriggerConditionGroupSchema.safeParse({
      all: [{ field: '', op: 'eq' }],
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * TriggerFiredEventSchema Edge Cases
 * ================================================================ */
describe('TriggerFiredEventSchema — edge cases', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'trigger:fired',
      trigger_id: 't1',
      agent_id: 'a1',
      trigger_type: 'webhook',
      conversation_id: 'c1',
      fired_at: '2026-01-01T00:00:00Z',
    };
    expect(TriggerFiredEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing trigger_id', () => {
    const result = TriggerFiredEventSchema.safeParse({
      type: 'trigger:fired',
      agent_id: 'a1',
      trigger_type: 'webhook',
      conversation_id: 'c1',
      fired_at: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type literal', () => {
    const result = TriggerFiredEventSchema.safeParse({
      type: 'trigger:created',
      trigger_id: 't1',
      agent_id: 'a1',
      trigger_type: 'webhook',
      conversation_id: 'c1',
      fired_at: '2026-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * WorkflowEvent Schemas Edge Cases
 * ================================================================ */
describe('WorkflowRunStartedEventSchema — edge cases', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'workflow:run_started',
      workflow_id: 'w1',
      run_id: 'r1',
      agent_id: 'a1',
    };
    expect(WorkflowRunStartedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing workflow_id', () => {
    const result = WorkflowRunStartedEventSchema.safeParse({
      type: 'workflow:run_started',
      run_id: 'r1',
      agent_id: 'a1',
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkflowStepStartedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'workflow:step_started',
      workflow_id: 'w1',
      run_id: 'r1',
      step_id: 's1',
      step_name: 'Step 1',
    };
    expect(WorkflowStepStartedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing step_name', () => {
    const result = WorkflowStepStartedEventSchema.safeParse({
      type: 'workflow:step_started',
      workflow_id: 'w1',
      run_id: 'r1',
      step_id: 's1',
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkflowStepCompletedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'workflow:step_completed',
      workflow_id: 'w1',
      run_id: 'r1',
      step_id: 's1',
      step_name: 'Step 1',
      status: 'completed',
    };
    expect(WorkflowStepCompletedEventSchema.parse(data)).toEqual(data);
  });
});

describe('WorkflowRunCompletedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'workflow:run_completed',
      workflow_id: 'w1',
      run_id: 'r1',
      total_duration_ms: 5000,
    };
    expect(WorkflowRunCompletedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects non-number duration', () => {
    const result = WorkflowRunCompletedEventSchema.safeParse({
      type: 'workflow:run_completed',
      workflow_id: 'w1',
      run_id: 'r1',
      total_duration_ms: 'fast',
    });
    expect(result.success).toBe(false);
  });
});

describe('WorkflowRunFailedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'workflow:run_failed',
      workflow_id: 'w1',
      run_id: 'r1',
      error: 'timeout',
    };
    expect(WorkflowRunFailedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing error', () => {
    const result = WorkflowRunFailedEventSchema.safeParse({
      type: 'workflow:run_failed',
      workflow_id: 'w1',
      run_id: 'r1',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CollaborationEvent Schemas
 * ================================================================ */
describe('CollaborationStatusSchema', () => {
  it.each([
    'pending',
    'accepted',
    'in_progress',
    'completed',
    'failed',
    'rejected',
  ] as const)('accepts status "%s"', (status) => {
    expect(CollaborationStatusSchema.parse(status)).toBe(status);
  });

  it('rejects invalid status', () => {
    const result = CollaborationStatusSchema.safeParse('nonexistent_status');
    expect(result.success).toBe(false);
  });
});

describe('CollaborationRequestedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'collaboration:requested',
      collaboration_id: 'collab-1',
      requester_agent_id: 'agent-1',
      responder_agent_id: 'agent-2',
      task_description: 'Help me with this',
      priority: 'normal',
    };
    expect(CollaborationRequestedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing task_description', () => {
    const result = CollaborationRequestedEventSchema.safeParse({
      type: 'collaboration:requested',
      collaboration_id: 'c1',
      requester_agent_id: 'a1',
      responder_agent_id: 'a2',
    });
    expect(result.success).toBe(false);
  });
});

describe('CollaborationAcceptedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'collaboration:accepted',
      collaboration_id: 'c1',
      responder_agent_id: 'a2',
    };
    expect(CollaborationAcceptedEventSchema.parse(data)).toEqual(data);
  });
});

describe('CollaborationCompletedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'collaboration:completed',
      collaboration_id: 'c1',
      responder_agent_id: 'a2',
      result: 'Done!',
    };
    expect(CollaborationCompletedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing result', () => {
    const result = CollaborationCompletedEventSchema.safeParse({
      type: 'collaboration:completed',
      collaboration_id: 'c1',
      responder_agent_id: 'a2',
    });
    expect(result.success).toBe(false);
  });
});

describe('CollaborationRejectedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'collaboration:rejected',
      collaboration_id: 'c1',
      responder_agent_id: 'a2',
      reason: 'Busy',
    };
    expect(CollaborationRejectedEventSchema.parse(data)).toEqual(data);
  });
});

/* ================================================================
 * CrewEvent Schemas
 * ================================================================ */
describe('CrewStepSchema', () => {
  it('accepts valid crew step', () => {
    const data = {
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      role: 'researcher',
    };
    expect(CrewStepSchema.parse(data)).toEqual(data);
  });

  it('accepts with optional parallelGroup', () => {
    const data = {
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      role: 'writer',
      parallelGroup: 'group-a',
    };
    expect(CrewStepSchema.parse(data)).toEqual(data);
  });

  it('rejects invalid UUID for agentId', () => {
    const result = CrewStepSchema.safeParse({ agentId: 'not-a-uuid', role: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects empty role', () => {
    const result = CrewStepSchema.safeParse({
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      role: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects role exceeding 64 characters', () => {
    const result = CrewStepSchema.safeParse({
      agentId: '550e8400-e29b-41d4-a716-446655440000',
      role: 'a'.repeat(65),
    });
    expect(result.success).toBe(false);
  });
});

describe('CrewStepStartedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'crew:step_started',
      crew_id: 'c1',
      step_index: 0,
      agent_id: 'a1',
      role: 'researcher',
    };
    expect(CrewStepStartedEventSchema.parse(data)).toEqual(data);
  });

  it('accepts with optional parallel_group', () => {
    const data = {
      type: 'crew:step_started',
      crew_id: 'c1',
      step_index: 0,
      agent_id: 'a1',
      role: 'writer',
      parallel_group: 'g1',
    };
    expect(CrewStepStartedEventSchema.parse(data)).toEqual(data);
  });
});

describe('CrewStepCompletedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'crew:step_completed',
      crew_id: 'c1',
      step_index: 0,
      agent_id: 'a1',
      role: 'researcher',
      response: 'Found the data',
    };
    expect(CrewStepCompletedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing response', () => {
    const result = CrewStepCompletedEventSchema.safeParse({
      type: 'crew:step_completed',
      crew_id: 'c1',
      step_index: 0,
      agent_id: 'a1',
      role: 'x',
    });
    expect(result.success).toBe(false);
  });
});

describe('CrewFinishedEventSchema', () => {
  it('accepts valid event', () => {
    const data = {
      type: 'crew:finished',
      crew_id: 'c1',
      total_steps: 3,
      final_response: 'All done',
    };
    expect(CrewFinishedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects non-number total_steps', () => {
    const result = CrewFinishedEventSchema.safeParse({
      type: 'crew:finished',
      crew_id: 'c1',
      total_steps: 'three',
      final_response: 'done',
    });
    expect(result.success).toBe(false);
  });
});

describe('CrewErrorEventSchema', () => {
  it('accepts valid event without step_index', () => {
    const data = {
      type: 'crew:error',
      crew_id: 'c1',
      error: 'Agent failed',
    };
    expect(CrewErrorEventSchema.parse(data)).toEqual(data);
  });

  it('accepts valid event with step_index', () => {
    const data = {
      type: 'crew:error',
      crew_id: 'c1',
      error: 'timeout',
      step_index: 2,
    };
    expect(CrewErrorEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing error field', () => {
    const result = CrewErrorEventSchema.safeParse({
      type: 'crew:error',
      crew_id: 'c1',
    });
    expect(result.success).toBe(false);
  });
});
