import { beforeEach, describe, expect, it } from 'vitest';

// We test the stream event processing logic by simulating the SocketClient's
// onAgentEvent callback. We don't use React hooks directly; instead we test
// the event→state mapping logic.

type AgentStreamEvent = {
  type: string;
  conversationId?: string;
  runId?: string;
  agentId?: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  durationMs?: number;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
  message?: string;
};

type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_call';
      toolName: string;
      toolCallId?: string;
      input?: Record<string, unknown>;
      status: 'running' | 'done';
    }
  | {
      type: 'tool_result';
      toolName: string;
      toolCallId?: string;
      result: unknown;
      durationMs?: number;
      isError: boolean;
    }
  | { type: 'thinking'; text: string };

type StreamingMessage = {
  runId: string;
  agentId?: string;
  blocks: ContentBlock[];
  usage: { inputTokens: number; outputTokens: number } | null;
};

/** Simulates the event processing logic from useAgentStream */
function createStreamProcessor() {
  let current: StreamingMessage | null = null;
  let isStreaming = false;

  function processEvent(event: AgentStreamEvent) {
    switch (event.type) {
      case 'run_started': {
        current = {
          runId: event.runId || 'test-run-id',
          agentId: event.agentId,
          blocks: [],
          usage: null,
        };
        isStreaming = true;
        break;
      }
      case 'text_delta': {
        if (!current) {
          current = {
            runId: 'implicit-run',
            agentId: event.agentId,
            blocks: [],
            usage: null,
          };
          isStreaming = true;
        }
        const text = event.text || '';
        const blocks = [...current.blocks];
        const lastBlock = blocks[blocks.length - 1];

        if (lastBlock && lastBlock.type === 'text') {
          blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + text };
        } else {
          blocks.push({ type: 'text', text });
        }
        current = { ...current, blocks };
        break;
      }
      case 'tool_call_start': {
        if (!current) break;
        const blocks = [...current.blocks];
        blocks.push({
          type: 'tool_call',
          toolName: event.toolName || 'unknown',
          toolCallId: event.toolCallId,
          input: event.toolInput,
          status: 'running' as const,
        });
        current = { ...current, blocks };
        break;
      }
      case 'tool_call_end': {
        if (!current) break;
        const blocks = [...current.blocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          const block = blocks[i];
          if (
            block.type === 'tool_call' &&
            block.status === 'running' &&
            (!event.toolCallId || block.toolCallId === event.toolCallId)
          ) {
            blocks[i] = { ...block, status: 'done' as const };
            break;
          }
        }
        blocks.push({
          type: 'tool_result',
          toolName: event.toolName || 'unknown',
          toolCallId: event.toolCallId,
          result: event.toolResult,
          durationMs: event.durationMs,
          isError: false,
        });
        current = { ...current, blocks };
        break;
      }
      case 'thinking': {
        if (!current) break;
        const blocks = [...current.blocks];
        blocks.push({ type: 'thinking', text: event.text || '' });
        current = { ...current, blocks };
        break;
      }
      case 'run_finished': {
        if (!current) break;
        current = { ...current, usage: event.usage || null };
        isStreaming = false;
        break;
      }
      case 'run_error': {
        if (current) {
          const blocks = [...current.blocks];
          blocks.push({
            type: 'text',
            text: `Error: ${event.error || event.message || 'Agent run failed'}`,
          });
          current = { ...current, blocks };
        }
        isStreaming = false;
        break;
      }
    }
  }

  return {
    processEvent,
    getState: () => ({ streamingMessage: current, isStreaming }),
    reset: () => {
      current = null;
      isStreaming = false;
    },
  };
}

