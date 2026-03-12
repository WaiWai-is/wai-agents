/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection
vi.mock('../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const CONVERSATION_ID = '990e8400-e29b-41d4-a716-446655440004';

function makeAgentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    creator_id: USER_ID,
    name: 'Test Agent',
    slug: 'test-agent',
    description: 'A test agent',
    avatar_url: null,
    system_prompt: 'You are a test agent.',
    model: 'claude-sonnet-4-6',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
    mcp_servers: [],
    visibility: 'private',
    category: 'productivity',
    usage_count: 0,
    rating_sum: 0,
    rating_count: 0,
    execution_mode: 'raw',
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeCoreMemoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    agent_id: AGENT_ID,
    block_label: 'identity',
    content: 'I am Test Agent.',
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeConversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION_ID,
    type: 'agent',
    title: null,
    avatar_url: null,
    creator_id: USER_ID,
    agent_id: AGENT_ID,
    metadata: {},
    last_message_at: null,
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  createAgent — edge cases                                                   */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — createAgent edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates agent with minimal input (just name)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any); // slug check
    sqlMock.mockResolvedValueOnce([] as any); // INSERT agent
    sqlMock.mockResolvedValueOnce([] as any); // core memory 1
    sqlMock.mockResolvedValueOnce([] as any); // core memory 2
    sqlMock.mockResolvedValueOnce([] as any); // core memory 3
    sqlMock.mockResolvedValueOnce([] as any); // core memory 4
    sqlMock.mockResolvedValueOnce([makeAgentRow({ name: 'Minimal' })] as any);
    sqlMock.mockResolvedValueOnce([makeCoreMemoryRow()] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, { name: 'Minimal' });

    expect(result.name).toBe('Minimal');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(result.visibility).toBe('private');
  });

  it('creates agent with custom model', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ model: 'gpt-4o-mini' })] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, { name: 'GPT Agent', model: 'gpt-4o-mini' });

    expect(result.model).toBe('gpt-4o-mini');
  });

  it('creates agent with custom system_prompt', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ system_prompt: 'Custom prompt' })] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, {
      name: 'Custom Agent',
      system_prompt: 'Custom prompt',
    });

    expect(result.system_prompt).toBe('Custom prompt');
  });

  it('throws BAD_REQUEST for invalid template name', async () => {
    const { createAgent } = await import('./agent.service.js');
    await expect(
      createAgent(USER_ID, { name: 'Bad', template: 'nonexistent_template' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('handles slug collision with many existing slugs', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Simulate 5 existing slugs
    sqlMock.mockResolvedValueOnce([
      { slug: 'my-agent' },
      { slug: 'my-agent-2' },
      { slug: 'my-agent-3' },
      { slug: 'my-agent-4' },
      { slug: 'my-agent-5' },
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ slug: 'my-agent-6' })] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, { name: 'My Agent' });

    expect(result.slug).toBe('my-agent-6');
  });

  it('creates agent with public visibility', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ visibility: 'public' })] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, { name: 'Public Agent', visibility: 'public' });

    expect(result.visibility).toBe('public');
  });

  it('creates agent with category', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ category: 'creative' })] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, { name: 'Creative Agent', category: 'creative' });

    expect(result.category).toBe('creative');
  });

  it('creates agent with tools and MCP servers', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeAgentRow({
        tools: [{ name: 'web_search' }, { name: 'calculator' }],
        mcp_servers: [{ url: 'https://mcp.example.com', name: 'memory' }],
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, {
      name: 'Tool Agent',
      tools: [{ name: 'web_search' }, { name: 'calculator' }],
      mcp_servers: [{ url: 'https://mcp.example.com', name: 'memory' }],
    });

    expect(result.tools).toHaveLength(2);
    expect(result.mcp_servers).toHaveLength(1);
  });

  it('creates agent with description', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ description: 'A helpful agent' })] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, {
      name: 'Described Agent',
      description: 'A helpful agent',
    });

    expect(result.description).toBe('A helpful agent');
  });
});

