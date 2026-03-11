import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function formatFeedItem(row: Record<string, unknown>) {
  return {
    id: row['id'],
    creator_id: row['creator_id'],
    type: row['type'],
    reference_id: row['reference_id'],
    reference_type: row['reference_type'],
    title: row['title'],
    description: row['description'],
    thumbnail_url: row['thumbnail_url'],
    quality_score: row['quality_score'],
    trending_score: row['trending_score'],
    like_count: row['like_count'],
    fork_count: row['fork_count'],
    view_count: row['view_count'],
    created_at: toISO(row['inserted_at']),
    updated_at: toISO(row['updated_at']),
    creator: {
      id: row['creator_id'],
      username: row['username'],
      display_name: row['display_name'],
      avatar_url: row['avatar_url'],
    },
    liked_by_me: row['liked_by_me'] === true || row['liked_by_me'] === 1 || (typeof row['liked_by_me'] === 'number' && row['liked_by_me'] > 0),
  };
}

function clampLimit(limit?: number): number {
  return Math.min(Math.max(1, limit ?? 20), 100);
}

async function getCursorInsertedAt(cursor: string): Promise<Date> {
  const rows = await sql`
    SELECT inserted_at FROM feed_items WHERE id = ${cursor} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Invalid cursor'), { code: 'BAD_REQUEST' });
  }
  return (rows[0] as Record<string, unknown>)['inserted_at'] as Date;
}

/* -------------------------------------------------------------------------- */
/*  Feed                                                                      */
/* -------------------------------------------------------------------------- */

export async function listFeed(userId: string, cursor?: string, limit?: number) {
  const clampedLimit = clampLimit(limit);

  if (cursor) {
    const cursorAt = await getCursorInsertedAt(cursor);
    const rows = await sql`
      SELECT
        fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
        fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
        fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
      FROM feed_items fi
      JOIN users u ON u.id = fi.creator_id
      WHERE (
        fi.creator_id = ${userId}
        OR fi.creator_id IN (SELECT following_id FROM user_follows WHERE follower_id = ${userId})
      )
      AND fi.inserted_at < ${cursorAt}
      ORDER BY fi.inserted_at DESC
      LIMIT ${clampedLimit}
    `;
    return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
  }

  const rows = await sql`
    SELECT
      fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
      fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
      fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
      u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
    FROM feed_items fi
    JOIN users u ON u.id = fi.creator_id
    WHERE (
      fi.creator_id = ${userId}
      OR fi.creator_id IN (SELECT following_id FROM user_follows WHERE follower_id = ${userId})
    )
    ORDER BY fi.inserted_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
}

export async function listTrending(userId: string, cursor?: string, limit?: number) {
  const clampedLimit = clampLimit(limit);

  if (cursor) {
    const cursorRows = await sql`
      SELECT trending_score, inserted_at FROM feed_items WHERE id = ${cursor} LIMIT 1
    `;
    if (cursorRows.length === 0) {
      throw Object.assign(new Error('Invalid cursor'), { code: 'BAD_REQUEST' });
    }
    const cursorRow = cursorRows[0] as Record<string, unknown>;
    const cursorScore = cursorRow['trending_score'] as number;
    const cursorAt = cursorRow['inserted_at'] as Date;

    const rows = await sql`
      SELECT
        fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
        fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
        fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
      FROM feed_items fi
      JOIN users u ON u.id = fi.creator_id
      WHERE (fi.trending_score < ${cursorScore}
        OR (fi.trending_score = ${cursorScore} AND fi.inserted_at < ${cursorAt}))
      ORDER BY fi.trending_score DESC, fi.inserted_at DESC
      LIMIT ${clampedLimit}
    `;
    return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
  }

  const rows = await sql`
    SELECT
      fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
      fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
      fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
      u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
    FROM feed_items fi
    JOIN users u ON u.id = fi.creator_id
    ORDER BY fi.trending_score DESC, fi.inserted_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
}

export async function listFollowing(userId: string, cursor?: string, limit?: number) {
  const clampedLimit = clampLimit(limit);

  if (cursor) {
    const cursorAt = await getCursorInsertedAt(cursor);
    const rows = await sql`
      SELECT
        fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
        fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
        fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
      FROM feed_items fi
      JOIN users u ON u.id = fi.creator_id
      WHERE fi.creator_id IN (SELECT following_id FROM user_follows WHERE follower_id = ${userId})
        AND fi.inserted_at < ${cursorAt}
      ORDER BY fi.inserted_at DESC
      LIMIT ${clampedLimit}
    `;
    return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
  }

  const rows = await sql`
    SELECT
      fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
      fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
      fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
      u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
    FROM feed_items fi
    JOIN users u ON u.id = fi.creator_id
    WHERE fi.creator_id IN (SELECT following_id FROM user_follows WHERE follower_id = ${userId})
    ORDER BY fi.inserted_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
}

