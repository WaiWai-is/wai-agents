import { describe, expect, it } from 'vitest';
import {
  CreateEdgeSchema,
  CreateStepSchema,
  CreateWorkflowSchema,
  RunWorkflowSchema,
  UpdateStepSchema,
  UpdateWorkflowSchema,
} from './workflow.schema.js';

/* ================================================================
 * CreateWorkflowSchema
 * ================================================================ */
describe('CreateWorkflowSchema', () => {
  it('accepts valid input with required fields', () => {
    const result = CreateWorkflowSchema.parse({ name: 'My Workflow' });
    expect(result.name).toBe('My Workflow');
  });

  it('accepts valid input with all optional fields', () => {
    const data = {
      name: 'Full Workflow',
      description: 'A workflow with all fields',
      status: 'active' as const,
      trigger_config: { event: 'message' },
      max_concurrent_runs: 5,
      metadata: { version: 1 },
    };
    const result = CreateWorkflowSchema.parse(data);
    expect(result.name).toBe('Full Workflow');
    expect(result.status).toBe('active');
    expect(result.max_concurrent_runs).toBe(5);
  });

  it('strips HTML from name', () => {
    const result = CreateWorkflowSchema.parse({ name: '<b>Bold</b> Name' });
    expect(result.name).toBe('Bold Name');
  });

  it('strips HTML from description', () => {
    const result = CreateWorkflowSchema.parse({
      name: 'Test',
      description: '<script>alert(1)</script>',
    });
    expect(result.description).toBe('alert(1)');
  });

  it('rejects missing name', () => {
    const result = CreateWorkflowSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = CreateWorkflowSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 64 characters', () => {
    const result = CreateWorkflowSchema.safeParse({ name: 'x'.repeat(65) });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 64 characters', () => {
    const result = CreateWorkflowSchema.safeParse({ name: 'x'.repeat(64) });
    expect(result.success).toBe(true);
  });

  it('rejects description exceeding 2000 characters', () => {
    const result = CreateWorkflowSchema.safeParse({
      name: 'Test',
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = CreateWorkflowSchema.safeParse({ name: 'Test', status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects max_concurrent_runs below 1', () => {
    const result = CreateWorkflowSchema.safeParse({ name: 'Test', max_concurrent_runs: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects max_concurrent_runs above 100', () => {
    const result = CreateWorkflowSchema.safeParse({ name: 'Test', max_concurrent_runs: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer max_concurrent_runs', () => {
    const result = CreateWorkflowSchema.safeParse({ name: 'Test', max_concurrent_runs: 1.5 });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * UpdateWorkflowSchema
 * ================================================================ */
describe('UpdateWorkflowSchema', () => {
  it('accepts partial update with name only', () => {
    const result = UpdateWorkflowSchema.parse({ name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('accepts empty object (no updates)', () => {
    const result = UpdateWorkflowSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts nullable description', () => {
    const result = UpdateWorkflowSchema.parse({ description: null });
    expect(result.description).toBeNull();
  });

  it('accepts nullable trigger_config', () => {
    const result = UpdateWorkflowSchema.parse({ trigger_config: null });
    expect(result.trigger_config).toBeNull();
  });

  it('strips HTML from name', () => {
    const result = UpdateWorkflowSchema.parse({ name: '<em>Test</em>' });
    expect(result.name).toBe('Test');
  });

  it('rejects invalid status', () => {
    const result = UpdateWorkflowSchema.safeParse({ status: 'bogus' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CreateStepSchema
 * ================================================================ */
describe('CreateStepSchema', () => {
  it('accepts valid input with required fields', () => {
    const result = CreateStepSchema.parse({ name: 'Step 1', step_type: 'prompt' });
    expect(result.name).toBe('Step 1');
    expect(result.step_type).toBe('prompt');
  });

  it('accepts all valid step types', () => {
    const types = [
      'prompt',
      'tool_call',
      'condition',
      'transform',
      'wait',
      'sub_workflow',
      'human_input',
    ];
    for (const t of types) {
      const result = CreateStepSchema.safeParse({ name: 'Step', step_type: t });
      expect(result.success, `step_type "${t}" should be valid`).toBe(true);
    }
  });

  it('rejects invalid step_type', () => {
    const result = CreateStepSchema.safeParse({ name: 'Step', step_type: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('strips HTML from name', () => {
    const result = CreateStepSchema.parse({ name: '<b>Bold</b>', step_type: 'prompt' });
    expect(result.name).toBe('Bold');
  });

  it('rejects missing name', () => {
    const result = CreateStepSchema.safeParse({ step_type: 'prompt' });
    expect(result.success).toBe(false);
  });

  it('rejects missing step_type', () => {
    const result = CreateStepSchema.safeParse({ name: 'Step' });
    expect(result.success).toBe(false);
  });

  it('rejects timeout_ms below 1000', () => {
    const result = CreateStepSchema.safeParse({
      name: 'Step',
      step_type: 'prompt',
      timeout_ms: 500,
    });
    expect(result.success).toBe(false);
  });

  it('rejects timeout_ms above 3600000', () => {
    const result = CreateStepSchema.safeParse({
      name: 'Step',
      step_type: 'prompt',
      timeout_ms: 3600001,
    });
    expect(result.success).toBe(false);
  });

  it('accepts timeout_ms at boundary values', () => {
    expect(
      CreateStepSchema.safeParse({ name: 'Step', step_type: 'prompt', timeout_ms: 1000 }).success,
    ).toBe(true);
    expect(
      CreateStepSchema.safeParse({ name: 'Step', step_type: 'prompt', timeout_ms: 3600000 })
        .success,
    ).toBe(true);
  });

  it('accepts optional config and metadata', () => {
    const result = CreateStepSchema.parse({
      name: 'Step',
      step_type: 'tool_call',
      config: { tool: 'search' },
      metadata: { version: 2 },
    });
    expect(result.config).toEqual({ tool: 'search' });
    expect(result.metadata).toEqual({ version: 2 });
  });
});

/* ================================================================
 * UpdateStepSchema
 * ================================================================ */
describe('UpdateStepSchema', () => {
  it('accepts partial update', () => {
    const result = UpdateStepSchema.parse({ name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });

  it('accepts empty object', () => {
    const result = UpdateStepSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts nullable retry_config', () => {
    const result = UpdateStepSchema.parse({ retry_config: null });
    expect(result.retry_config).toBeNull();
  });

  it('rejects invalid step_type', () => {
    const result = UpdateStepSchema.safeParse({ step_type: 'bad' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CreateEdgeSchema
 * ================================================================ */
describe('CreateEdgeSchema', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_UUID2 = '660e8400-e29b-41d4-a716-446655440001';

  it('accepts valid input with required fields', () => {
    const result = CreateEdgeSchema.parse({
      source_step_id: VALID_UUID,
      target_step_id: VALID_UUID2,
    });
    expect(result.source_step_id).toBe(VALID_UUID);
    expect(result.target_step_id).toBe(VALID_UUID2);
  });

  it('accepts optional condition and label', () => {
    const result = CreateEdgeSchema.parse({
      source_step_id: VALID_UUID,
      target_step_id: VALID_UUID2,
      condition: { field: 'status', equals: 'success' },
      label: 'on success',
    });
    expect(result.condition).toEqual({ field: 'status', equals: 'success' });
    expect(result.label).toBe('on success');
  });

  it('strips HTML from label', () => {
    const result = CreateEdgeSchema.parse({
      source_step_id: VALID_UUID,
      target_step_id: VALID_UUID2,
      label: '<b>edge</b>',
    });
    expect(result.label).toBe('edge');
  });

  it('rejects non-UUID source_step_id', () => {
    const result = CreateEdgeSchema.safeParse({
      source_step_id: 'not-a-uuid',
      target_step_id: VALID_UUID2,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID target_step_id', () => {
    const result = CreateEdgeSchema.safeParse({
      source_step_id: VALID_UUID,
      target_step_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing source_step_id', () => {
    const result = CreateEdgeSchema.safeParse({ target_step_id: VALID_UUID2 });
    expect(result.success).toBe(false);
  });

  it('rejects missing target_step_id', () => {
    const result = CreateEdgeSchema.safeParse({ source_step_id: VALID_UUID });
    expect(result.success).toBe(false);
  });

  it('rejects label exceeding 32 characters', () => {
    const result = CreateEdgeSchema.safeParse({
      source_step_id: VALID_UUID,
      target_step_id: VALID_UUID2,
      label: 'x'.repeat(33),
    });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * RunWorkflowSchema
 * ================================================================ */
describe('RunWorkflowSchema', () => {
  it('accepts empty object', () => {
    const result = RunWorkflowSchema.parse({});
    expect(result).toEqual({});
  });

  it('accepts optional input', () => {
    const result = RunWorkflowSchema.parse({ input: { key: 'value' } });
    expect(result.input).toEqual({ key: 'value' });
  });

  it('accepts optional conversation_id', () => {
    const result = RunWorkflowSchema.parse({
      conversation_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.conversation_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects non-UUID conversation_id', () => {
    const result = RunWorkflowSchema.safeParse({ conversation_id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });
});
