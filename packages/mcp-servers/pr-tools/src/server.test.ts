import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./db.js', () => ({
  sql: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Default mock summary.' }],
      }),
    };
  },
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
}));

import { sql } from './db.js';
import {
  AddSourceInput,
  ListSourcesInput,
  RemoveSourceInput,
  UpdateSourceInput,
  SearchArticlesInput,
  GetArticleDetailsInput,
  SummarizeArticleInput,
  GetTodaySummaryInput,
  CreateProposalInput,
  ListProposalsInput,
  UpdateProposalStatusInput,
  GetProposalInput,
  AnalyzeTrendsInput,
  GenerateBriefingInput,
  handleAddSource,
  handleListSources,
  handleRemoveSource,
  handleUpdateSource,
  handleSearchArticles,
  handleGetArticleDetails,
  handleSummarizeArticle,
  handleGetTodaySummary,
  handleCreateProposal,
  handleListProposals,
  handleUpdateProposalStatus,
  handleGetProposal,
  handleAnalyzeTrends,
  handleGenerateBriefing,
} from './tools.js';

const AGENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SOURCE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ARTICLE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROPOSAL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

function makeSqlResult(rows: unknown[] = [], count = 0) {
  return Object.assign([...rows], { count });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockSql(rows: unknown[] = [], count = 0): any {
  return Promise.resolve(makeSqlResult(rows, count));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sql).mockReturnValue(mockSql([], 1));
});

// ─── Input Schema Tests ───────────────────────────────────────────────────────

