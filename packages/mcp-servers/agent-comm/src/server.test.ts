import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  sql: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { sql } from './db.js';
import {
  SendToAgentInput,
  CreateAgentConversationInput,
  ReadConversationInput,
  ListAgentConversationsInput,
  GetAgentInfoInput,
  handleSendToAgent,
  handleCreateAgentConversation,
  handleReadConversation,
  handleListAgentConversations,
  handleGetAgentInfo,
} from './tools.js';

const AGENT_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AGENT_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONV_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeSqlResult(rows: unknown[] = [], count = 0) {
  return Object.assign([...rows], { count });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSql(rows: unknown[] = [], count = 0): any {
  return Promise.resolve(makeSqlResult(rows, count));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_KEY = 'test-internal-key';
  vi.mocked(sql).mockReturnValue(mockSql([], 1));
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ response: 'Agent reply' }),
    status: 200,
    statusText: 'OK',
  });
});

// ─── Input Validation Tests ───────────────────────────────────────────────────

describe('SendToAgentInput schema', () => {
  it('accepts valid input with defaults', () => {
    const result = SendToAgentInput.safeParse({
      from_agent_id: AGENT_ID_1,
      to_agent_id: AGENT_ID_2,
      message: 'Hello agent',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.a2a_depth).toBe(0);
    }
  });

  it('accepts a2a_depth override', () => {
    const result = SendToAgentInput.safeParse({
      from_agent_id: AGENT_ID_1,
      to_agent_id: AGENT_ID_2,
      message: 'Hello',
      a2a_depth: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.a2a_depth).toBe(2);
    }
  });

  it('rejects invalid UUID for from_agent_id', () => {
    const result = SendToAgentInput.safeParse({
      from_agent_id: 'not-a-uuid',
      to_agent_id: AGENT_ID_2,
      message: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty message', () => {
    const result = SendToAgentInput.safeParse({
      from_agent_id: AGENT_ID_1,
      to_agent_id: AGENT_ID_2,
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative a2a_depth', () => {
    const result = SendToAgentInput.safeParse({
      from_agent_id: AGENT_ID_1,
      to_agent_id: AGENT_ID_2,
      message: 'Hello',
      a2a_depth: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateAgentConversationInput schema', () => {
  it('accepts valid input with 2+ agents', () => {
    const result = CreateAgentConversationInput.safeParse({
      agent_ids: [AGENT_ID_1, AGENT_ID_2],
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional title', () => {
    const result = CreateAgentConversationInput.safeParse({
      agent_ids: [AGENT_ID_1, AGENT_ID_2],
      title: 'Research coordination',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Research coordination');
    }
  });

  it('rejects fewer than 2 agents', () => {
    const result = CreateAgentConversationInput.safeParse({
      agent_ids: [AGENT_ID_1],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid agent UUID', () => {
    const result = CreateAgentConversationInput.safeParse({
      agent_ids: ['not-a-uuid', AGENT_ID_2],
    });
    expect(result.success).toBe(false);
  });
});

describe('ReadConversationInput schema', () => {
  it('accepts valid input with defaults', () => {
    const result = ReadConversationInput.safeParse({ conversation_id: CONV_ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('rejects invalid UUID', () => {
    const result = ReadConversationInput.safeParse({ conversation_id: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects limit over 100', () => {
    const result = ReadConversationInput.safeParse({
      conversation_id: CONV_ID,
      limit: 101,
    });
    expect(result.success).toBe(false);
  });
});

describe('ListAgentConversationsInput schema', () => {
  it('accepts valid UUID', () => {
    const result = ListAgentConversationsInput.safeParse({ agent_id: AGENT_ID_1 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = ListAgentConversationsInput.safeParse({ agent_id: 'bad-id' });
    expect(result.success).toBe(false);
  });
});

describe('GetAgentInfoInput schema', () => {
  it('accepts valid UUID', () => {
    const result = GetAgentInfoInput.safeParse({ agent_id: AGENT_ID_1 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const result = GetAgentInfoInput.safeParse({ agent_id: 'not-uuid' });
    expect(result.success).toBe(false);
  });
});

// ─── Handler Tests ────────────────────────────────────────────────────────────

describe('handleSendToAgent', () => {
  it('throws when a2a_depth >= 3', async () => {
    await expect(
      handleSendToAgent({
        from_agent_id: AGENT_ID_1,
        to_agent_id: AGENT_ID_2,
        message: 'Hello',
        a2a_depth: 3,
      }),
    ).rejects.toThrow('Maximum A2A depth exceeded');
  });

  it('uses existing conversation when found', async () => {
    // Flow: get caller name, find existing conv, insert message, insert task, update task→working, update task→completed
    vi.mocked(sql)
      .mockReturnValueOnce(mockSql([{ name: 'TestAgent' }], 1))  // get caller name
      .mockReturnValueOnce(mockSql([{ id: CONV_ID }], 1))        // find existing conv
      .mockReturnValueOnce(mockSql([], 1))                        // insert message
      .mockReturnValueOnce(mockSql([], 1))                        // insert task
      .mockReturnValueOnce(mockSql([], 1))                        // update task→working
      .mockReturnValueOnce(mockSql([], 1));                       // update task→completed

    const result = await handleSendToAgent({
      from_agent_id: AGENT_ID_1,
      to_agent_id: AGENT_ID_2,
      message: 'Hello',
      a2a_depth: 0,
    });

    expect(result.conversation_id).toBe(CONV_ID);
    expect(result.response).toBe('Agent reply');
    expect(sql).toHaveBeenCalledTimes(6);
  });

  it('creates new conversation when none exists', async () => {
    // Flow: get caller name, no existing conv, create conv, insert members, insert msg, insert task, update→working, update→completed
    vi.mocked(sql)
      .mockReturnValueOnce(mockSql([{ name: 'TestAgent' }], 1))  // get caller name
      .mockReturnValueOnce(mockSql([], 0))                        // no existing conv
      .mockReturnValueOnce(mockSql([], 1))                        // create conversation
      .mockReturnValueOnce(mockSql([], 2))                        // insert members
      .mockReturnValueOnce(mockSql([], 1))                        // insert message
      .mockReturnValueOnce(mockSql([], 1))                        // insert task
      .mockReturnValueOnce(mockSql([], 1))                        // update task→working
      .mockReturnValueOnce(mockSql([], 1));                       // update task→completed

    const result = await handleSendToAgent({
      from_agent_id: AGENT_ID_1,
      to_agent_id: AGENT_ID_2,
      message: 'New conversation',
      a2a_depth: 0,
    });

    expect(result.conversation_id).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(result.response).toBe('Agent reply');
    expect(sql).toHaveBeenCalledTimes(8);
  });

  it('increments a2a_depth in API call', async () => {
    vi.mocked(sql)
      .mockReturnValueOnce(mockSql([{ name: 'TestAgent' }], 1))  // get caller name
      .mockReturnValueOnce(mockSql([{ id: CONV_ID }], 1))        // find existing conv
      .mockReturnValueOnce(mockSql([], 1))                        // insert message
      .mockReturnValueOnce(mockSql([], 1))                        // insert task
      .mockReturnValueOnce(mockSql([], 1))                        // update task→working
      .mockReturnValueOnce(mockSql([], 1));                       // update task→completed

    await handleSendToAgent({
      from_agent_id: AGENT_ID_1,
      to_agent_id: AGENT_ID_2,
      message: 'Test',
      a2a_depth: 1,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.a2aDepth).toBe(2);
  });

  it('throws when API call fails', async () => {
    vi.mocked(sql)
      .mockReturnValueOnce(mockSql([{ name: 'TestAgent' }], 1))  // get caller name
      .mockReturnValueOnce(mockSql([{ id: CONV_ID }], 1))        // find existing conv
      .mockReturnValueOnce(mockSql([], 1))                        // insert message
      .mockReturnValueOnce(mockSql([], 1))                        // insert task
      .mockReturnValueOnce(mockSql([], 1))                        // update task→working
      .mockReturnValueOnce(mockSql([], 1));                       // update task→failed

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Internal Server Error',
    });

    await expect(
      handleSendToAgent({
        from_agent_id: AGENT_ID_1,
        to_agent_id: AGENT_ID_2,
        message: 'Test',
        a2a_depth: 0,
      }),
    ).rejects.toThrow('Agent execution failed: 500 Internal Server Error');
  });
});

describe('handleCreateAgentConversation', () => {
  it('creates conversation and inserts members', async () => {
    vi.mocked(sql)
      .mockReturnValueOnce(mockSql([], 1))  // insert conversation
      .mockReturnValueOnce(mockSql([], 1))  // insert member 1
      .mockReturnValueOnce(mockSql([], 1)); // insert member 2

    const result = await handleCreateAgentConversation({
      agent_ids: [AGENT_ID_1, AGENT_ID_2],
      title: 'Test conversation',
    });

    expect(result).toHaveProperty('conversation_id');
    expect(typeof result.conversation_id).toBe('string');
    // 1 conversation insert + 2 member inserts
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it('creates conversation without title', async () => {
    vi.mocked(sql)
      .mockReturnValueOnce(mockSql([], 1))
      .mockReturnValueOnce(mockSql([], 1))
      .mockReturnValueOnce(mockSql([], 1));

    const result = await handleCreateAgentConversation({
      agent_ids: [AGENT_ID_1, AGENT_ID_2],
    });

    expect(result).toHaveProperty('conversation_id');
  });
});

describe('handleReadConversation', () => {
  it('returns messages ordered by created_at', async () => {
    const mockMessages = [
      {
        sender_id: AGENT_ID_1,
        sender_type: 'agent',
        content: 'Hello from agent 1',
        created_at: '2025-01-01T00:00:01Z',
      },
      {
        sender_id: AGENT_ID_2,
        sender_type: 'agent',
        content: 'Hello back',
        created_at: '2025-01-01T00:00:00Z',
      },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockMessages, 2));

    const result = await handleReadConversation({
      conversation_id: CONV_ID,
      limit: 20,
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].content).toBe('Hello from agent 1');
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when no messages', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));

    const result = await handleReadConversation({
      conversation_id: CONV_ID,
      limit: 20,
    });

    expect(result.messages).toHaveLength(0);
  });
});

describe('handleListAgentConversations', () => {
  it('returns agent conversations', async () => {
    const mockConversations = [
      {
        id: CONV_ID,
        title: 'Research chat',
        type: 'agent',
        last_message_at: '2025-01-01T12:00:00Z',
      },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockConversations, 1));

    const result = await handleListAgentConversations({ agent_id: AGENT_ID_1 });

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].id).toBe(CONV_ID);
    expect(result.conversations[0].type).toBe('agent');
  });

  it('returns empty array when agent has no conversations', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));

    const result = await handleListAgentConversations({ agent_id: AGENT_ID_1 });

    expect(result.conversations).toHaveLength(0);
  });
});

describe('handleGetAgentInfo', () => {
  it('returns agent info', async () => {
    const mockAgent = {
      id: AGENT_ID_1,
      name: 'Research Agent',
      description: 'Searches the web',
      model: 'claude-sonnet-4-6',
      tools: ['web_search'],
    };
    vi.mocked(sql).mockReturnValue(mockSql([mockAgent], 1));

    const result = await handleGetAgentInfo({ agent_id: AGENT_ID_1 });

    expect(result.id).toBe(AGENT_ID_1);
    expect(result.name).toBe('Research Agent');
    expect(result.model).toBe('claude-sonnet-4-6');
  });

  it('throws when agent not found', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));

    await expect(handleGetAgentInfo({ agent_id: AGENT_ID_1 })).rejects.toThrow(
      `Agent not found: ${AGENT_ID_1}`,
    );
  });
});
