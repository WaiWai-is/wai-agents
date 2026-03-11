/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection
vi.mock('../../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
  });
  return { sql: sqlFn, db: {} };
});

import { sql } from '../../../db/connection.js';
import { TraceRecorder } from '../trace-recorder.js';

const AGENT_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID = '550e8400-e29b-41d4-a716-446655440002';
const CONV_ID = '550e8400-e29b-41d4-a716-446655440003';
const RUN_ID = '550e8400-e29b-41d4-a716-446655440004';

describe('TraceRecorder', () => {
  let recorder: TraceRecorder;

  beforeEach(() => {
    vi.clearAllMocks();
    recorder = new TraceRecorder();
  });

  /* ---------------------------------------------------------------------- */
  /*  startTrace                                                             */
  /* ---------------------------------------------------------------------- */

  describe('startTrace', () => {
    it('inserts a trace row and returns a traceId', async () => {
      const sqlMock = vi.mocked(sql);
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );

      expect(traceId).toBeTruthy();
      expect(typeof traceId).toBe('string');
      expect(sqlMock).toHaveBeenCalledTimes(1);
    });

    it('inserts a trace with null conversationId', async () => {
      const sqlMock = vi.mocked(sql);
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        null,
        'gpt-4o',
        'webhook',
        RUN_ID,
      );

      expect(traceId).toBeTruthy();
      expect(sqlMock).toHaveBeenCalledTimes(1);
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  addSpan                                                                */
  /* ---------------------------------------------------------------------- */

  describe('addSpan', () => {
    it('inserts a span row and returns a spanId', async () => {
      const sqlMock = vi.mocked(sql);
      // startTrace
      sqlMock.mockResolvedValueOnce([] as any);
      // addSpan
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      const spanId = await recorder.addSpan(traceId, 'llm_call', 'claude-sonnet-4-6', { turn: 0 });

      expect(spanId).toBeTruthy();
      expect(typeof spanId).toBe('string');
      expect(sqlMock).toHaveBeenCalledTimes(2);
    });

    it('increments seq for each span', async () => {
      const sqlMock = vi.mocked(sql);
      // startTrace
      sqlMock.mockResolvedValueOnce([] as any);
      // addSpan x2
      sqlMock.mockResolvedValueOnce([] as any);
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      await recorder.addSpan(traceId, 'llm_call', 'model', null);
      await recorder.addSpan(traceId, 'tool_call', 'web_search', { query: 'test' });

      // Verify 3 sql calls (1 startTrace + 2 addSpan)
      expect(sqlMock).toHaveBeenCalledTimes(3);
    });

    it('handles null input', async () => {
      const sqlMock = vi.mocked(sql);
      sqlMock.mockResolvedValueOnce([] as any);
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      const spanId = await recorder.addSpan(traceId, 'thinking', 'thinking', null);

      expect(spanId).toBeTruthy();
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  endSpan                                                                */
  /* ---------------------------------------------------------------------- */

  describe('endSpan', () => {
    it('updates a span with status, output, tokenUsage, and durationMs', async () => {
      const sqlMock = vi.mocked(sql);
      // startTrace, addSpan, endSpan
      sqlMock.mockResolvedValueOnce([] as any);
      sqlMock.mockResolvedValueOnce([] as any);
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      const spanId = await recorder.addSpan(traceId, 'llm_call', 'model', null);
      await recorder.endSpan(
        spanId,
        'ok',
        { stop_reason: 'end_turn' },
        { input_tokens: 100, output_tokens: 50 },
        250,
      );

      expect(sqlMock).toHaveBeenCalledTimes(3);
    });

    it('handles null output and tokenUsage', async () => {
      const sqlMock = vi.mocked(sql);
      sqlMock.mockResolvedValueOnce([] as any);
      sqlMock.mockResolvedValueOnce([] as any);
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      const spanId = await recorder.addSpan(traceId, 'thinking', 'thinking', null);
      await recorder.endSpan(spanId, 'ok', null, null, 10);

      expect(sqlMock).toHaveBeenCalledTimes(3);
    });
  });

  /* ---------------------------------------------------------------------- */
  /*  endTrace                                                               */
  /* ---------------------------------------------------------------------- */

  describe('endTrace', () => {
    it('sums span totals and updates trace to completed', async () => {
      const sqlMock = vi.mocked(sql);
      // startTrace
      sqlMock.mockResolvedValueOnce([] as any);
      // endTrace: sum spans
      sqlMock.mockResolvedValueOnce([
        {
          total_input_tokens: 200,
          total_output_tokens: 100,
          total_tool_calls: 2,
          total_llm_calls: 3,
        },
      ] as any);
      // endTrace: get started_at
      sqlMock.mockResolvedValueOnce([
        { started_at: new Date(Date.now() - 1000).toISOString() },
      ] as any);
      // endTrace: update
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      await recorder.endTrace(traceId, 'completed');

      // 4 calls: startTrace + sum spans + get started_at + update
      expect(sqlMock).toHaveBeenCalledTimes(4);
    });

    it('sets error message when status is failed', async () => {
      const sqlMock = vi.mocked(sql);
      // startTrace
      sqlMock.mockResolvedValueOnce([] as any);
      // endTrace: sum spans
      sqlMock.mockResolvedValueOnce([
        {
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tool_calls: 0,
          total_llm_calls: 1,
        },
      ] as any);
      // endTrace: get started_at
      sqlMock.mockResolvedValueOnce([{ started_at: new Date().toISOString() }] as any);
      // endTrace: update
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      await recorder.endTrace(traceId, 'failed', 'Model rate limited');

      expect(sqlMock).toHaveBeenCalledTimes(4);
    });

    it('handles missing started_at gracefully', async () => {
      const sqlMock = vi.mocked(sql);
      // startTrace
      sqlMock.mockResolvedValueOnce([] as any);
      // endTrace: sum spans
      sqlMock.mockResolvedValueOnce([
        {
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_tool_calls: 0,
          total_llm_calls: 0,
        },
      ] as any);
      // endTrace: get started_at — empty
      sqlMock.mockResolvedValueOnce([] as any);
      // endTrace: update
      sqlMock.mockResolvedValueOnce([] as any);

      const traceId = await recorder.startTrace(
        AGENT_ID,
        USER_ID,
        CONV_ID,
        'claude-sonnet-4-6',
        'manual',
        RUN_ID,
      );
      await recorder.endTrace(traceId, 'aborted');

      expect(sqlMock).toHaveBeenCalledTimes(4);
    });
  });
});
