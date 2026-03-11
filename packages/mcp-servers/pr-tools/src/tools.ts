import { z } from 'zod';
import { sql } from './db.js';
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── RSS Parsing ──────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's'));
  return match ? match[1].replace(/<!\[CDATA\[(.*?)\]\]>/s, '$1').trim() : '';
}

function parseRSS(xml: string): Array<{ title: string; url: string; content: string; published_at: string }> {
  const items: Array<{ title: string; url: string; content: string; published_at: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    items.push({
      title: extractTag(item, 'title'),
      url: extractTag(item, 'link'),
      content: extractTag(item, 'description'),
      published_at: extractTag(item, 'pubDate'),
    });
  }
  return items;
}

// ─── Input Schemas ────────────────────────────────────────────────────────────

// Sources
export const AddSourceInput = z.object({
  agent_id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['rss', 'api', 'web']),
  url: z.string().url(),
  config: z.record(z.unknown()).optional(),
});

export const ListSourcesInput = z.object({
  agent_id: z.string().uuid(),
});

export const RemoveSourceInput = z.object({
  source_id: z.string().uuid(),
  agent_id: z.string().uuid(),
});

export const UpdateSourceInput = z.object({
  source_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  config: z.record(z.unknown()).optional(),
});

// Articles
export const CollectArticlesInput = z.object({
  agent_id: z.string().uuid(),
});

export const SearchArticlesInput = z.object({
  agent_id: z.string().uuid(),
  query: z.string().min(1),
  date_range: z
    .object({
      from: z.string().optional(),
      to: z.string().optional(),
    })
    .optional(),
});

export const GetArticleDetailsInput = z.object({
  article_id: z.string().uuid(),
  agent_id: z.string().uuid(),
});

export const SummarizeArticleInput = z.object({
  article_id: z.string().uuid(),
  agent_id: z.string().uuid(),
});

export const GetTodaySummaryInput = z.object({
  agent_id: z.string().uuid(),
});

// Proposals
export const CreateProposalInput = z.object({
  agent_id: z.string().uuid(),
  conversation_id: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  actions: z.array(z.record(z.unknown())).optional(),
});

export const ListProposalsInput = z.object({
  agent_id: z.string().uuid(),
  status: z.string().optional(),
});

export const UpdateProposalStatusInput = z.object({
  proposal_id: z.string().uuid(),
  status: z.enum(['draft', 'approved', 'rejected', 'archived']),
});

export const GetProposalInput = z.object({
  proposal_id: z.string().uuid(),
});

// Strategy
export const AnalyzeTrendsInput = z.object({
  agent_id: z.string().uuid(),
  timeframe: z.enum(['24h', '7d', '30d']).default('7d'),
});

export const SuggestTopicsInput = z.object({
  agent_id: z.string().uuid(),
});

export const GenerateBriefingInput = z.object({
  agent_id: z.string().uuid(),
  date: z.string().optional(),
});

// ─── Source Handlers ──────────────────────────────────────────────────────────

export async function handleAddSource(input: z.infer<typeof AddSourceInput>) {
  const id = randomUUID();
  const now = new Date();
  const config = input.config ?? {};

  await sql`
    INSERT INTO agent_sources (id, agent_id, name, type, url, config, inserted_at, updated_at)
    VALUES (
      ${id}::uuid,
      ${input.agent_id}::uuid,
      ${input.name},
      ${input.type},
      ${input.url},
      ${JSON.stringify(config)}::jsonb,
      ${now},
      ${now}
    )
  `;

  return { source_id: id };
}

export async function handleListSources(input: z.infer<typeof ListSourcesInput>) {
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      type: string;
      url: string;
      config: unknown;
      last_fetched_at: string | null;
      inserted_at: string;
    }>
  >`
    SELECT id, name, type, url, config, last_fetched_at, inserted_at
    FROM agent_sources
    WHERE agent_id = ${input.agent_id}::uuid
    ORDER BY inserted_at DESC
  `;

  return { sources: rows };
}

export async function handleRemoveSource(input: z.infer<typeof RemoveSourceInput>) {
  const result = await sql`
    DELETE FROM agent_sources
    WHERE id = ${input.source_id}::uuid
      AND agent_id = ${input.agent_id}::uuid
  `;
  return { deleted: result.count > 0 };
}

