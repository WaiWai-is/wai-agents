import { describe, expect, it } from 'vitest';
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
 * TextBlockSchema
 * ================================================================ */
describe('TextBlockSchema', () => {
  it('accepts valid text block', () => {
    expect(TextBlockSchema.parse({ type: 'text', text: 'hello' })).toEqual({
      type: 'text',
      text: 'hello',
    });
  });

  it('accepts empty text', () => {
    expect(TextBlockSchema.parse({ type: 'text', text: '' }).text).toBe('');
  });

  it('rejects text exceeding 100000 characters', () => {
    expect(TextBlockSchema.safeParse({ type: 'text', text: 'a'.repeat(100001) }).success).toBe(
      false,
    );
  });

  it('accepts text at exactly 100000 characters', () => {
    const text = 'a'.repeat(100000);
    expect(TextBlockSchema.parse({ type: 'text', text }).text.length).toBe(100000);
  });

  it('rejects wrong type literal', () => {
    expect(TextBlockSchema.safeParse({ type: 'code_block', text: 'hello' }).success).toBe(false);
  });

  it('rejects missing text field', () => {
    expect(TextBlockSchema.safeParse({ type: 'text' }).success).toBe(false);
  });

  it('rejects numeric text', () => {
    expect(TextBlockSchema.safeParse({ type: 'text', text: 42 }).success).toBe(false);
  });
});

/* ================================================================
 * ToolCallBlockSchema
 * ================================================================ */
describe('ToolCallBlockSchema', () => {
  it('accepts valid tool call with all statuses', () => {
    for (const status of ['running', 'done', 'error'] as const) {
      expect(
        ToolCallBlockSchema.parse({
          type: 'tool_call',
          name: 'search',
          input: { q: 'test' },
          status,
        }).status,
      ).toBe(status);
    }
  });

  it('accepts tool call with optional call_id', () => {
    const result = ToolCallBlockSchema.parse({
      type: 'tool_call',
      name: 'search',
      input: null,
      status: 'running',
      call_id: 'tc-123',
    });
    expect(result.call_id).toBe('tc-123');
  });

  it('rejects invalid status', () => {
    expect(
      ToolCallBlockSchema.safeParse({
        type: 'tool_call',
        name: 'search',
        input: null,
        status: 'pending',
      }).success,
    ).toBe(false);
  });

  it('rejects missing name', () => {
    expect(
      ToolCallBlockSchema.safeParse({
        type: 'tool_call',
        input: null,
        status: 'running',
      }).success,
    ).toBe(false);
  });
});

/* ================================================================
 * ToolResultBlockSchema
 * ================================================================ */
describe('ToolResultBlockSchema', () => {
  it('accepts valid tool result', () => {
    const result = ToolResultBlockSchema.parse({
      type: 'tool_result',
      name: 'search',
      result: 'Found 5 results',
      duration_ms: 150,
    });
    expect(result.name).toBe('search');
    expect(result.duration_ms).toBe(150);
  });

  it('accepts optional is_error field', () => {
    const result = ToolResultBlockSchema.parse({
      type: 'tool_result',
      name: 'search',
      result: 'Error',
      duration_ms: 50,
      is_error: true,
    });
    expect(result.is_error).toBe(true);
  });

  it('rejects missing duration_ms', () => {
    expect(
      ToolResultBlockSchema.safeParse({
        type: 'tool_result',
        name: 'search',
        result: 'ok',
      }).success,
    ).toBe(false);
  });

  it('rejects negative duration_ms (still valid number)', () => {
    // Zod allows negative numbers by default
    const result = ToolResultBlockSchema.parse({
      type: 'tool_result',
      name: 'search',
      result: 'ok',
      duration_ms: -1,
    });
    expect(result.duration_ms).toBe(-1);
  });
});

/* ================================================================
 * CodeBlockSchema
 * ================================================================ */
describe('CodeBlockSchema', () => {
  it('accepts valid code block', () => {
    const result = CodeBlockSchema.parse({
      type: 'code_block',
      language: 'typescript',
      code: 'console.log("hi")',
    });
    expect(result.language).toBe('typescript');
  });

  it('accepts code block with optional output', () => {
    const result = CodeBlockSchema.parse({
      type: 'code_block',
      language: 'python',
      code: 'print("hi")',
      output: 'hi',
    });
    expect(result.output).toBe('hi');
  });

  it('accepts empty language and code', () => {
    const result = CodeBlockSchema.parse({
      type: 'code_block',
      language: '',
      code: '',
    });
    expect(result.language).toBe('');
  });
});

/* ================================================================
 * ProposalBlockSchema
 * ================================================================ */
describe('ProposalBlockSchema', () => {
  it('accepts valid proposal', () => {
    const result = ProposalBlockSchema.parse({
      type: 'proposal',
      id: 'p1',
      title: 'Deploy to production',
      status: 'pending',
      actions: [{ id: 'a1', label: 'Approve', type: 'approve' }],
    });
    expect(result.actions.length).toBe(1);
  });

  it('accepts proposal with empty actions', () => {
    const result = ProposalBlockSchema.parse({
      type: 'proposal',
      id: 'p2',
      title: 'Empty',
      status: 'draft',
      actions: [],
    });
    expect(result.actions).toEqual([]);
  });
});

/* ================================================================
 * ProgressBlockSchema
 * ================================================================ */