export async function listNew(userId: string, cursor?: string, limit?: number) {
  const clampedLimit = clampLimit(limit);

  if (cursor) {
    const cursorAt = await getCursorInsertedAt(cursor);
    const rows = await sql`
      SELECT
        fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
        fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
        fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
        u.username, u.display_name, u.avatar_url,
        (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
      FROM feed_items fi
      JOIN users u ON u.id = fi.creator_id
      WHERE fi.inserted_at < ${cursorAt}
      ORDER BY fi.inserted_at DESC
      LIMIT ${clampedLimit}
    `;
    return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
  }

  const rows = await sql`
    SELECT
      fi.id, fi.creator_id, fi.type, fi.reference_id, fi.reference_type,
      fi.title, fi.description, fi.thumbnail_url, fi.quality_score, fi.trending_score,
      fi.like_count, fi.fork_count, fi.view_count, fi.inserted_at, fi.updated_at,
      u.username, u.display_name, u.avatar_url,
      (SELECT COUNT(*)::int FROM feed_likes fl WHERE fl.feed_item_id = fi.id AND fl.user_id = ${userId}) AS liked_by_me
    FROM feed_items fi
    JOIN users u ON u.id = fi.creator_id
    ORDER BY fi.inserted_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((row) => formatFeedItem(row as Record<string, unknown>));
}

/* -------------------------------------------------------------------------- */
/*  Likes                                                                     */
/* -------------------------------------------------------------------------- */

export async function likeFeedItem(feedItemId: string, userId: string) {
  // Verify feed item exists
  const itemRows = await sql`
    SELECT id FROM feed_items WHERE id = ${feedItemId} LIMIT 1
  `;
  if (itemRows.length === 0) {
    throw Object.assign(new Error('Feed item not found'), { code: 'NOT_FOUND' });
  }

  // @ts-expect-error postgres.js TransactionSql type lacks call signatures but works at runtime
  return await sql.begin(async (tx: typeof sql) => {
    // Insert like (ON CONFLICT for idempotency)
    await tx`
      INSERT INTO feed_likes (id, feed_item_id, user_id, inserted_at)
      VALUES (${randomUUID()}, ${feedItemId}, ${userId}, NOW())
      ON CONFLICT (feed_item_id, user_id) DO NOTHING
    `;

    // Recount like_count and return full feed item with creator info
    const rows = await tx`
      UPDATE feed_items
      SET like_count = (SELECT COUNT(*)::int FROM feed_likes WHERE feed_item_id = ${feedItemId}),
          updated_at = NOW()
      WHERE id = ${feedItemId}
      RETURNING id, creator_id, type, reference_id, reference_type, title, description,
                thumbnail_url, quality_score, trending_score, like_count, fork_count,
                view_count, inserted_at, updated_at
    `;

    const fi = rows[0] as Record<string, unknown>;
    const creatorId = fi['creator_id'] as string;
    const creatorRows = await tx`
      SELECT username, display_name, avatar_url FROM users WHERE id = ${creatorId} LIMIT 1
    `;
    const creator = creatorRows[0] as Record<string, unknown> | undefined;

    return formatFeedItem({
      ...fi,
      username: creator?.['username'] ?? null,
      display_name: creator?.['display_name'] ?? null,
      avatar_url: creator?.['avatar_url'] ?? null,
      liked_by_me: true,
    });
  });
}

export async function unlikeFeedItem(feedItemId: string, userId: string) {
  // Verify feed item exists
  const itemRows = await sql`
    SELECT id FROM feed_items WHERE id = ${feedItemId} LIMIT 1
  `;
  if (itemRows.length === 0) {
    throw Object.assign(new Error('Feed item not found'), { code: 'NOT_FOUND' });
  }

  // @ts-expect-error postgres.js TransactionSql type lacks call signatures but works at runtime
  await sql.begin(async (tx: typeof sql) => {
    // Delete like
    await tx`
      DELETE FROM feed_likes WHERE feed_item_id = ${feedItemId} AND user_id = ${userId}
    `;

    // Update like_count
    await tx`
      UPDATE feed_items
      SET like_count = (SELECT COUNT(*)::int FROM feed_likes WHERE feed_item_id = ${feedItemId}),
          updated_at = NOW()
      WHERE id = ${feedItemId}
    `;
  });
}

/* -------------------------------------------------------------------------- */
/*  Fork                                                                      */
/* -------------------------------------------------------------------------- */

export async function forkAgent(agentId: string, userId: string) {
  // Get the source agent (outside transaction — read-only)
  const agentRows = await sql`
    SELECT id, name, slug, description, avatar_url, system_prompt, model,
           temperature, max_tokens, tools, mcp_servers, visibility, category, metadata
    FROM agents
    WHERE id = ${agentId}
    LIMIT 1
  `;
  if (agentRows.length === 0) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  const source = agentRows[0] as Record<string, unknown>;
  const newAgentId = randomUUID();
  const now = new Date().toISOString();

  // Generate a unique slug for the fork
  const baseSlug = `${source['slug']}-fork`;
  let slug = baseSlug;
  const existingRows = await sql`SELECT slug FROM agents WHERE slug LIKE ${baseSlug + '%'} ORDER BY slug`;
  if (existingRows.length > 0) {
    const existingSlugs = new Set((existingRows as Array<Record<string, unknown>>).map((r) => r['slug'] as string));
    if (existingSlugs.has(slug)) {
      let counter = 2;
      while (existingSlugs.has(`${baseSlug}-${counter}`)) {
        counter++;
      }
      slug = `${baseSlug}-${counter}`;
    }
  }

  // Store forked_from in metadata
  const sourceMetadata = (source['metadata'] as Record<string, unknown>) ?? {};
  const newMetadata = JSON.stringify({ ...sourceMetadata, forked_from: agentId });
  const toolsJson = JSON.stringify(source['tools'] ?? []);
  const mcpServersJson = JSON.stringify(source['mcp_servers'] ?? []);

  // @ts-expect-error postgres.js TransactionSql type lacks call signatures but works at runtime
  return await sql.begin(async (tx: typeof sql) => {
    await tx`
      INSERT INTO agents (
        id, creator_id, name, slug, description, avatar_url, system_prompt, model,
        temperature, max_tokens, tools, mcp_servers, visibility, category, metadata,
        inserted_at, updated_at
      ) VALUES (
        ${newAgentId}, ${userId}, ${source['name'] as string}, ${slug},
        ${source['description'] as string | null}, ${source['avatar_url'] as string | null},
        ${source['system_prompt'] as string}, ${source['model'] as string},
        ${source['temperature'] as number}, ${source['max_tokens'] as number},
        ${toolsJson}::jsonb, ${mcpServersJson}::jsonb,
        'private', ${source['category'] as string | null},
        ${newMetadata}::jsonb, ${now}, ${now}
      )
    `;

    // Increment fork_count on feed items referencing the source agent
    await tx`
      UPDATE feed_items
      SET fork_count = fork_count + 1, updated_at = NOW()
      WHERE reference_id = ${agentId} AND reference_type = 'agent'
    `;

    // Create a feed item for the fork
    const feedItemId = randomUUID();
    await tx`
      INSERT INTO feed_items (
        id, creator_id, type, reference_id, reference_type, title, description,
        inserted_at, updated_at
      ) VALUES (
        ${feedItemId}, ${userId}, 'fork', ${newAgentId}, 'agent',
        ${source['name'] as string}, ${source['description'] as string | null},
        ${now}, ${now}
      )
    `;

    // Return the new agent
    const rows = await tx`
      SELECT id, creator_id, name, slug, description, avatar_url, system_prompt, model,
             temperature, max_tokens, tools, mcp_servers, visibility, category,
             COALESCE(usage_count, 0)::int AS usage_count, rating_sum, rating_count, metadata,
             inserted_at, updated_at
      FROM agents WHERE id = ${newAgentId}
    `;

    const row = rows[0] as Record<string, unknown>;
    return {
      id: row['id'],
      creator_id: row['creator_id'],
      name: row['name'],
      slug: row['slug'],
      description: row['description'],
      avatar_url: row['avatar_url'],
      system_prompt: row['system_prompt'],
      model: row['model'],
      visibility: row['visibility'],
      category: row['category'],
      metadata: row['metadata'],
      created_at: toISO(row['inserted_at']),
      updated_at: toISO(row['updated_at']),
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Marketplace                                                               */
/* -------------------------------------------------------------------------- */

export async function listMarketplace(userId: string, cursor?: string, limit?: number, category?: string) {
  const clampedLimit = clampLimit(limit);

  if (cursor) {
    const cursorRows = await sql`
      SELECT usage_count, inserted_at FROM agents WHERE id = ${cursor} LIMIT 1
    `;
    if (cursorRows.length === 0) {
      throw Object.assign(new Error('Invalid cursor'), { code: 'BAD_REQUEST' });
    }
    const cursorRow = cursorRows[0] as Record<string, unknown>;
    const cursorUsage = cursorRow['usage_count'] as number;
    const cursorAt = cursorRow['inserted_at'] as Date;

    if (category) {
      const rows = await sql`
        SELECT
          a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
          a.model, a.visibility, a.category, a.usage_count,
          a.rating_sum, a.rating_count,
          CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
          a.inserted_at, a.updated_at,
          u.username, u.display_name, u.avatar_url AS creator_avatar_url
        FROM agents a
        JOIN users u ON u.id = a.creator_id
        WHERE a.visibility = 'public'
          AND a.category = ${category}
          AND (a.usage_count < ${cursorUsage}
            OR (a.usage_count = ${cursorUsage} AND a.inserted_at < ${cursorAt}))
        ORDER BY a.usage_count DESC, a.inserted_at DESC
        LIMIT ${clampedLimit}
      `;
      return rows.map((row) => formatMarketplaceAgent(row as Record<string, unknown>));
    }

    const rows = await sql`
      SELECT
        a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
        a.model, a.visibility, a.category, a.usage_count,
        a.rating_sum, a.rating_count,
        CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
        a.inserted_at, a.updated_at,
        u.username, u.display_name, u.avatar_url AS creator_avatar_url
      FROM agents a
      JOIN users u ON u.id = a.creator_id
      WHERE a.visibility = 'public'
        AND (a.usage_count < ${cursorUsage}
          OR (a.usage_count = ${cursorUsage} AND a.inserted_at < ${cursorAt}))
      ORDER BY a.usage_count DESC, a.inserted_at DESC
      LIMIT ${clampedLimit}
    `;
    return rows.map((row) => formatMarketplaceAgent(row as Record<string, unknown>));
  }

  if (category) {
    const rows = await sql`
      SELECT
        a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
        a.model, a.visibility, a.category, a.usage_count,
        a.rating_sum, a.rating_count,
        CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
        a.inserted_at, a.updated_at,
        u.username, u.display_name, u.avatar_url AS creator_avatar_url
      FROM agents a
      JOIN users u ON u.id = a.creator_id
      WHERE a.visibility = 'public' AND a.category = ${category}
      ORDER BY a.usage_count DESC, a.inserted_at DESC
      LIMIT ${clampedLimit}
    `;
    return rows.map((row) => formatMarketplaceAgent(row as Record<string, unknown>));
  }

  const rows = await sql`
    SELECT
      a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
      a.model, a.visibility, a.category, a.usage_count,
      a.rating_sum, a.rating_count,
      CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
      a.inserted_at, a.updated_at,
      u.username, u.display_name, u.avatar_url AS creator_avatar_url
    FROM agents a
    JOIN users u ON u.id = a.creator_id
    WHERE a.visibility = 'public'
    ORDER BY a.usage_count DESC, a.inserted_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((row) => formatMarketplaceAgent(row as Record<string, unknown>));
}