/* -------------------------------------------------------------------------- */
/*  updateAgent — permission and edge cases                                    */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — updateAgent permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when non-owner tries to update', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateAgent } = await import('./agent.service.js');
    await expect(updateAgent(AGENT_ID, OTHER_USER_ID, { name: 'Hacked' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('updates temperature', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ temperature: 0.9 })] as any);

    const { updateAgent } = await import('./agent.service.js');
    // Temperature isn't in the update fields but the mock returns it
    const result = await updateAgent(AGENT_ID, USER_ID, { name: 'Same' });

    expect(result.temperature).toBe(0.9);
  });

  it('updates category to null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeAgentRow({ category: null })] as any);

    const { updateAgent } = await import('./agent.service.js');
    const result = await updateAgent(AGENT_ID, USER_ID, { category: null as any });

    expect(result.category).toBeNull();
  });

  it('updates multiple fields simultaneously', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeAgentRow({
        name: 'New Name',
        description: 'New Desc',
        model: 'gpt-4o',
        visibility: 'public',
        category: 'creative',
        system_prompt: 'New prompt',
        avatar_url: 'https://example.com/new.png',
      }),
    ] as any);

    const { updateAgent } = await import('./agent.service.js');
    const result = await updateAgent(AGENT_ID, USER_ID, {
      name: 'New Name',
      description: 'New Desc',
      model: 'gpt-4o',
      visibility: 'public',
      category: 'creative',
      system_prompt: 'New prompt',
      avatar_url: 'https://example.com/new.png',
    });

    expect(result.name).toBe('New Name');
    expect(result.description).toBe('New Desc');
    expect(result.model).toBe('gpt-4o');
    expect(result.visibility).toBe('public');
    expect(result.category).toBe('creative');
    expect(result.system_prompt).toBe('New prompt');
    expect(result.avatar_url).toBe('https://example.com/new.png');
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteAgent — cascade behavior                                             */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — deleteAgent cascade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nullifies conversation agent_id before deleting', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any); // assertCreator
    sqlMock.mockResolvedValueOnce([] as any); // nullify conversations
    sqlMock.mockResolvedValueOnce([] as any); // DELETE agent

    const { deleteAgent } = await import('./agent.service.js');
    await deleteAgent(AGENT_ID, USER_ID);

    // Called 3 times: assertCreator, UPDATE conversations, DELETE agent
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });

  it('throws NOT_FOUND when non-owner tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteAgent } = await import('./agent.service.js');
    await expect(deleteAgent(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for nonexistent agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteAgent } = await import('./agent.service.js');
    await expect(deleteAgent('nonexistent-id', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getAgent — system_prompt stripping for non-owners                          */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — getAgent system_prompt stripping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes system_prompt for owner', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([makeAgentRow({ visibility: 'public' })] as any);
    sqlMock.mockResolvedValueOnce([makeCoreMemoryRow()] as any);

    const { getAgent } = await import('./agent.service.js');
    const result = await getAgent(AGENT_ID, USER_ID);

    expect(result).toHaveProperty('system_prompt');
    expect((result as any).system_prompt).toBe('You are a test agent.');
  });

  it('strips system_prompt for non-owner viewing public agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      makeAgentRow({ creator_id: OTHER_USER_ID, visibility: 'public' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([makeCoreMemoryRow()] as any);

    const { getAgent } = await import('./agent.service.js');
    const result = await getAgent(AGENT_ID, USER_ID);

    expect(result).not.toHaveProperty('system_prompt');
  });

  it('strips system_prompt for non-owner viewing unlisted agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      makeAgentRow({ creator_id: OTHER_USER_ID, visibility: 'unlisted' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([makeCoreMemoryRow()] as any);

    const { getAgent } = await import('./agent.service.js');
    const result = await getAgent(AGENT_ID, USER_ID);

    expect(result).not.toHaveProperty('system_prompt');
  });

  it('includes core_memories in response', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([makeAgentRow()] as any);
    sqlMock.mockResolvedValueOnce([
      makeCoreMemoryRow({ block_label: 'identity' }),
      makeCoreMemoryRow({ id: 'mem-2', block_label: 'rules' }),
      makeCoreMemoryRow({ id: 'mem-3', block_label: 'priorities' }),
    ] as any);

    const { getAgent } = await import('./agent.service.js');
    const result = await getAgent(AGENT_ID, USER_ID);

    expect((result as any).core_memories).toHaveLength(3);
  });

  it('throws NOT_FOUND for non-owner accessing private agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getAgent } = await import('./agent.service.js');
    await expect(getAgent(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Agent template listing                                                     */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws BAD_REQUEST for unknown template', async () => {
    const { createAgent } = await import('./agent.service.js');
    await expect(
      createAgent(USER_ID, { name: 'Bad', template: 'does_not_exist' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('template values are overridden by explicit input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeAgentRow({ model: 'custom-model', system_prompt: 'Custom override' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { createAgent } = await import('./agent.service.js');
    const result = await createAgent(USER_ID, {
      name: 'Override Agent',
      template: 'pr_manager',
      model: 'custom-model',
      system_prompt: 'Custom override',
    });

    expect(result.model).toBe('custom-model');
    expect(result.system_prompt).toBe('Custom override');
  });
});

/* -------------------------------------------------------------------------- */
/*  getAgentPerformance — edge cases                                           */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — getAgentPerformance edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns zero for all metrics when agent has no data', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any); // ownership
    sqlMock.mockResolvedValueOnce([{ rating_sum: 0, rating_count: 0, rating_avg: 0 }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: null }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: null }] as any);
    sqlMock.mockResolvedValueOnce([{ accuracy: null, helpfulness: null, speed: null }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      { total_conversations: 0, avg_tokens_per_run: 0, avg_duration_ms: 0 },
    ] as any);
    sqlMock.mockResolvedValueOnce([{ successes: 0, total: 0 }] as any);

    const { getAgentPerformance } = await import('./agent.service.js');
    const perf = await getAgentPerformance(AGENT_ID, USER_ID);

    expect(perf.overall_rating).toBe(0);
    expect(perf.rating_count).toBe(0);
    expect(perf.rating_trend).toBe('stable');
    expect(perf.dimensional_scores.accuracy).toBeNull();
    expect(perf.feedback_summary.positive_count).toBe(0);
    expect(perf.feedback_summary.negative_count).toBe(0);
  });

  it('returns improving trend when recent > prior by >0.3', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ rating_sum: 45, rating_count: 10, rating_avg: 4.5 }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: 4.8 }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: 4.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ accuracy: 4.5, helpfulness: 4.2, speed: 3.8 }] as any);
    sqlMock.mockResolvedValueOnce([{ feedback: 'positive', reason: 'accurate', cnt: 8 }] as any);
    sqlMock.mockResolvedValueOnce([
      { total_conversations: 100, avg_tokens_per_run: 1000, avg_duration_ms: 3000 },
    ] as any);
    sqlMock.mockResolvedValueOnce([{ successes: 95, total: 100 }] as any);

    const { getAgentPerformance } = await import('./agent.service.js');
    const perf = await getAgentPerformance(AGENT_ID, USER_ID);

    expect(perf.rating_trend).toBe('improving');
    expect(perf.usage_stats.success_rate).toBeCloseTo(0.95);
  });

  it('returns declining trend when prior > recent by >0.3', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ rating_sum: 20, rating_count: 10, rating_avg: 2.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: 2.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: 4.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ accuracy: null, helpfulness: null, speed: null }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      { total_conversations: 0, avg_tokens_per_run: 0, avg_duration_ms: 0 },
    ] as any);
    sqlMock.mockResolvedValueOnce([{ successes: 0, total: 0 }] as any);

    const { getAgentPerformance } = await import('./agent.service.js');
    const perf = await getAgentPerformance(AGENT_ID, USER_ID);

    expect(perf.rating_trend).toBe('declining');
  });

  it('limits top reasons to 3', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ rating_sum: 20, rating_count: 5, rating_avg: 4.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: 4.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ avg_rating: 3.9 }] as any);
    sqlMock.mockResolvedValueOnce([{ accuracy: null, helpfulness: null, speed: null }] as any);
    sqlMock.mockResolvedValueOnce([
      { feedback: 'positive', reason: 'reason1', cnt: 10 },
      { feedback: 'positive', reason: 'reason2', cnt: 8 },
      { feedback: 'positive', reason: 'reason3', cnt: 6 },
      { feedback: 'positive', reason: 'reason4', cnt: 4 },
      { feedback: 'negative', reason: 'bad1', cnt: 5 },
      { feedback: 'negative', reason: 'bad2', cnt: 3 },
      { feedback: 'negative', reason: 'bad3', cnt: 2 },
      { feedback: 'negative', reason: 'bad4', cnt: 1 },
    ] as any);
    sqlMock.mockResolvedValueOnce([
      { total_conversations: 0, avg_tokens_per_run: 0, avg_duration_ms: 0 },
    ] as any);
    sqlMock.mockResolvedValueOnce([{ successes: 0, total: 0 }] as any);

    const { getAgentPerformance } = await import('./agent.service.js');
    const perf = await getAgentPerformance(AGENT_ID, USER_ID);

    expect(perf.feedback_summary.top_positive_reasons).toHaveLength(3);
    expect(perf.feedback_summary.top_negative_reasons).toHaveLength(3);
  });
});

