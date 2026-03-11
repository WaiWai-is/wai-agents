/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
  });
  return { sql: sqlFn, db: {} };
});

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const TRACE_ID = 'bb0e8400-e29b-41d4-a716-446655440010';
const RUN_ID = 'cc0e8400-e29b-41d4-a716-446655440011';

function makeTraceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRACE_ID,
    run_id: RUN_ID,
    agent_id: AGENT_ID,
    user_id: USER_ID,
    conversation_id: null,
    trigger_type: 'manual',
    status: 'completed',
    model: 'claude-sonnet-4-6',
    total_input_tokens: 100,
    total_output_tokens: 50,
    total_duration_ms: 1500,
    total_tool_calls: 1,
    total_llm_calls: 2,
    error_message: null,
    started_at: new Date('2026-01-01'),
    finished_at: new Date('2026-01-01'),
    inserted_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeSpanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'span-1',
    trace_id: TRACE_ID,
    span_type: 'llm_call',
    name: 'claude-sonnet-4-6',
    seq: 0,
    status: 'ok',
    input: { turn: 0 },
    output: { stop_reason: 'end_turn' },
    token_usage: { input_tokens: 100, output_tokens: 50 },
    duration_ms: 500,
    metadata: {},
    started_at: new Date('2026-01-01'),
    finished_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  listTraces                                                                */
/* -------------------------------------------------------------------------- */

describe('trace.service — listTraces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns formatted traces for the agent owner', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // 2. SELECT traces
    sqlMock.mockResolvedValueOnce([makeTraceRow()] as any);

    const { listTraces } = await import('./trace.service.js');
    const traces = await listTraces(AGENT_ID, USER_ID);

    expect(traces).toHaveLength(1);
    expect(traces[0].id).toBe(TRACE_ID);
    expect(traces[0].status).toBe('completed');
    expect(traces[0].started_at).toBe(new Date('2026-01-01').toISOString());
  });

  it('returns empty array when no traces exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listTraces } = await import('./trace.service.js');
    const traces = await listTraces(AGENT_ID, USER_ID);

    expect(traces).toHaveLength(0);
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listTraces } = await import('./trace.service.js');
    await expect(listTraces(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('passes status filter to query', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeTraceRow({ status: 'failed' })] as any);

    const { listTraces } = await import('./trace.service.js');
    const traces = await listTraces(AGENT_ID, USER_ID, { status: 'failed' });

    expect(traces).toHaveLength(1);
    expect(traces[0].status).toBe('failed');
  });
});

/* -------------------------------------------------------------------------- */
/*  getTrace                                                                  */
/* -------------------------------------------------------------------------- */

describe('trace.service — getTrace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trace with spans', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // SELECT trace
    sqlMock.mockResolvedValueOnce([makeTraceRow()] as any);
    // SELECT spans
    sqlMock.mockResolvedValueOnce([
      makeSpanRow(),
      makeSpanRow({ id: 'span-2', seq: 1, span_type: 'tool_call', name: 'web_search' }),
    ] as any);

    const { getTrace } = await import('./trace.service.js');
    const trace = await getTrace(TRACE_ID, USER_ID);

    expect(trace.id).toBe(TRACE_ID);
    expect(trace.spans).toHaveLength(2);
    expect(trace.spans[0].span_type).toBe('llm_call');
    expect(trace.spans[1].span_type).toBe('tool_call');
  });

  it('throws NOT_FOUND for non-existent trace', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getTrace } = await import('./trace.service.js');
    await expect(getTrace('nonexistent-id', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when non-owner tries to access', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getTrace } = await import('./trace.service.js');
    await expect(getTrace(TRACE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getTraceSpans                                                             */
/* -------------------------------------------------------------------------- */

describe('trace.service — getTraceSpans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns spans ordered by seq', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // verify trace ownership
    sqlMock.mockResolvedValueOnce([{ id: TRACE_ID }] as any);
    // SELECT spans
    sqlMock.mockResolvedValueOnce([
      makeSpanRow({ seq: 0 }),
      makeSpanRow({ id: 'span-2', seq: 1 }),
    ] as any);

    const { getTraceSpans } = await import('./trace.service.js');
    const spans = await getTraceSpans(TRACE_ID, USER_ID);

    expect(spans).toHaveLength(2);
    expect(spans[0].seq).toBe(0);
    expect(spans[1].seq).toBe(1);
  });

  it('throws NOT_FOUND when trace does not belong to user', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getTraceSpans } = await import('./trace.service.js');
    await expect(getTraceSpans(TRACE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