describe('ProgressBlockSchema', () => {
  it('accepts valid progress block', () => {
    const result = ProgressBlockSchema.parse({
      type: 'progress',
      steps: [
        { label: 'Step 1', status: 'done' },
        { label: 'Step 2', status: 'running' },
        { label: 'Step 3', status: 'pending' },
      ],
      current: 1,
    });
    expect(result.steps.length).toBe(3);
    expect(result.current).toBe(1);
  });

  it('accepts progress with zero current', () => {
    const result = ProgressBlockSchema.parse({
      type: 'progress',
      steps: [{ label: 'First', status: 'pending' }],
      current: 0,
    });
    expect(result.current).toBe(0);
  });
});

/* ================================================================
 * StepSchema
 * ================================================================ */
describe('StepSchema', () => {
  it('accepts all valid statuses', () => {
    for (const status of ['pending', 'running', 'done', 'error'] as const) {
      expect(StepSchema.parse({ label: 'Step', status }).status).toBe(status);
    }
  });

  it('rejects invalid status', () => {
    expect(StepSchema.safeParse({ label: 'Step', status: 'unknown' }).success).toBe(false);
  });
});

/* ================================================================
 * ActionSchema
 * ================================================================ */
describe('ActionSchema', () => {
  it('accepts all valid action types', () => {
    for (const type of ['approve', 'reject', 'custom'] as const) {
      expect(ActionSchema.parse({ id: 'a1', label: 'Action', type }).type).toBe(type);
    }
  });

  it('accepts action with optional payload', () => {
    const result = ActionSchema.parse({
      id: 'a1',
      label: 'Execute',
      type: 'custom',
      payload: { command: 'deploy', env: 'staging' },
    });
    expect(result.payload).toEqual({ command: 'deploy', env: 'staging' });
  });

  it('rejects invalid action type', () => {
    expect(ActionSchema.safeParse({ id: 'a1', label: 'X', type: 'unknown' }).success).toBe(false);
  });
});

/* ================================================================
 * ThinkingBlockSchema
 * ================================================================ */
describe('ThinkingBlockSchema', () => {
  it('accepts thinking with summary only', () => {
    const result = ThinkingBlockSchema.parse({
      type: 'thinking',
      summary: 'Analyzing the request...',
    });
    expect(result.summary).toBe('Analyzing the request...');
    expect(result.detail).toBeUndefined();
  });

  it('accepts thinking with detail', () => {
    const result = ThinkingBlockSchema.parse({
      type: 'thinking',
      summary: 'short',
      detail: 'long detailed explanation',
    });
    expect(result.detail).toBe('long detailed explanation');
  });
});

/* ================================================================
 * ImageBlockSchema
 * ================================================================ */
describe('ImageBlockSchema', () => {
  it('accepts valid image block', () => {
    const result = ImageBlockSchema.parse({
      type: 'image',
      url: 'https://example.com/img.png',
    });
    expect(result.url).toBe('https://example.com/img.png');
  });

  it('rejects missing url', () => {
    expect(ImageBlockSchema.safeParse({ type: 'image' }).success).toBe(false);
  });
});

/* ================================================================
 * FileBlockSchema
 * ================================================================ */
describe('FileBlockSchema', () => {
  it('accepts valid file block', () => {
    const result = FileBlockSchema.parse({
      type: 'file',
      url: 'https://storage.example.com/doc.pdf',
      name: 'document.pdf',
      size: 1024000,
    });
    expect(result.name).toBe('document.pdf');
    expect(result.size).toBe(1024000);
  });

  it('accepts zero-size file', () => {
    const result = FileBlockSchema.parse({
      type: 'file',
      url: 'https://example.com/empty',
      name: 'empty.txt',
      size: 0,
    });
    expect(result.size).toBe(0);
  });
});

/* ================================================================
 * TableBlockSchema
 * ================================================================ */
describe('TableBlockSchema', () => {
  it('accepts valid table', () => {
    const result = TableBlockSchema.parse({
      type: 'table',
      headers: ['Name', 'Age'],
      rows: [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    });
    expect(result.headers.length).toBe(2);
    expect(result.rows.length).toBe(2);
  });

  it('accepts empty table', () => {
    const result = TableBlockSchema.parse({
      type: 'table',
      headers: [],
      rows: [],
    });
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('rejects rows with non-string values', () => {
    expect(
      TableBlockSchema.safeParse({
        type: 'table',
        headers: ['A'],
        rows: [[42]],
      }).success,
    ).toBe(false);
  });
});

/* ================================================================
 * ActionCardBlockSchema
 * ================================================================ */
describe('ActionCardBlockSchema', () => {
  it('accepts valid action card', () => {
    const result = ActionCardBlockSchema.parse({
      type: 'action_card',
      title: 'Confirm deployment',
      actions: [
        { id: 'a1', label: 'Deploy', type: 'approve' },
        { id: 'a2', label: 'Cancel', type: 'reject' },
      ],
    });
    expect(result.actions.length).toBe(2);
  });
});

/* ================================================================
 * ContentBlockSchema — discriminated union
 * ================================================================ */
describe('ContentBlockSchema — discriminated union', () => {
  it('correctly parses text block', () => {
    const result = ContentBlockSchema.parse({ type: 'text', text: 'hello' });
    expect(result.type).toBe('text');
  });

  it('correctly parses tool_call block', () => {
    const result = ContentBlockSchema.parse({
      type: 'tool_call',
      name: 'search',
      input: null,
      status: 'done',
    });
    expect(result.type).toBe('tool_call');
  });

  it('rejects unknown block type', () => {
    expect(ContentBlockSchema.safeParse({ type: 'unknown_type', data: 42 }).success).toBe(false);
  });

  it('rejects block with missing required fields for type', () => {
    expect(ContentBlockSchema.safeParse({ type: 'text' }).success).toBe(false);
  });
});