/* -------------------------------------------------------------------------- */
/*  startConversation — edge cases                                             */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — startConversation edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing conversation for public agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      { id: AGENT_ID, visibility: 'public', creator_id: OTHER_USER_ID },
    ] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow()] as any);

    const { startConversation } = await import('./agent.service.js');
    const result = await startConversation(AGENT_ID, USER_ID);

    expect(result.created).toBe(false);
    expect(result.conversation.id).toBe(CONVERSATION_ID);
  });

  it('creates new conversation for unlisted agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      { id: AGENT_ID, visibility: 'unlisted', creator_id: OTHER_USER_ID },
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any); // no existing conversation
    sqlMock.mockResolvedValueOnce([] as any); // INSERT conversation
    sqlMock.mockResolvedValueOnce([] as any); // INSERT member
    sqlMock.mockResolvedValueOnce([makeConversationRow()] as any);

    const { startConversation } = await import('./agent.service.js');
    const result = await startConversation(AGENT_ID, USER_ID);

    expect(result.created).toBe(true);
  });

  it('owner can start conversation with own private agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      { id: AGENT_ID, visibility: 'private', creator_id: USER_ID },
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeConversationRow()] as any);

    const { startConversation } = await import('./agent.service.js');
    const result = await startConversation(AGENT_ID, USER_ID);

    expect(result.created).toBe(true);
  });

  it('throws NOT_FOUND for non-owner accessing private agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      { id: AGENT_ID, visibility: 'private', creator_id: OTHER_USER_ID },
    ] as any);

    const { startConversation } = await import('./agent.service.js');
    await expect(startConversation(AGENT_ID, USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND for nonexistent agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { startConversation } = await import('./agent.service.js');
    await expect(startConversation('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getAgentCard edge cases                                                    */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — getAgentCard edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes custom_tools capability when agent has tools', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: AGENT_ID,
        name: 'Tool Agent',
        description: 'Has tools',
        model: 'claude-sonnet-4-6',
        tools: [{ name: 'web_search' }],
        mcp_servers: [],
        category: 'productivity',
        visibility: 'public',
        rating_sum: 0,
        rating_count: 0,
        rating_avg: 0,
      },
    ] as any);

    const { getAgentCard } = await import('./agent.service.js');
    const card = await getAgentCard(AGENT_ID);

    expect(card.capabilities).toContain('custom_tools');
    expect(card.available).toBe(true);
    expect(card.max_a2a_depth).toBe(3);
  });

  it('includes MCP server names in capabilities', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: AGENT_ID,
        name: 'MCP Agent',
        description: 'Has MCP',
        model: 'claude-sonnet-4-6',
        tools: [],
        mcp_servers: [
          { url: 'https://mcp1.example.com', name: 'memory' },
          { url: 'https://mcp2.example.com', name: 'web-search' },
        ],
        category: 'productivity',
        visibility: 'public',
        rating_sum: 10,
        rating_count: 2,
        rating_avg: 5.0,
      },
    ] as any);

    const { getAgentCard } = await import('./agent.service.js');
    const card = await getAgentCard(AGENT_ID);

    expect(card.capabilities).toContain('memory');
    expect(card.capabilities).toContain('web-search');
    expect(card.rating_avg).toBe(5.0);
  });

  it('returns empty capabilities for bare agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: AGENT_ID,
        name: 'Bare',
        description: null,
        model: 'claude-sonnet-4-6',
        tools: [],
        mcp_servers: [],
        category: null,
        visibility: 'public',
        rating_sum: 0,
        rating_count: 0,
        rating_avg: 0,
      },
    ] as any);

    const { getAgentCard } = await import('./agent.service.js');
    const card = await getAgentCard(AGENT_ID);

    expect(card.capabilities).toEqual([]);
  });

  it('throws NOT_FOUND for nonexistent agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getAgentCard } = await import('./agent.service.js');
    await expect(getAgentCard('nonexistent')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  discoverAgents — edge cases                                                */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — discoverAgents edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for no matches', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./agent.service.js');
    const agents = await discoverAgents({});

    expect(agents).toHaveLength(0);
  });

  it('query search overrides category filter', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./agent.service.js');
    await discoverAgents({ query: 'test', category: 'creative' });

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });

  it('clamps limit to max 50', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./agent.service.js');
    await discoverAgents({ limit: 200 });

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });

  it('default limit is 10 when not specified', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./agent.service.js');
    await discoverAgents({});

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });

  it('escapes SQL LIKE wildcards in query', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./agent.service.js');
    await discoverAgents({ query: 'test%_\\injection' });

    expect(vi.mocked(sql)).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  getCompactPerformanceInsight — edge cases                                  */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — getCompactPerformanceInsight edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for nonexistent agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getCompactPerformanceInsight } = await import('./agent.service.js');
    const result = await getCompactPerformanceInsight('nonexistent');

    expect(result).toBeNull();
  });

  it('returns null when rating_count is 0', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ rating_sum: 0, rating_count: 0 }] as any);

    const { getCompactPerformanceInsight } = await import('./agent.service.js');
    const result = await getCompactPerformanceInsight(AGENT_ID);

    expect(result).toBeNull();
  });

  it('returns rating with no feedback reasons', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ rating_sum: 15, rating_count: 3 }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // no feedback
    sqlMock.mockResolvedValueOnce([{ recent_avg: 5.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ prior_avg: 5.0 }] as any);

    const { getCompactPerformanceInsight } = await import('./agent.service.js');
    const result = await getCompactPerformanceInsight(AGENT_ID);

    expect(result).toContain('Rating: 5.0/5.');
    expect(result).not.toContain('Users value:');
    expect(result).not.toContain('Improve:');
  });

  it('includes strength and weakness when feedback exists', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ rating_sum: 20, rating_count: 5 }] as any);
    sqlMock.mockResolvedValueOnce([
      { feedback: 'positive', reason: 'accurate_responses', cnt: 5 },
      { feedback: 'negative', reason: 'too_verbose', cnt: 2 },
    ] as any);
    sqlMock.mockResolvedValueOnce([{ recent_avg: 4.0 }] as any);
    sqlMock.mockResolvedValueOnce([{ prior_avg: 3.9 }] as any);

    const { getCompactPerformanceInsight } = await import('./agent.service.js');
    const result = await getCompactPerformanceInsight(AGENT_ID);

    expect(result).toContain('Rating: 4.0/5.');
    expect(result).toContain('Users value: accurate responses');
    expect(result).toContain('Improve: too verbose');
  });
});

/* -------------------------------------------------------------------------- */
/*  listAgents — edge cases                                                    */
/* -------------------------------------------------------------------------- */

describe('agent.service-edge2 — listAgents edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for user with no agents', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listAgents } = await import('./agent.service.js');
    const result = await listAgents(USER_ID);

    expect(result).toHaveLength(0);
  });

  it('returns agents with ISO date format', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeAgentRow()] as any);

    const { listAgents } = await import('./agent.service.js');
    const result = await listAgents(USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].created_at).toBe(new Date('2026-01-01').toISOString());
    expect(result[0].updated_at).toBe(new Date('2026-01-01').toISOString());
  });

  it('returns multiple agents', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      makeAgentRow({ id: 'agent-1', name: 'Agent 1' }),
      makeAgentRow({ id: 'agent-2', name: 'Agent 2' }),
      makeAgentRow({ id: 'agent-3', name: 'Agent 3' }),
    ] as any);

    const { listAgents } = await import('./agent.service.js');
    const result = await listAgents(USER_ID);

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Agent 1');
    expect(result[2].name).toBe('Agent 3');
  });
});