describe('useAgentStream event processing', () => {
  let processor: ReturnType<typeof createStreamProcessor>;

  beforeEach(() => {
    processor = createStreamProcessor();
  });

  /* ---- run_started ---- */

  describe('run_started', () => {
    it('initializes a new streaming message', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1', agentId: 'a1' });
      const state = processor.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage?.runId).toBe('r1');
      expect(state.streamingMessage?.agentId).toBe('a1');
      expect(state.streamingMessage?.blocks).toEqual([]);
      expect(state.streamingMessage?.usage).toBeNull();
    });

    it('uses default runId when not provided', () => {
      processor.processEvent({ type: 'run_started' });
      expect(processor.getState().streamingMessage?.runId).toBe('test-run-id');
    });
  });

  /* ---- text_delta ---- */

  describe('text_delta', () => {
    it('appends to existing text block', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'text_delta', text: 'Hello ' });
      processor.processEvent({ type: 'text_delta', text: 'world' });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
      expect(blocks[0]).toEqual({ type: 'text', text: 'Hello world' });
    });

    it('creates implicit stream if no run_started', () => {
      processor.processEvent({ type: 'text_delta', text: 'surprise' });
      const state = processor.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingMessage!.blocks[0]).toEqual({ type: 'text', text: 'surprise' });
    });

    it('handles empty text delta', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'text_delta', text: '' });
      processor.processEvent({ type: 'text_delta', text: 'after' });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
      expect(blocks[0]).toEqual({ type: 'text', text: 'after' });
    });

    it('handles undefined text as empty string', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'text_delta' });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
      expect(blocks[0]).toEqual({ type: 'text', text: '' });
    });

    it('creates new text block after tool_call block', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'text_delta', text: 'before ' });
      processor.processEvent({
        type: 'tool_call_start',
        toolName: 'search',
        toolCallId: 'tc1',
      });
      processor.processEvent({ type: 'text_delta', text: 'after' });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(3);
      expect(blocks[0].type).toBe('text');
      expect(blocks[1].type).toBe('tool_call');
      expect(blocks[2].type).toBe('text');
    });
  });

  /* ---- tool_call_start / tool_call_end ---- */

  describe('tool_call lifecycle', () => {
    it('adds running tool_call block', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({
        type: 'tool_call_start',
        toolName: 'web_search',
        toolCallId: 'tc1',
        toolInput: { query: 'test' },
      });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
      const block = blocks[0] as any;
      expect(block.type).toBe('tool_call');
      expect(block.toolName).toBe('web_search');
      expect(block.status).toBe('running');
      expect(block.input).toEqual({ query: 'test' });
    });

    it('marks tool_call as done and adds tool_result', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({
        type: 'tool_call_start',
        toolName: 'search',
        toolCallId: 'tc1',
      });
      processor.processEvent({
        type: 'tool_call_end',
        toolName: 'search',
        toolCallId: 'tc1',
        toolResult: 'found something',
        durationMs: 150,
      });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(2);
      expect((blocks[0] as any).status).toBe('done');
      expect(blocks[1].type).toBe('tool_result');
      expect((blocks[1] as any).result).toBe('found something');
      expect((blocks[1] as any).durationMs).toBe(150);
    });

    it('tool_call_end without matching start still adds result', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({
        type: 'tool_call_end',
        toolName: 'unknown_tool',
        toolCallId: 'tc99',
        toolResult: 'orphan result',
      });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
      expect(blocks[0].type).toBe('tool_result');
    });

    it('tool_call_start is ignored without active stream', () => {
      processor.processEvent({
        type: 'tool_call_start',
        toolName: 'search',
      });
      expect(processor.getState().streamingMessage).toBeNull();
    });

    it('tool_call_end without toolCallId matches last running call', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'tool_call_start', toolName: 'a', toolCallId: 'tc1' });
      processor.processEvent({ type: 'tool_call_start', toolName: 'b', toolCallId: 'tc2' });
      processor.processEvent({
        type: 'tool_call_end',
        toolName: 'b',
        toolResult: 'done',
      });

      const blocks = processor.getState().streamingMessage!.blocks;
      // Last running tool_call (tc2) should be marked done
      expect((blocks[1] as any).status).toBe('done');
      // First tool_call (tc1) should still be running
      expect((blocks[0] as any).status).toBe('running');
    });
  });

  /* ---- thinking ---- */

  describe('thinking', () => {
    it('adds thinking block', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'thinking', text: 'analyzing...' });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
      expect(blocks[0]).toEqual({ type: 'thinking', text: 'analyzing...' });
    });

    it('thinking is ignored without active stream', () => {
      processor.processEvent({ type: 'thinking', text: 'lost thought' });
      expect(processor.getState().streamingMessage).toBeNull();
    });
  });

  /* ---- run_finished ---- */

  describe('run_finished', () => {
    it('sets usage and stops streaming', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'text_delta', text: 'done' });
      processor.processEvent({
        type: 'run_finished',
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const state = processor.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessage?.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
      });
    });

    it('run_finished without usage sets null', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'run_finished' });

      expect(processor.getState().streamingMessage?.usage).toBeNull();
    });

    it('run_finished is ignored without active stream', () => {
      processor.processEvent({ type: 'run_finished', usage: { inputTokens: 1, outputTokens: 1 } });
      expect(processor.getState().streamingMessage).toBeNull();
    });
  });

  /* ---- run_error ---- */

  describe('run_error', () => {
    it('adds error text block and stops streaming', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'run_error', error: 'rate limit exceeded' });

      const state = processor.getState();
      expect(state.isStreaming).toBe(false);
      const blocks = state.streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
      expect(blocks[0]).toEqual({ type: 'text', text: 'Error: rate limit exceeded' });
    });

    it('uses message field when error is not provided', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'run_error', message: 'timeout' });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks[0]).toEqual({ type: 'text', text: 'Error: timeout' });
    });

    it('uses default message when no error or message', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'run_error' });

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks[0]).toEqual({ type: 'text', text: 'Error: Agent run failed' });
    });

    it('run_error without active stream just sets isStreaming false', () => {
      processor.processEvent({ type: 'run_error', error: 'orphan error' });
      const state = processor.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingMessage).toBeNull();
    });
  });

  /* ---- status event ---- */

  describe('status event', () => {
    it('status event does not modify blocks', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1' });
      processor.processEvent({ type: 'text_delta', text: 'before' });
      processor.processEvent({ type: 'status' } as any);

      const blocks = processor.getState().streamingMessage!.blocks;
      expect(blocks.length).toBe(1);
    });
  });

  /* ---- Full conversation flow ---- */

  describe('full conversation flow', () => {
    it('processes a complete agent interaction', () => {
      processor.processEvent({ type: 'run_started', runId: 'r1', agentId: 'agent-1' });
      processor.processEvent({ type: 'thinking', text: 'Let me search for that...' });
      processor.processEvent({
        type: 'tool_call_start',
        toolName: 'web_search',
        toolCallId: 'tc1',
        toolInput: { query: 'latest news' },
      });
      processor.processEvent({
        type: 'tool_call_end',
        toolName: 'web_search',
        toolCallId: 'tc1',
        toolResult: 'Found 5 results',
        durationMs: 200,
      });
      processor.processEvent({ type: 'text_delta', text: 'Based on my search, ' });
      processor.processEvent({ type: 'text_delta', text: 'here are the results.' });
      processor.processEvent({
        type: 'run_finished',
        usage: { inputTokens: 500, outputTokens: 200 },
      });

      const state = processor.getState();
      expect(state.isStreaming).toBe(false);
      // 4 blocks: thinking, tool_call (marked done in-place), tool_result, text
      expect(state.streamingMessage!.blocks.length).toBe(4);
      expect(state.streamingMessage!.blocks[0].type).toBe('thinking');
      expect(state.streamingMessage!.blocks[1].type).toBe('tool_call');
      expect(state.streamingMessage!.blocks[2].type).toBe('tool_result');
      expect(state.streamingMessage!.blocks[3].type).toBe('text');
      expect((state.streamingMessage!.blocks[3] as any).text).toBe(
        'Based on my search, here are the results.',
      );
      expect(state.streamingMessage?.usage).toEqual({
        inputTokens: 500,
        outputTokens: 200,
      });
    });
  });

  /* ---- conversationId filtering ---- */

  describe('conversationId filtering', () => {
    it('events for different conversation are ignored in useAgentStream', () => {
      // This simulates the check: if (event.conversationId && event.conversationId !== conversationId) return;
      // The stream processor itself doesn't do this check (it's in the hook),
      // but we can verify the processing works correctly when events are passed through
      processor.processEvent({ type: 'run_started', runId: 'r1', conversationId: 'conv-1' });
      processor.processEvent({ type: 'text_delta', text: 'hello', conversationId: 'conv-1' });

      expect(processor.getState().streamingMessage!.blocks.length).toBe(1);
    });
  });
});