export async function handleUpdateSource(input: z.infer<typeof UpdateSourceInput>) {
  const now = new Date();

  if (input.name !== undefined && input.url !== undefined && input.config !== undefined) {
    const result = await sql`
      UPDATE agent_sources
      SET name = ${input.name}, url = ${input.url}, config = ${JSON.stringify(input.config)}::jsonb, updated_at = ${now}
      WHERE id = ${input.source_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  if (input.name !== undefined && input.url !== undefined) {
    const result = await sql`
      UPDATE agent_sources
      SET name = ${input.name}, url = ${input.url}, updated_at = ${now}
      WHERE id = ${input.source_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  if (input.name !== undefined && input.config !== undefined) {
    const result = await sql`
      UPDATE agent_sources
      SET name = ${input.name}, config = ${JSON.stringify(input.config)}::jsonb, updated_at = ${now}
      WHERE id = ${input.source_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  if (input.url !== undefined && input.config !== undefined) {
    const result = await sql`
      UPDATE agent_sources
      SET url = ${input.url}, config = ${JSON.stringify(input.config)}::jsonb, updated_at = ${now}
      WHERE id = ${input.source_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  if (input.name !== undefined) {
    const result = await sql`
      UPDATE agent_sources
      SET name = ${input.name}, updated_at = ${now}
      WHERE id = ${input.source_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  if (input.url !== undefined) {
    const result = await sql`
      UPDATE agent_sources
      SET url = ${input.url}, updated_at = ${now}
      WHERE id = ${input.source_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  if (input.config !== undefined) {
    const result = await sql`
      UPDATE agent_sources
      SET config = ${JSON.stringify(input.config)}::jsonb, updated_at = ${now}
      WHERE id = ${input.source_id}::uuid
        AND agent_id = ${input.agent_id}::uuid
    `;
    return { updated: result.count > 0 };
  }

  return { updated: false };
}

// ─── Article Handlers ─────────────────────────────────────────────────────────

export async function handleCollectArticles(input: z.infer<typeof CollectArticlesInput>) {
  const sources = await sql<
    Array<{ id: string; type: string; url: string }>
  >`
    SELECT id, type, url FROM agent_sources WHERE agent_id = ${input.agent_id}::uuid
  `;

  let collected = 0;
  const errors: Array<{ source_id: string; error: string }> = [];
  const now = new Date();

  for (const source of sources) {
    try {
      const response = await fetch(source.url, {
        headers: { 'User-Agent': 'WaiAgentsPRAgent/1.0' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.text();
      const items = source.type === 'rss' ? parseRSS(body) : [{ title: source.url, url: source.url, content: body.slice(0, 5000), published_at: '' }];

      for (const item of items) {
        if (!item.url) continue;

        // Skip duplicates
        const existing = await sql`
          SELECT id FROM agent_articles
          WHERE agent_id = ${input.agent_id}::uuid AND url = ${item.url}
          LIMIT 1
        `;
        if (existing.length > 0) continue;

        const id = randomUUID();
        const publishedAt = item.published_at ? new Date(item.published_at) : now;

        await sql`
          INSERT INTO agent_articles (id, agent_id, source_id, title, url, content, published_at, collected_at, inserted_at, updated_at)
          VALUES (
            ${id}::uuid,
            ${input.agent_id}::uuid,
            ${source.id}::uuid,
            ${item.title},
            ${item.url},
            ${item.content},
            ${publishedAt},
            ${now},
            ${now},
            ${now}
          )
        `;
        collected++;
      }

      await sql`
        UPDATE agent_sources SET last_fetched_at = ${now}, updated_at = ${now}
        WHERE id = ${source.id}::uuid
      `;
    } catch (err) {
      errors.push({ source_id: source.id, error: String(err) });
    }
  }

  return { collected, errors };
}

export async function handleSearchArticles(input: z.infer<typeof SearchArticlesInput>) {
  const like = `%${input.query}%`;

  const rows = input.date_range
    ? await sql<
        Array<{ id: string; title: string; url: string; content: string; published_at: string; collected_at: string }>
      >`
        SELECT id, title, url, content, published_at, collected_at
        FROM agent_articles
        WHERE agent_id = ${input.agent_id}::uuid
          AND (title ILIKE ${like} OR content ILIKE ${like})
          ${input.date_range.from ? sql`AND published_at >= ${new Date(input.date_range.from)}` : sql``}
          ${input.date_range.to ? sql`AND published_at <= ${new Date(input.date_range.to)}` : sql``}
        ORDER BY published_at DESC
        LIMIT 50
      `
    : await sql<
        Array<{ id: string; title: string; url: string; content: string; published_at: string; collected_at: string }>
      >`
        SELECT id, title, url, content, published_at, collected_at
        FROM agent_articles
        WHERE agent_id = ${input.agent_id}::uuid
          AND (title ILIKE ${like} OR content ILIKE ${like})
        ORDER BY published_at DESC
        LIMIT 50
      `;

  return { articles: rows };
}

export async function handleGetArticleDetails(input: z.infer<typeof GetArticleDetailsInput>) {
  const rows = await sql<
    Array<{
      id: string;
      agent_id: string;
      source_id: string;
      title: string;
      url: string;
      content: string;
      summary: string | null;
      published_at: string;
      collected_at: string;
      metadata: unknown;
    }>
  >`
    SELECT id, agent_id, source_id, title, url, content, summary, published_at, collected_at, metadata
    FROM agent_articles
    WHERE id = ${input.article_id}::uuid
      AND agent_id = ${input.agent_id}::uuid
  `;

  if (rows.length === 0) {
    throw new Error(`Article not found: ${input.article_id}`);
  }

  return { article: rows[0] };
}

export async function handleSummarizeArticle(input: z.infer<typeof SummarizeArticleInput>) {
  const rows = await sql<Array<{ id: string; title: string; content: string; summary: string | null }>>`
    SELECT id, title, content, summary FROM agent_articles
    WHERE id = ${input.article_id}::uuid
      AND agent_id = ${input.agent_id}::uuid
  `;

  if (rows.length === 0) {
    throw new Error(`Article not found: ${input.article_id}`);
  }

  const article = rows[0];

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: `Summarize this article in 2-3 concise sentences for a PR professional:\n\nTitle: ${article.title}\n\nContent: ${article.content?.slice(0, 4000) ?? '(no content)'}`,
      },
    ],
  });

  const summary = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const now = new Date();
  await sql`
    UPDATE agent_articles SET summary = ${summary}, updated_at = ${now}
    WHERE id = ${input.article_id}::uuid
  `;

  return { article_id: input.article_id, summary };
}

export async function handleGetTodaySummary(input: z.infer<typeof GetTodaySummaryInput>) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const rows = await sql<
    Array<{ id: string; title: string; url: string; summary: string | null; published_at: string }>
  >`
    SELECT id, title, url, summary, published_at
    FROM agent_articles
    WHERE agent_id = ${input.agent_id}::uuid
      AND collected_at >= ${todayStart}
    ORDER BY published_at DESC
  `;

  return { date: todayStart.toISOString().split('T')[0], articles: rows };
}

// ─── Proposal Handlers ────────────────────────────────────────────────────────

export async function handleCreateProposal(input: z.infer<typeof CreateProposalInput>) {
  const id = randomUUID();
  const now = new Date();
  const actions = input.actions ?? [];

  if (input.conversation_id) {
    await sql`
      INSERT INTO agent_proposals (id, agent_id, conversation_id, title, description, status, actions, inserted_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${input.agent_id}::uuid,
        ${input.conversation_id}::uuid,
        ${input.title},
        ${input.description},
        'draft',
        ${JSON.stringify(actions)}::jsonb,
        ${now},
        ${now}
      )
    `;
  } else {
    await sql`
      INSERT INTO agent_proposals (id, agent_id, title, description, status, actions, inserted_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${input.agent_id}::uuid,
        ${input.title},
        ${input.description},
        'draft',
        ${JSON.stringify(actions)}::jsonb,
        ${now},
        ${now}
      )
    `;
  }

  return { proposal_id: id };
}

export async function handleListProposals(input: z.infer<typeof ListProposalsInput>) {
  const rows = input.status
    ? await sql<
        Array<{ id: string; title: string; description: string; status: string; inserted_at: string }>
      >`
        SELECT id, title, description, status, inserted_at
        FROM agent_proposals
        WHERE agent_id = ${input.agent_id}::uuid AND status = ${input.status}
        ORDER BY inserted_at DESC
      `
    : await sql<
        Array<{ id: string; title: string; description: string; status: string; inserted_at: string }>
      >`
        SELECT id, title, description, status, inserted_at
        FROM agent_proposals
        WHERE agent_id = ${input.agent_id}::uuid
        ORDER BY inserted_at DESC
      `;

  return { proposals: rows };
}

export async function handleUpdateProposalStatus(input: z.infer<typeof UpdateProposalStatusInput>) {
  const now = new Date();
  const result = await sql`
    UPDATE agent_proposals
    SET status = ${input.status}, updated_at = ${now}
    WHERE id = ${input.proposal_id}::uuid
  `;
  return { updated: result.count > 0 };
}

export async function handleGetProposal(input: z.infer<typeof GetProposalInput>) {
  const rows = await sql<
    Array<{
      id: string;
      agent_id: string;
      conversation_id: string | null;
      title: string;
      description: string;
      status: string;
      actions: unknown;
      metadata: unknown;
      inserted_at: string;
      updated_at: string;
    }>
  >`
    SELECT id, agent_id, conversation_id, title, description, status, actions, metadata, inserted_at, updated_at
    FROM agent_proposals
    WHERE id = ${input.proposal_id}::uuid
  `;

  if (rows.length === 0) {
    throw new Error(`Proposal not found: ${input.proposal_id}`);
  }

  return { proposal: rows[0] };
}

// ─── Strategy Handlers ────────────────────────────────────────────────────────

export async function handleAnalyzeTrends(input: z.infer<typeof AnalyzeTrendsInput>) {
  const hours = input.timeframe === '24h' ? 24 : input.timeframe === '7d' ? 168 : 720;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await sql<Array<{ word: string; count: string }>>`
    SELECT word, COUNT(*) as count
    FROM (
      SELECT regexp_split_to_table(
        lower(regexp_replace(title || ' ' || coalesce(content, ''), '[^a-zA-Z\s]', ' ', 'g')),
        '\s+'
      ) as word
      FROM agent_articles
      WHERE agent_id = ${input.agent_id}::uuid
        AND collected_at >= ${since}
        AND (title IS NOT NULL OR content IS NOT NULL)
    ) words
    WHERE length(word) > 4
    GROUP BY word
    ORDER BY count DESC
    LIMIT 30
  `;

  const stopWords = new Set(['their', 'there', 'these', 'those', 'about', 'which', 'where', 'would', 'could', 'should', 'after', 'before', 'other', 'being', 'having', 'will', 'with', 'from', 'this', 'that', 'have', 'been', 'were', 'they', 'said', 'also', 'more', 'when', 'what', 'some', 'than', 'then']);
  const trends = rows
    .filter((r) => !stopWords.has(r.word))
    .map((r) => ({ keyword: r.word, count: Number(r.count) }));

  return { timeframe: input.timeframe, trends };
}

export async function handleSuggestTopics(input: z.infer<typeof SuggestTopicsInput>) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await sql<Array<{ title: string; content: string }>>`
    SELECT title, content
    FROM agent_articles
    WHERE agent_id = ${input.agent_id}::uuid
      AND collected_at >= ${since}
    ORDER BY published_at DESC
    LIMIT 20
  `;

  if (rows.length === 0) {
    return { topics: [], message: 'No recent articles found. Collect articles first.' };
  }

  const articleSummaries = rows
    .map((r, i) => `${i + 1}. ${r.title}`)
    .join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Based on these recent news articles, suggest 5 specific PR campaign topics that would be timely and relevant. For each topic, provide a title and brief rationale.\n\nArticles:\n${articleSummaries}\n\nRespond as JSON: { "topics": [{ "title": "...", "rationale": "..." }] }`,
      },
    ],
  });

  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) as { topics: Array<{ title: string; rationale: string }> } : { topics: [] };
    return parsed;
  } catch {
    return { topics: [], raw: text };
  }
}

export async function handleGenerateBriefing(input: z.infer<typeof GenerateBriefingInput>) {
  const targetDate = input.date ? new Date(input.date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);

  const [articles, proposals] = await Promise.all([
    sql<Array<{ id: string; title: string; url: string; summary: string | null }>>`
      SELECT id, title, url, summary
      FROM agent_articles
      WHERE agent_id = ${input.agent_id}::uuid
        AND collected_at >= ${dayStart}
        AND collected_at <= ${dayEnd}
      ORDER BY published_at DESC
      LIMIT 30
    `,
    sql<Array<{ id: string; title: string; status: string; description: string }>>`
      SELECT id, title, status, description
      FROM agent_proposals
      WHERE agent_id = ${input.agent_id}::uuid
        AND status IN ('draft', 'approved')
      ORDER BY inserted_at DESC
      LIMIT 10
    `,
  ]);

  const briefing = {
    date: targetDate.toISOString().split('T')[0],
    articles: {
      count: articles.length,
      items: articles,
    },
    proposals: {
      count: proposals.length,
      items: proposals,
    },
  };

  return { briefing };
}