describe('AddSourceInput schema', () => {
  it('accepts valid RSS source', () => {
    const result = AddSourceInput.safeParse({
      agent_id: AGENT_ID,
      name: 'Tech News',
      type: 'rss',
      url: 'https://example.com/feed.xml',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = AddSourceInput.safeParse({
      agent_id: AGENT_ID,
      name: 'Bad Source',
      type: 'invalid',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = AddSourceInput.safeParse({
      agent_id: AGENT_ID,
      name: 'Bad URL',
      type: 'web',
      url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid agent_id UUID', () => {
    const result = AddSourceInput.safeParse({
      agent_id: 'not-a-uuid',
      name: 'Source',
      type: 'rss',
      url: 'https://example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('ListSourcesInput schema', () => {
  it('accepts valid agent_id', () => {
    const result = ListSourcesInput.safeParse({ agent_id: AGENT_ID });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID agent_id', () => {
    const result = ListSourcesInput.safeParse({ agent_id: 'bad' });
    expect(result.success).toBe(false);
  });
});

describe('RemoveSourceInput schema', () => {
  it('accepts valid source_id and agent_id', () => {
    const result = RemoveSourceInput.safeParse({ source_id: SOURCE_ID, agent_id: AGENT_ID });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID source_id', () => {
    const result = RemoveSourceInput.safeParse({ source_id: 'bad-id', agent_id: AGENT_ID });
    expect(result.success).toBe(false);
  });
});

describe('UpdateSourceInput schema', () => {
  it('accepts partial update', () => {
    const result = UpdateSourceInput.safeParse({
      source_id: SOURCE_ID,
      agent_id: AGENT_ID,
      name: 'New Name',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all fields', () => {
    const result = UpdateSourceInput.safeParse({
      source_id: SOURCE_ID,
      agent_id: AGENT_ID,
      name: 'Updated',
      url: 'https://updated.com',
      config: { key: 'value' },
    });
    expect(result.success).toBe(true);
  });
});

describe('SearchArticlesInput schema', () => {
  it('accepts query without date range', () => {
    const result = SearchArticlesInput.safeParse({
      agent_id: AGENT_ID,
      query: 'climate change',
    });
    expect(result.success).toBe(true);
  });

  it('accepts query with date range', () => {
    const result = SearchArticlesInput.safeParse({
      agent_id: AGENT_ID,
      query: 'AI news',
      date_range: { from: '2025-01-01', to: '2025-12-31' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty query', () => {
    const result = SearchArticlesInput.safeParse({ agent_id: AGENT_ID, query: '' });
    expect(result.success).toBe(false);
  });
});

describe('CreateProposalInput schema', () => {
  it('accepts proposal without conversation', () => {
    const result = CreateProposalInput.safeParse({
      agent_id: AGENT_ID,
      title: 'New Campaign',
      description: 'A PR campaign about sustainability',
    });
    expect(result.success).toBe(true);
  });

  it('accepts proposal with conversation and actions', () => {
    const result = CreateProposalInput.safeParse({
      agent_id: AGENT_ID,
      conversation_id: PROPOSAL_ID,
      title: 'Campaign',
      description: 'Description',
      actions: [{ type: 'press_release', target: 'media' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = CreateProposalInput.safeParse({
      agent_id: AGENT_ID,
      title: '',
      description: 'Desc',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateProposalStatusInput schema', () => {
  it('accepts valid statuses', () => {
    for (const status of ['draft', 'approved', 'rejected', 'archived']) {
      const result = UpdateProposalStatusInput.safeParse({ proposal_id: PROPOSAL_ID, status });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = UpdateProposalStatusInput.safeParse({
      proposal_id: PROPOSAL_ID,
      status: 'pending',
    });
    expect(result.success).toBe(false);
  });
});

describe('AnalyzeTrendsInput schema', () => {
  it('defaults timeframe to 7d', () => {
    const result = AnalyzeTrendsInput.safeParse({ agent_id: AGENT_ID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeframe).toBe('7d');
    }
  });

  it('accepts 24h and 30d', () => {
    expect(AnalyzeTrendsInput.safeParse({ agent_id: AGENT_ID, timeframe: '24h' }).success).toBe(true);
    expect(AnalyzeTrendsInput.safeParse({ agent_id: AGENT_ID, timeframe: '30d' }).success).toBe(true);
  });
});

// ─── Handler Tests ────────────────────────────────────────────────────────────

describe('handleAddSource', () => {
  it('inserts source and returns source_id', async () => {
    const result = await handleAddSource({
      agent_id: AGENT_ID,
      name: 'Tech News',
      type: 'rss',
      url: 'https://example.com/feed.xml',
    });

    expect(sql).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('source_id');
    expect(typeof result.source_id).toBe('string');
  });

  it('uses empty config by default', async () => {
    await handleAddSource({
      agent_id: AGENT_ID,
      name: 'Source',
      type: 'web',
      url: 'https://example.com',
    });
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe('handleListSources', () => {
  it('returns sources array', async () => {
    const mockSources = [
      { id: SOURCE_ID, name: 'Tech News', type: 'rss', url: 'https://example.com', config: {}, last_fetched_at: null, inserted_at: '2025-01-01' },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockSources, 1));

    const result = await handleListSources({ agent_id: AGENT_ID });

    expect(sql).toHaveBeenCalledTimes(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].name).toBe('Tech News');
  });

  it('returns empty array when no sources', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    const result = await handleListSources({ agent_id: AGENT_ID });
    expect(result.sources).toHaveLength(0);
  });
});

describe('handleRemoveSource', () => {
  it('returns deleted true when source exists', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 1));
    const result = await handleRemoveSource({ source_id: SOURCE_ID, agent_id: AGENT_ID });
    expect(result.deleted).toBe(true);
  });

  it('returns deleted false when source not found', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    const result = await handleRemoveSource({ source_id: SOURCE_ID, agent_id: AGENT_ID });
    expect(result.deleted).toBe(false);
  });
});

describe('handleUpdateSource', () => {
  it('returns updated false when no fields provided', async () => {
    const result = await handleUpdateSource({ source_id: SOURCE_ID, agent_id: AGENT_ID });
    expect(result.updated).toBe(false);
    expect(sql).not.toHaveBeenCalled();
  });

  it('updates name only', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 1));
    const result = await handleUpdateSource({ source_id: SOURCE_ID, agent_id: AGENT_ID, name: 'New Name' });
    expect(result.updated).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it('updates all fields', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 1));
    const result = await handleUpdateSource({
      source_id: SOURCE_ID,
      agent_id: AGENT_ID,
      name: 'Updated',
      url: 'https://new.com',
      config: { key: 'value' },
    });
    expect(result.updated).toBe(true);
  });
});

describe('handleSearchArticles', () => {
  it('returns matching articles', async () => {
    const mockArticles = [
      { id: ARTICLE_ID, title: 'AI Revolution', url: 'https://example.com/1', content: 'Article about AI', published_at: '2025-01-01', collected_at: '2025-01-01' },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockArticles, 1));

    const result = await handleSearchArticles({ agent_id: AGENT_ID, query: 'AI' });

    expect(sql).toHaveBeenCalledTimes(1);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].title).toBe('AI Revolution');
  });

  it('accepts date range filter', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    const result = await handleSearchArticles({
      agent_id: AGENT_ID,
      query: 'tech',
      date_range: { from: '2025-01-01', to: '2025-12-31' },
    });
    expect(result.articles).toHaveLength(0);
  });
});

describe('handleGetArticleDetails', () => {
  it('returns article when found', async () => {
    const mockArticle = {
      id: ARTICLE_ID,
      agent_id: AGENT_ID,
      source_id: SOURCE_ID,
      title: 'Test Article',
      url: 'https://example.com',
      content: 'Content here',
      summary: null,
      published_at: '2025-01-01',
      collected_at: '2025-01-01',
      metadata: {},
    };
    vi.mocked(sql).mockReturnValue(mockSql([mockArticle], 1));

    const result = await handleGetArticleDetails({ article_id: ARTICLE_ID, agent_id: AGENT_ID });

    expect(result.article.title).toBe('Test Article');
  });

  it('throws when article not found', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    await expect(handleGetArticleDetails({ article_id: ARTICLE_ID, agent_id: AGENT_ID })).rejects.toThrow('Article not found');
  });
});

describe('handleSummarizeArticle', () => {
  it('generates summary via Claude and updates article', async () => {
    const mockArticle = {
      id: ARTICLE_ID,
      title: 'AI News',
      content: 'Long content about AI developments in the industry.',
      summary: null,
    };
    vi.mocked(sql)
      .mockReturnValueOnce(mockSql([mockArticle], 1))
      .mockReturnValue(mockSql([], 1));

    const result = await handleSummarizeArticle({ article_id: ARTICLE_ID, agent_id: AGENT_ID });

    expect(sql).toHaveBeenCalledTimes(2); // fetch + update
    expect(result).toHaveProperty('article_id', ARTICLE_ID);
    expect(result).toHaveProperty('summary');
    expect(typeof result.summary).toBe('string');
  });

  it('throws when article not found', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    await expect(handleSummarizeArticle({ article_id: ARTICLE_ID, agent_id: AGENT_ID })).rejects.toThrow('Article not found');
  });
});

describe('handleGetTodaySummary', () => {
  it('returns today articles', async () => {
    const mockArticles = [
      { id: ARTICLE_ID, title: 'Today News', url: 'https://example.com', summary: 'Brief.', published_at: new Date().toISOString() },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockArticles, 1));

    const result = await handleGetTodaySummary({ agent_id: AGENT_ID });

    expect(result).toHaveProperty('date');
    expect(result.articles).toHaveLength(1);
  });
});

describe('handleCreateProposal', () => {
  it('creates proposal without conversation_id', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 1));

    const result = await handleCreateProposal({
      agent_id: AGENT_ID,
      title: 'New Campaign',
      description: 'Campaign description',
    });

    expect(sql).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('proposal_id');
  });

  it('creates proposal with conversation_id', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 1));

    const result = await handleCreateProposal({
      agent_id: AGENT_ID,
      conversation_id: PROPOSAL_ID,
      title: 'Campaign',
      description: 'Description',
      actions: [{ type: 'press_release' }],
    });

    expect(result).toHaveProperty('proposal_id');
  });
});

describe('handleListProposals', () => {
  it('returns all proposals without status filter', async () => {
    const mockProposals = [
      { id: PROPOSAL_ID, title: 'Draft Campaign', description: 'A campaign', status: 'draft', inserted_at: '2025-01-01' },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockProposals, 1));

    const result = await handleListProposals({ agent_id: AGENT_ID });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].status).toBe('draft');
  });

  it('filters by status when provided', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    const result = await handleListProposals({ agent_id: AGENT_ID, status: 'approved' });
    expect(result.proposals).toHaveLength(0);
  });
});

