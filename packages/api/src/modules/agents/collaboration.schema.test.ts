import { describe, expect, it } from 'vitest';
import {
  CompleteCollaborationSchema,
  CreateCollaborationSchema,
  RejectCollaborationSchema,
} from './collaboration.schema.js';

/* ================================================================
 * CreateCollaborationSchema
 * ================================================================ */
describe('CreateCollaborationSchema', () => {
  it('accepts valid input with required fields', () => {
    const data = {
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
      task_description: 'Analyze this dataset',
    };
    const result = CreateCollaborationSchema.parse(data);
    expect(result.responder_agent_id).toBe(data.responder_agent_id);
    expect(result.task_description).toBe(data.task_description);
  });

  it('accepts valid input with optional metadata', () => {
    const data = {
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
      task_description: 'Analyze data',
      metadata: { priority: 'high', source: 'api' },
    };
    const result = CreateCollaborationSchema.parse(data);
    expect(result.metadata).toEqual({ priority: 'high', source: 'api' });
  });

  it('strips HTML from task_description', () => {
    const result = CreateCollaborationSchema.parse({
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
      task_description: '<script>alert(1)</script>',
    });
    expect(result.task_description).toBe('alert(1)');
  });

  it('rejects missing responder_agent_id', () => {
    const result = CreateCollaborationSchema.safeParse({
      task_description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID responder_agent_id', () => {
    const result = CreateCollaborationSchema.safeParse({
      responder_agent_id: 'not-a-uuid',
      task_description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty responder_agent_id', () => {
    const result = CreateCollaborationSchema.safeParse({
      responder_agent_id: '',
      task_description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing task_description', () => {
    const result = CreateCollaborationSchema.safeParse({
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty task_description', () => {
    const result = CreateCollaborationSchema.safeParse({
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
      task_description: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects task_description exceeding 10000 characters', () => {
    const result = CreateCollaborationSchema.safeParse({
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
      task_description: 'x'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts task_description at exactly 10000 characters', () => {
    const result = CreateCollaborationSchema.safeParse({
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
      task_description: 'x'.repeat(10000),
    });
    expect(result.success).toBe(true);
  });

  it('accepts without optional metadata', () => {
    const result = CreateCollaborationSchema.parse({
      responder_agent_id: '550e8400-e29b-41d4-a716-446655440000',
      task_description: 'Test',
    });
    expect(result.metadata).toBeUndefined();
  });
});

/* ================================================================
 * CompleteCollaborationSchema
 * ================================================================ */
describe('CompleteCollaborationSchema', () => {
  it('accepts valid result', () => {
    const result = CompleteCollaborationSchema.parse({ result: 'Analysis complete' });
    expect(result.result).toBe('Analysis complete');
  });

  it('rejects missing result', () => {
    const result = CompleteCollaborationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty result', () => {
    const result = CompleteCollaborationSchema.safeParse({ result: '' });
    expect(result.success).toBe(false);
  });

  it('rejects result exceeding 50000 characters', () => {
    const result = CompleteCollaborationSchema.safeParse({ result: 'x'.repeat(50001) });
    expect(result.success).toBe(false);
  });

  it('accepts result at exactly 50000 characters', () => {
    const result = CompleteCollaborationSchema.safeParse({ result: 'x'.repeat(50000) });
    expect(result.success).toBe(true);
  });

  it('rejects non-string result', () => {
    const result = CompleteCollaborationSchema.safeParse({ result: 123 });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * RejectCollaborationSchema
 * ================================================================ */
describe('RejectCollaborationSchema', () => {
  it('accepts valid reason', () => {
    const result = RejectCollaborationSchema.parse({ reason: 'Not available' });
    expect(result.reason).toBe('Not available');
  });

  it('strips HTML from reason', () => {
    const result = RejectCollaborationSchema.parse({ reason: '<b>No</b>' });
    expect(result.reason).toBe('No');
  });

  it('rejects missing reason', () => {
    const result = RejectCollaborationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = RejectCollaborationSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('rejects reason exceeding 1000 characters', () => {
    const result = RejectCollaborationSchema.safeParse({ reason: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('accepts reason at exactly 1000 characters', () => {
    const result = RejectCollaborationSchema.safeParse({ reason: 'x'.repeat(1000) });
    expect(result.success).toBe(true);
  });

  it('rejects non-string reason', () => {
    const result = RejectCollaborationSchema.safeParse({ reason: 42 });
    expect(result.success).toBe(false);
  });
});