export async function searchMarketplace(query: string, userId: string, cursor?: string, limit?: number) {
  const clampedLimit = clampLimit(limit);
  const escapedQuery = query.replace(/[%_\\]/g, '\\$&');
  const searchPattern = `%${escapedQuery}%`;

  if (cursor) {
    // Cursor for search uses inserted_at from the agents table directly
    const cursorRows = await sql`
      SELECT inserted_at FROM agents WHERE id = ${cursor} LIMIT 1
    `;
    if (cursorRows.length === 0) {
      throw Object.assign(new Error('Invalid cursor'), { code: 'BAD_REQUEST' });
    }
    const agentCursorAt = (cursorRows[0] as Record<string, unknown>)['inserted_at'] as Date;

    const rows = await sql`
      SELECT
        a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
        a.model, a.visibility, a.category, a.usage_count,
        a.rating_sum, a.rating_count,
        CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
        a.inserted_at, a.updated_at,
        u.username, u.display_name, u.avatar_url AS creator_avatar_url
      FROM agents a
      JOIN users u ON u.id = a.creator_id
      WHERE a.visibility = 'public'
        AND (a.name ILIKE ${searchPattern} OR a.description ILIKE ${searchPattern})
        AND a.inserted_at < ${agentCursorAt}
      ORDER BY a.usage_count DESC, a.inserted_at DESC
      LIMIT ${clampedLimit}
    `;
    return rows.map((row) => formatMarketplaceAgent(row as Record<string, unknown>));
  }

  const rows = await sql`
    SELECT
      a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
      a.model, a.visibility, a.category, a.usage_count,
      a.rating_sum, a.rating_count,
      CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
      a.inserted_at, a.updated_at,
      u.username, u.display_name, u.avatar_url AS creator_avatar_url
    FROM agents a
    JOIN users u ON u.id = a.creator_id
    WHERE a.visibility = 'public'
      AND (a.name ILIKE ${searchPattern} OR a.description ILIKE ${searchPattern})
    ORDER BY a.usage_count DESC, a.inserted_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((row) => formatMarketplaceAgent(row as Record<string, unknown>));
}

export async function getMarketplaceAgent(slugOrId: string) {
  // Try by slug first, then by id
  let rows = await sql`
    SELECT
      a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
      a.system_prompt, a.model, a.visibility, a.category, a.usage_count,
      a.rating_sum, a.rating_count,
      CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
      a.metadata, a.inserted_at, a.updated_at,
      u.username, u.display_name, u.avatar_url AS creator_avatar_url
    FROM agents a
    JOIN users u ON u.id = a.creator_id
    WHERE a.slug = ${slugOrId} AND a.visibility = 'public'
    LIMIT 1
  `;

  if (rows.length === 0) {
    rows = await sql`
      SELECT
        a.id, a.creator_id, a.name, a.slug, a.description, a.avatar_url,
        a.system_prompt, a.model, a.visibility, a.category, a.usage_count,
        a.rating_sum, a.rating_count,
        CASE WHEN a.rating_count > 0 THEN a.rating_sum::float / a.rating_count ELSE 0 END AS rating_avg,
        a.metadata, a.inserted_at, a.updated_at,
        u.username, u.display_name, u.avatar_url AS creator_avatar_url
      FROM agents a
      JOIN users u ON u.id = a.creator_id
      WHERE a.id = ${slugOrId} AND a.visibility = 'public'
      LIMIT 1
    `;
  }

  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  const row = rows[0] as Record<string, unknown>;
  return {
    id: row['id'],
    creator_id: row['creator_id'],
    name: row['name'],
    slug: row['slug'],
    description: row['description'],
    avatar_url: row['avatar_url'],
    system_prompt: row['system_prompt'],
    model: row['model'],
    visibility: row['visibility'],
    category: row['category'],
    usage_count: Number(row['usage_count']),
    rating_sum: row['rating_sum'],
    rating_count: row['rating_count'],
    rating_avg: row['rating_avg'],
    metadata: row['metadata'],
    created_at: toISO(row['inserted_at']),
    updated_at: toISO(row['updated_at']),
    creator: {
      id: row['creator_id'],
      username: row['username'],
      display_name: row['display_name'],
      avatar_url: row['creator_avatar_url'],
    },
  };
}

export async function listCategories() {
  const rows = await sql`
    SELECT category, COUNT(*)::int AS count
    FROM agents
    WHERE visibility = 'public' AND category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
  `;
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return { category: r['category'], count: r['count'] };
  });
}

export async function rateAgent(
  agentId: string,
  userId: string,
  rating: number,
  review?: string,
  dimensionalScores?: {
    accuracy_score?: number;
    helpfulness_score?: number;
    speed_score?: number;
    conversation_id?: string;
    message_id?: string;
  },
) {
  // Verify agent exists and is public
  const agentRows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND visibility = 'public' LIMIT 1
  `;
  if (agentRows.length === 0) {
    throw Object.assign(new Error('Agent not found'), { code: 'NOT_FOUND' });
  }

  // @ts-expect-error postgres.js TransactionSql type lacks call signatures but works at runtime
  return await sql.begin(async (tx: typeof sql) => {
    // Upsert rating
    const existingRows = await tx`
      SELECT id, rating AS old_rating FROM agent_ratings
      WHERE agent_id = ${agentId} AND user_id = ${userId}
      LIMIT 1
    `;

    if (existingRows.length > 0) {
      const existing = existingRows[0] as Record<string, unknown>;
      const oldRating = existing['old_rating'] as number;
      const ratingDiff = rating - oldRating;

      await tx`
        UPDATE agent_ratings
        SET rating = ${rating}, review = ${review ?? null},
            accuracy_score = ${dimensionalScores?.accuracy_score ?? null},
            helpfulness_score = ${dimensionalScores?.helpfulness_score ?? null},
            speed_score = ${dimensionalScores?.speed_score ?? null},
            conversation_id = ${dimensionalScores?.conversation_id ?? null},
            message_id = ${dimensionalScores?.message_id ?? null},
            inserted_at = NOW()
        WHERE agent_id = ${agentId} AND user_id = ${userId}
      `;

      await tx`
        UPDATE agents
        SET rating_sum = rating_sum + ${ratingDiff}, updated_at = NOW()
        WHERE id = ${agentId}
      `;
    } else {
      await tx`
        INSERT INTO agent_ratings (id, agent_id, user_id, rating, review, accuracy_score, helpfulness_score, speed_score, conversation_id, message_id, inserted_at)
        VALUES (${randomUUID()}, ${agentId}, ${userId}, ${rating}, ${review ?? null},
          ${dimensionalScores?.accuracy_score ?? null}, ${dimensionalScores?.helpfulness_score ?? null},
          ${dimensionalScores?.speed_score ?? null}, ${dimensionalScores?.conversation_id ?? null},
          ${dimensionalScores?.message_id ?? null}, NOW())
      `;

      await tx`
        UPDATE agents
        SET rating_sum = rating_sum + ${rating},
            rating_count = rating_count + 1,
            updated_at = NOW()
        WHERE id = ${agentId}
      `;
    }

    // Return updated agent summary
    const rows = await tx`
      SELECT rating_sum, rating_count,
             CASE WHEN rating_count > 0 THEN rating_sum::float / rating_count ELSE 0 END AS rating_avg
      FROM agents WHERE id = ${agentId}
    `;
    const r = rows[0] as Record<string, unknown>;
    return {
      agent_id: agentId,
      rating_sum: r['rating_sum'],
      rating_count: r['rating_count'],
      rating_avg: r['rating_avg'],
      your_rating: rating,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Follows                                                                   */
/* -------------------------------------------------------------------------- */

export async function followUser(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw Object.assign(new Error('Cannot follow yourself'), { code: 'BAD_REQUEST' });
  }

  // Verify target user exists
  const userRows = await sql`
    SELECT id FROM users WHERE id = ${followingId} LIMIT 1
  `;
  if (userRows.length === 0) {
    throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
  }

  await sql`
    INSERT INTO user_follows (id, follower_id, following_id, inserted_at)
    VALUES (${randomUUID()}, ${followerId}, ${followingId}, NOW())
    ON CONFLICT (follower_id, following_id) DO NOTHING
  `;
}

export async function unfollowUser(followerId: string, followingId: string) {
  await sql`
    DELETE FROM user_follows WHERE follower_id = ${followerId} AND following_id = ${followingId}
  `;
}

/* -------------------------------------------------------------------------- */
/*  Marketplace formatter                                                     */
/* -------------------------------------------------------------------------- */

function formatMarketplaceAgent(row: Record<string, unknown>) {
  return {
    id: row['id'],
    creator_id: row['creator_id'],
    name: row['name'],
    slug: row['slug'],
    description: row['description'],
    avatar_url: row['avatar_url'],
    model: row['model'],
    visibility: row['visibility'],
    category: row['category'],
    usage_count: Number(row['usage_count']),
    rating_sum: row['rating_sum'],
    rating_count: row['rating_count'],
    rating_avg: row['rating_avg'],
    created_at: toISO(row['inserted_at']),
    updated_at: toISO(row['updated_at']),
    creator: {
      id: row['creator_id'],
      username: row['username'],
      display_name: row['display_name'],
      avatar_url: row['creator_avatar_url'],
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Message Feedback                                                          */
/* -------------------------------------------------------------------------- */

export async function submitMessageFeedback(
  conversationId: string,
  messageId: string,
  userId: string,
  agentId: string,
  feedback: string,
  reason?: string,
) {
  await sql`
    INSERT INTO message_feedback (id, message_id, conversation_id, user_id, agent_id, feedback, reason, inserted_at)
    VALUES (${randomUUID()}, ${messageId}, ${conversationId}, ${userId}, ${agentId}, ${feedback}, ${reason ?? null}, NOW())
    ON CONFLICT (message_id, user_id) DO UPDATE SET feedback = ${feedback}, reason = ${reason ?? null}
  `;
  return { message_id: messageId, feedback, reason };
}

export async function shouldPromptFeedback(conversationId: string): Promise<boolean> {
  // Check if conversation has 3+ messages (real interaction)
  const countRows = await sql`
    SELECT COUNT(*)::int AS cnt FROM messages
    WHERE conversation_id = ${conversationId} AND deleted_at IS NULL
  `;
  const count = (countRows[0] as Record<string, unknown>)['cnt'] as number;
  if (count >= 6) return true; // 3+ turns = 6+ messages (user + agent)

  // 20% random sampling for shorter conversations
  return Math.random() < 0.2;
}