describe('handleUpdateProposalStatus', () => {
  it('updates status and returns updated true', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 1));
    const result = await handleUpdateProposalStatus({ proposal_id: PROPOSAL_ID, status: 'approved' });
    expect(result.updated).toBe(true);
  });

  it('returns updated false when not found', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    const result = await handleUpdateProposalStatus({ proposal_id: PROPOSAL_ID, status: 'rejected' });
    expect(result.updated).toBe(false);
  });
});

describe('handleGetProposal', () => {
  it('returns proposal when found', async () => {
    const mockProposal = {
      id: PROPOSAL_ID,
      agent_id: AGENT_ID,
      conversation_id: null,
      title: 'Campaign',
      description: 'Description',
      status: 'draft',
      actions: [],
      metadata: {},
      inserted_at: '2025-01-01',
      updated_at: '2025-01-01',
    };
    vi.mocked(sql).mockReturnValue(mockSql([mockProposal], 1));

    const result = await handleGetProposal({ proposal_id: PROPOSAL_ID });

    expect(result.proposal.title).toBe('Campaign');
    expect(result.proposal.status).toBe('draft');
  });

  it('throws when proposal not found', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));
    await expect(handleGetProposal({ proposal_id: PROPOSAL_ID })).rejects.toThrow('Proposal not found');
  });
});

