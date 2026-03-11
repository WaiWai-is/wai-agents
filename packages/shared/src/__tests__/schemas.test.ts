import { describe, expect, it } from 'vitest';
import {
  AgentEventSchema,
  RunErrorEventSchema,
  RunFinishedEventSchema,
  RunStartedEventSchema,
  StepStartedEventSchema,
  TextDeltaEventSchema,
  ThinkingEventSchema,
  ToolApprovalRequestEventSchema,
  ToolCallEndEventSchema,
  ToolCallStartEventSchema,
} from '../types/agent-events.js';
import {
  ActionCardBlockSchema,
  ActionSchema,
  CodeBlockSchema,
  ContentBlockSchema,
  FileBlockSchema,
  ImageBlockSchema,
  ProgressBlockSchema,
  ProposalBlockSchema,
  StepSchema,
  TableBlockSchema,
  TextBlockSchema,
  ThinkingBlockSchema,
  ToolCallBlockSchema,
  ToolResultBlockSchema,
} from '../types/content-blocks.js';

/* ================================================================
 * ActionSchema
 * ================================================================ */
describe('ActionSchema', () => {
  it('accepts a valid action with all fields', () => {
    const data = { id: 'a1', label: 'Approve', type: 'approve', payload: { key: 'value' } };
    expect(ActionSchema.parse(data)).toEqual(data);
  });

  it('accepts a valid action without optional payload', () => {
    const data = { id: 'a1', label: 'Reject', type: 'reject' };
    expect(ActionSchema.parse(data)).toEqual(data);
  });

  it('accepts a custom type action', () => {
    const data = { id: 'c1', label: 'Do thing', type: 'custom' };
    expect(ActionSchema.parse(data)).toEqual(data);
  });

  it('rejects an action with invalid type', () => {
    const data = { id: 'a1', label: 'Bad', type: 'invalid_type' };
    const result = ActionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects an action missing required id', () => {
    const data = { label: 'Approve', type: 'approve' };
    const result = ActionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects an action missing required label', () => {
    const data = { id: 'a1', type: 'approve' };
    const result = ActionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects an action missing required type', () => {
    const data = { id: 'a1', label: 'Approve' };
    const result = ActionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('strips extra fields', () => {
    const data = { id: 'a1', label: 'Approve', type: 'approve', extra: 'junk' };
    const parsed = ActionSchema.parse(data);
    expect(parsed).not.toHaveProperty('extra');
  });
});

/* ================================================================
 * StepSchema
 * ================================================================ */
describe('StepSchema', () => {
  it.each(['pending', 'running', 'done', 'error'] as const)('accepts status "%s"', (status) => {
    const data = { label: 'Step 1', status };
    expect(StepSchema.parse(data)).toEqual(data);
  });

  it('rejects an invalid status', () => {
    const result = StepSchema.safeParse({ label: 'Step', status: 'cancelled' });
    expect(result.success).toBe(false);
  });

  it('rejects missing label', () => {
    const result = StepSchema.safeParse({ status: 'done' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * TextBlockSchema
 * ================================================================ */
describe('TextBlockSchema', () => {
  it('accepts a valid text block', () => {
    const data = { type: 'text', text: 'Hello world' };
    expect(TextBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts an empty string', () => {
    const data = { type: 'text', text: '' };
    expect(TextBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects text exceeding 100000 characters', () => {
    const data = { type: 'text', text: 'a'.repeat(100001) };
    const result = TextBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('accepts text at exactly 100000 characters', () => {
    const data = { type: 'text', text: 'a'.repeat(100000) };
    expect(TextBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects wrong type literal', () => {
    const data = { type: 'code_block', text: 'Hello' };
    const result = TextBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing text field', () => {
    const result = TextBlockSchema.safeParse({ type: 'text' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ToolCallBlockSchema
 * ================================================================ */
describe('ToolCallBlockSchema', () => {
  it('accepts a valid tool call with all fields', () => {
    const data = {
      type: 'tool_call',
      name: 'search',
      input: { query: 'test' },
      status: 'running',
      call_id: 'call_123',
    };
    expect(ToolCallBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts a tool call without optional call_id', () => {
    const data = { type: 'tool_call', name: 'search', input: null, status: 'done' };
    expect(ToolCallBlockSchema.parse(data)).toEqual(data);
  });

  it.each(['running', 'done', 'error'] as const)('accepts status "%s"', (status) => {
    const data = { type: 'tool_call', name: 'fn', input: {}, status };
    expect(ToolCallBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects invalid status', () => {
    const data = { type: 'tool_call', name: 'fn', input: {}, status: 'pending' };
    const result = ToolCallBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const data = { type: 'tool_call', input: {}, status: 'done' };
    const result = ToolCallBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ToolResultBlockSchema
 * ================================================================ */
describe('ToolResultBlockSchema', () => {
  it('accepts a valid tool result with all fields', () => {
    const data = {
      type: 'tool_result',
      name: 'search',
      result: '42 results found',
      duration_ms: 150,
      is_error: false,
    };
    expect(ToolResultBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts without optional is_error', () => {
    const data = { type: 'tool_result', name: 'fn', result: 'ok', duration_ms: 10 };
    expect(ToolResultBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects non-number duration_ms', () => {
    const data = { type: 'tool_result', name: 'fn', result: 'ok', duration_ms: '10' };
    const result = ToolResultBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing result', () => {
    const data = { type: 'tool_result', name: 'fn', duration_ms: 10 };
    const result = ToolResultBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CodeBlockSchema
 * ================================================================ */
describe('CodeBlockSchema', () => {
  it('accepts a valid code block with output', () => {
    const data = {
      type: 'code_block',
      language: 'typescript',
      code: 'console.log("hi")',
      output: 'hi',
    };
    expect(CodeBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts without optional output', () => {
    const data = { type: 'code_block', language: 'python', code: 'print(1)' };
    expect(CodeBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects missing language', () => {
    const data = { type: 'code_block', code: 'x = 1' };
    const result = CodeBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing code', () => {
    const data = { type: 'code_block', language: 'python' };
    const result = CodeBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ProposalBlockSchema
 * ================================================================ */
describe('ProposalBlockSchema', () => {
  it('accepts a valid proposal with actions', () => {
    const data = {
      type: 'proposal',
      id: 'p1',
      title: 'Deploy to prod?',
      status: 'pending',
      actions: [{ id: 'a1', label: 'Approve', type: 'approve' }],
    };
    expect(ProposalBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts a proposal with empty actions array', () => {
    const data = { type: 'proposal', id: 'p1', title: 'Title', status: 'done', actions: [] };
    expect(ProposalBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects if actions contain invalid action', () => {
    const data = {
      type: 'proposal',
      id: 'p1',
      title: 'Title',
      status: 'pending',
      actions: [{ id: 'a1', label: 'Go', type: 'BAD_TYPE' }],
    };
    const result = ProposalBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing title', () => {
    const data = { type: 'proposal', id: 'p1', status: 'done', actions: [] };
    const result = ProposalBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ProgressBlockSchema
 * ================================================================ */
describe('ProgressBlockSchema', () => {
  it('accepts a valid progress block', () => {
    const data = {
      type: 'progress',
      steps: [
        { label: 'Build', status: 'done' },
        { label: 'Test', status: 'running' },
      ],
      current: 1,
    };
    expect(ProgressBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts empty steps array', () => {
    const data = { type: 'progress', steps: [], current: 0 };
    expect(ProgressBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects non-number current', () => {
    const data = { type: 'progress', steps: [], current: 'zero' };
    const result = ProgressBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects invalid step within steps array', () => {
    const data = { type: 'progress', steps: [{ label: 'Bad' }], current: 0 };
    const result = ProgressBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ThinkingBlockSchema
 * ================================================================ */
describe('ThinkingBlockSchema', () => {
  it('accepts a valid thinking block with detail', () => {
    const data = {
      type: 'thinking',
      summary: 'Considering options',
      detail: 'Weighing pros and cons...',
    };
    expect(ThinkingBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts without optional detail', () => {
    const data = { type: 'thinking', summary: 'Thinking...' };
    expect(ThinkingBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects missing summary', () => {
    const data = { type: 'thinking' };
    const result = ThinkingBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ImageBlockSchema
 * ================================================================ */
describe('ImageBlockSchema', () => {
  it('accepts a valid image block', () => {
    const data = { type: 'image', url: 'https://example.com/img.png' };
    expect(ImageBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects missing url', () => {
    const result = ImageBlockSchema.safeParse({ type: 'image' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * FileBlockSchema
 * ================================================================ */
describe('FileBlockSchema', () => {
  it('accepts a valid file block', () => {
    const data = {
      type: 'file',
      url: 'https://cdn.example.com/doc.pdf',
      name: 'doc.pdf',
      size: 1024,
    };
    expect(FileBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects missing name', () => {
    const data = { type: 'file', url: 'https://cdn.example.com/doc.pdf', size: 1024 };
    const result = FileBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects missing size', () => {
    const data = { type: 'file', url: 'https://cdn.example.com/doc.pdf', name: 'doc.pdf' };
    const result = FileBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects non-number size', () => {
    const data = {
      type: 'file',
      url: 'https://cdn.example.com/doc.pdf',
      name: 'doc.pdf',
      size: '1024',
    };
    const result = FileBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * TableBlockSchema
 * ================================================================ */
describe('TableBlockSchema', () => {
  it('accepts a valid table block', () => {
    const data = {
      type: 'table',
      headers: ['Name', 'Age'],
      rows: [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    };
    expect(TableBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts empty headers and rows', () => {
    const data = { type: 'table', headers: [], rows: [] };
    expect(TableBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects non-string header values', () => {
    const data = { type: 'table', headers: [123], rows: [] };
    const result = TableBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects non-string cell values in rows', () => {
    const data = { type: 'table', headers: ['Col'], rows: [[42]] };
    const result = TableBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ActionCardBlockSchema
 * ================================================================ */
describe('ActionCardBlockSchema', () => {
  it('accepts a valid action card', () => {
    const data = {
      type: 'action_card',
      title: 'Pick one',
      actions: [{ id: 'a1', label: 'Option A', type: 'custom' }],
    };
    expect(ActionCardBlockSchema.parse(data)).toEqual(data);
  });

  it('accepts an action card with empty actions', () => {
    const data = { type: 'action_card', title: 'No actions', actions: [] };
    expect(ActionCardBlockSchema.parse(data)).toEqual(data);
  });

  it('rejects missing title', () => {
    const data = { type: 'action_card', actions: [] };
    const result = ActionCardBlockSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * ContentBlockSchema (discriminated union)
 * ================================================================ */
describe('ContentBlockSchema', () => {
  it('parses a text block', () => {
    const result = ContentBlockSchema.parse({ type: 'text', text: 'hello' });
    expect(result.type).toBe('text');
  });

  it('parses a tool_call block', () => {
    const result = ContentBlockSchema.parse({
      type: 'tool_call',
      name: 'fn',
      input: {},
      status: 'done',
    });
    expect(result.type).toBe('tool_call');
  });

  it('parses a tool_result block', () => {
    const result = ContentBlockSchema.parse({
      type: 'tool_result',
      name: 'fn',
      result: 'ok',
      duration_ms: 5,
    });
    expect(result.type).toBe('tool_result');
  });

  it('parses a code_block block', () => {
    const result = ContentBlockSchema.parse({
      type: 'code_block',
      language: 'js',
      code: 'x()',
    });
    expect(result.type).toBe('code_block');
  });

  it('parses a proposal block', () => {
    const result = ContentBlockSchema.parse({
      type: 'proposal',
      id: 'p1',
      title: 'T',
      status: 'open',
      actions: [],
    });
    expect(result.type).toBe('proposal');
  });

  it('parses a progress block', () => {
    const result = ContentBlockSchema.parse({
      type: 'progress',
      steps: [],
      current: 0,
    });
    expect(result.type).toBe('progress');
  });

  it('parses a thinking block', () => {
    const result = ContentBlockSchema.parse({
      type: 'thinking',
      summary: 'hmm',
    });
    expect(result.type).toBe('thinking');
  });

  it('parses an image block', () => {
    const result = ContentBlockSchema.parse({
      type: 'image',
      url: 'https://img.png',
    });
    expect(result.type).toBe('image');
  });

  it('parses a file block', () => {
    const result = ContentBlockSchema.parse({
      type: 'file',
      url: 'https://f.pdf',
      name: 'f.pdf',
      size: 999,
    });
    expect(result.type).toBe('file');
  });

  it('parses a table block', () => {
    const result = ContentBlockSchema.parse({
      type: 'table',
      headers: ['H'],
      rows: [['V']],
    });
    expect(result.type).toBe('table');
  });

  it('parses an action_card block', () => {
    const result = ContentBlockSchema.parse({
      type: 'action_card',
      title: 'T',
      actions: [],
    });
    expect(result.type).toBe('action_card');
  });

  it('rejects an unknown block type', () => {
    const result = ContentBlockSchema.safeParse({ type: 'unknown', foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('rejects a block missing its type field', () => {
    const result = ContentBlockSchema.safeParse({ text: 'hello' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * Agent Event Schemas
 * ================================================================ */
describe('RunStartedEventSchema', () => {
  it('accepts valid data', () => {
    const data = { type: 'run_started', run_id: 'r1', agent_id: 'ag1' };
    expect(RunStartedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing run_id', () => {
    const result = RunStartedEventSchema.safeParse({ type: 'run_started', agent_id: 'ag1' });
    expect(result.success).toBe(false);
  });

  it('rejects missing agent_id', () => {
    const result = RunStartedEventSchema.safeParse({ type: 'run_started', run_id: 'r1' });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type literal', () => {
    const result = RunStartedEventSchema.safeParse({
      type: 'run_finished',
      run_id: 'r1',
      agent_id: 'ag1',
    });
    expect(result.success).toBe(false);
  });
});

describe('TextDeltaEventSchema', () => {
  it('accepts valid data', () => {
    const data = { type: 'text_delta', text: 'chunk' };
    expect(TextDeltaEventSchema.parse(data)).toEqual(data);
  });

  it('accepts empty text', () => {
    const data = { type: 'text_delta', text: '' };
    expect(TextDeltaEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing text', () => {
    const result = TextDeltaEventSchema.safeParse({ type: 'text_delta' });
    expect(result.success).toBe(false);
  });
});

describe('ToolCallStartEventSchema', () => {
  it('accepts valid data with input', () => {
    const data = { type: 'tool_call_start', name: 'search', call_id: 'c1', input: { q: 'test' } };
    expect(ToolCallStartEventSchema.parse(data)).toEqual(data);
  });

  it('accepts without optional input', () => {
    const data = { type: 'tool_call_start', name: 'search', call_id: 'c1' };
    expect(ToolCallStartEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing name', () => {
    const result = ToolCallStartEventSchema.safeParse({ type: 'tool_call_start', call_id: 'c1' });
    expect(result.success).toBe(false);
  });

  it('rejects missing call_id', () => {
    const result = ToolCallStartEventSchema.safeParse({ type: 'tool_call_start', name: 'fn' });
    expect(result.success).toBe(false);
  });
});

describe('ToolCallEndEventSchema', () => {
  it('accepts valid data', () => {
    const data = {
      type: 'tool_call_end',
      name: 'search',
      call_id: 'c1',
      result: 'found 5',
      duration_ms: 200,
    };
    expect(ToolCallEndEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing result', () => {
    const result = ToolCallEndEventSchema.safeParse({
      type: 'tool_call_end',
      name: 'fn',
      call_id: 'c1',
      duration_ms: 10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing duration_ms', () => {
    const result = ToolCallEndEventSchema.safeParse({
      type: 'tool_call_end',
      name: 'fn',
      call_id: 'c1',
      result: 'ok',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-number duration_ms', () => {
    const result = ToolCallEndEventSchema.safeParse({
      type: 'tool_call_end',
      name: 'fn',
      call_id: 'c1',
      result: 'ok',
      duration_ms: 'fast',
    });
    expect(result.success).toBe(false);
  });
});

describe('StepStartedEventSchema', () => {
  it('accepts valid data', () => {
    const data = { type: 'step_started', step: 'planning', index: 0 };
    expect(StepStartedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing step', () => {
    const result = StepStartedEventSchema.safeParse({ type: 'step_started', index: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects missing index', () => {
    const result = StepStartedEventSchema.safeParse({ type: 'step_started', step: 'plan' });
    expect(result.success).toBe(false);
  });

  it('rejects non-number index', () => {
    const result = StepStartedEventSchema.safeParse({
      type: 'step_started',
      step: 'plan',
      index: 'first',
    });
    expect(result.success).toBe(false);
  });
});

describe('ThinkingEventSchema', () => {
  it('accepts valid data', () => {
    const data = { type: 'thinking', summary: 'Evaluating options' };
    expect(ThinkingEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing summary', () => {
    const result = ThinkingEventSchema.safeParse({ type: 'thinking' });
    expect(result.success).toBe(false);
  });
});

describe('RunFinishedEventSchema', () => {
  it('accepts valid data', () => {
    const data = { type: 'run_finished', usage: { input_tokens: 100, output_tokens: 50 } };
    expect(RunFinishedEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing usage', () => {
    const result = RunFinishedEventSchema.safeParse({ type: 'run_finished' });
    expect(result.success).toBe(false);
  });

  it('rejects usage with missing input_tokens', () => {
    const result = RunFinishedEventSchema.safeParse({
      type: 'run_finished',
      usage: { output_tokens: 50 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects usage with missing output_tokens', () => {
    const result = RunFinishedEventSchema.safeParse({
      type: 'run_finished',
      usage: { input_tokens: 100 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-number token counts', () => {
    const result = RunFinishedEventSchema.safeParse({
      type: 'run_finished',
      usage: { input_tokens: 'many', output_tokens: 50 },
    });
    expect(result.success).toBe(false);
  });
});

describe('RunErrorEventSchema', () => {
  it('accepts valid data', () => {
    const data = { type: 'run_error', error: 'Something went wrong' };
    expect(RunErrorEventSchema.parse(data)).toEqual(data);
  });

  it('rejects missing error', () => {
    const result = RunErrorEventSchema.safeParse({ type: 'run_error' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * AgentEventSchema (discriminated union)
 * ================================================================ */
describe('AgentEventSchema', () => {
  it('dispatches run_started correctly', () => {
    const result = AgentEventSchema.parse({ type: 'run_started', run_id: 'r1', agent_id: 'a1' });
    expect(result.type).toBe('run_started');
  });

  it('dispatches text_delta correctly', () => {
    const result = AgentEventSchema.parse({ type: 'text_delta', text: 'hi' });
    expect(result.type).toBe('text_delta');
  });

  it('dispatches tool_call_start correctly', () => {
    const result = AgentEventSchema.parse({ type: 'tool_call_start', name: 'fn', call_id: 'c1' });
    expect(result.type).toBe('tool_call_start');
  });

  it('dispatches tool_call_end correctly', () => {
    const result = AgentEventSchema.parse({
      type: 'tool_call_end',
      name: 'fn',
      call_id: 'c1',
      result: 'ok',
      duration_ms: 5,
    });
    expect(result.type).toBe('tool_call_end');
  });

  it('dispatches step_started correctly', () => {
    const result = AgentEventSchema.parse({ type: 'step_started', step: 's', index: 0 });
    expect(result.type).toBe('step_started');
  });

  it('dispatches thinking correctly', () => {
    const result = AgentEventSchema.parse({ type: 'thinking', summary: 'hmm' });
    expect(result.type).toBe('thinking');
  });

  it('dispatches run_finished correctly', () => {
    const result = AgentEventSchema.parse({
      type: 'run_finished',
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    expect(result.type).toBe('run_finished');
  });

  it('dispatches run_error correctly', () => {
    const result = AgentEventSchema.parse({ type: 'run_error', error: 'boom' });
    expect(result.type).toBe('run_error');
  });

  it('rejects an unknown event type', () => {
    const result = AgentEventSchema.safeParse({ type: 'unknown_event' });
    expect(result.success).toBe(false);
  });

  it('rejects an event with correct type but invalid fields', () => {
    const result = AgentEventSchema.safeParse({ type: 'run_started' }); // missing run_id, agent_id
    expect(result.success).toBe(false);
  });

  it('dispatches tool_approval_request correctly', () => {
    const result = AgentEventSchema.parse({
      type: 'tool_approval_request',
      request_id: 'req-1',
      tool_name: 'web_search',
      args_preview: '{"query": "test"}',
      scopes: ['allow_once', 'allow_for_session'],
    });
    expect(result.type).toBe('tool_approval_request');
  });
});

/* ================================================================
 * ToolApprovalRequestEventSchema
 * ================================================================ */
describe('ToolApprovalRequestEventSchema', () => {
  it('accepts valid data with all fields', () => {
    const data = {
      type: 'tool_approval_request',
      request_id: 'req-123',
      tool_name: 'web_search',
      args_preview: '{"query": "latest news"}',
      scopes: ['allow_once', 'allow_for_session', 'always_for_agent_tool'],
    };
    expect(ToolApprovalRequestEventSchema.parse(data)).toEqual(data);
  });

  it('accepts empty scopes array', () => {
    const data = {
      type: 'tool_approval_request',
      request_id: 'req-1',
      tool_name: 'fn',
      args_preview: '{}',
      scopes: [],
    };
    expect(ToolApprovalRequestEventSchema.parse(data).scopes).toEqual([]);
  });

  it('rejects missing request_id', () => {
    const result = ToolApprovalRequestEventSchema.safeParse({
      type: 'tool_approval_request',
      tool_name: 'fn',
      args_preview: '{}',
      scopes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing tool_name', () => {
    const result = ToolApprovalRequestEventSchema.safeParse({
      type: 'tool_approval_request',
      request_id: 'req-1',
      args_preview: '{}',
      scopes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing args_preview', () => {
    const result = ToolApprovalRequestEventSchema.safeParse({
      type: 'tool_approval_request',
      request_id: 'req-1',
      tool_name: 'fn',
      scopes: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing scopes', () => {
    const result = ToolApprovalRequestEventSchema.safeParse({
      type: 'tool_approval_request',
      request_id: 'req-1',
      tool_name: 'fn',
      args_preview: '{}',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type literal', () => {
    const result = ToolApprovalRequestEventSchema.safeParse({
      type: 'tool_call_start',
      request_id: 'req-1',
      tool_name: 'fn',
      args_preview: '{}',
      scopes: [],
    });
    expect(result.success).toBe(false);
  });
});
