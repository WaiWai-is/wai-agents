import { describe, expect, it } from 'vitest';
import {
  WorkflowRunCompletedEventSchema,
  WorkflowRunFailedEventSchema,
  WorkflowRunStartedEventSchema,
  WorkflowStepCompletedEventSchema,
  WorkflowStepStartedEventSchema,
} from '../types/workflows.js';

/* ================================================================
 * WorkflowRunStartedEventSchema
 * ================================================================ */
describe('WorkflowRunStartedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'workflow:run_started',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
    };
    expect(WorkflowRunStartedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = WorkflowRunStartedEventSchema.safeParse({
      type: 'workflow:run_completed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing workflow_id', () => {
    const result = WorkflowRunStartedEventSchema.safeParse({
      type: 'workflow:run_started',
      run_id: 'run-1',
      agent_id: 'agent-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing run_id', () => {
    const result = WorkflowRunStartedEventSchema.safeParse({
      type: 'workflow:run_started',
      workflow_id: 'wf-1',
      agent_id: 'agent-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing agent_id', () => {
    const result = WorkflowRunStartedEventSchema.safeParse({
      type: 'workflow:run_started',
      workflow_id: 'wf-1',
      run_id: 'run-1',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * WorkflowStepStartedEventSchema
 * ================================================================ */
describe('WorkflowStepStartedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'workflow:step_started',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      step_id: 'step-1',
      step_name: 'Parse Input',
    };
    expect(WorkflowStepStartedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = WorkflowStepStartedEventSchema.safeParse({
      type: 'workflow:run_started',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      step_id: 'step-1',
      step_name: 'Parse Input',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing step_name', () => {
    const result = WorkflowStepStartedEventSchema.safeParse({
      type: 'workflow:step_started',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      step_id: 'step-1',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * WorkflowStepCompletedEventSchema
 * ================================================================ */
describe('WorkflowStepCompletedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'workflow:step_completed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      step_id: 'step-1',
      step_name: 'Parse Input',
      status: 'completed',
    };
    expect(WorkflowStepCompletedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = WorkflowStepCompletedEventSchema.safeParse({
      type: 'workflow:step_started',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      step_id: 'step-1',
      step_name: 'Parse Input',
      status: 'completed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = WorkflowStepCompletedEventSchema.safeParse({
      type: 'workflow:step_completed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      step_id: 'step-1',
      step_name: 'Parse Input',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * WorkflowRunCompletedEventSchema
 * ================================================================ */
describe('WorkflowRunCompletedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'workflow:run_completed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      total_duration_ms: 5000,
    };
    expect(WorkflowRunCompletedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = WorkflowRunCompletedEventSchema.safeParse({
      type: 'workflow:run_failed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      total_duration_ms: 5000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing total_duration_ms', () => {
    const result = WorkflowRunCompletedEventSchema.safeParse({
      type: 'workflow:run_completed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-number total_duration_ms', () => {
    const result = WorkflowRunCompletedEventSchema.safeParse({
      type: 'workflow:run_completed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      total_duration_ms: 'not-a-number',
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * WorkflowRunFailedEventSchema
 * ================================================================ */
describe('WorkflowRunFailedEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'workflow:run_failed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      error: 'Step 2 timed out',
    };
    expect(WorkflowRunFailedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const result = WorkflowRunFailedEventSchema.safeParse({
      type: 'workflow:run_completed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      error: 'Failed',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing error', () => {
    const result = WorkflowRunFailedEventSchema.safeParse({
      type: 'workflow:run_failed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-string error', () => {
    const result = WorkflowRunFailedEventSchema.safeParse({
      type: 'workflow:run_failed',
      workflow_id: 'wf-1',
      run_id: 'run-1',
      error: 42,
    });
    expect(result.success).toBe(false);
  });
});