describe('handleAnalyzeTrends', () => {
  it('returns keyword trends', async () => {
    const mockWords = [
      { word: 'artificial', count: '15' },
      { word: 'intelligence', count: '12' },
      { word: 'technology', count: '8' },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockWords, 3));

    const result = await handleAnalyzeTrends({ agent_id: AGENT_ID, timeframe: '7d' });

    expect(result.timeframe).toBe('7d');
    expect(result.trends.length).toBeGreaterThan(0);
    expect(result.trends[0]).toHaveProperty('keyword');
    expect(result.trends[0]).toHaveProperty('count');
  });

  it('filters stop words from results', async () => {
    const mockWords = [
      { word: 'their', count: '20' },
      { word: 'climate', count: '10' },
    ];
    vi.mocked(sql).mockReturnValue(mockSql(mockWords, 2));

    const result = await handleAnalyzeTrends({ agent_id: AGENT_ID, timeframe: '24h' });

    const keywords = result.trends.map((t) => t.keyword);
    expect(keywords).not.toContain('their');
    expect(keywords).toContain('climate');
  });
});

describe('handleGenerateBriefing', () => {
  it('returns briefing with articles and proposals', async () => {
    const mockArticles = [
      { id: ARTICLE_ID, title: 'News', url: 'https://example.com', summary: 'Brief.', published_at: new Date().toISOString() },
    ];
    const mockProposals = [
      { id: PROPOSAL_ID, title: 'Campaign', status: 'draft', description: 'Desc.' },
    ];

    vi.mocked(sql)
      .mockReturnValueOnce(mockSql(mockArticles, 1))
      .mockReturnValue(mockSql(mockProposals, 1));

    const result = await handleGenerateBriefing({ agent_id: AGENT_ID });

    expect(result.briefing).toHaveProperty('date');
    expect(result.briefing.articles.count).toBe(1);
    expect(result.briefing.proposals.count).toBe(1);
  });

  it('accepts custom date', async () => {
    vi.mocked(sql).mockReturnValue(mockSql([], 0));

    const result = await handleGenerateBriefing({ agent_id: AGENT_ID, date: '2025-06-15' });

    expect(result.briefing.date).toBe('2025-06-15');
  });

  it('GenerateBriefingInput accepts optional date', () => {
    const result = GenerateBriefingInput.safeParse({ agent_id: AGENT_ID });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.date).toBeUndefined();
  });
});
