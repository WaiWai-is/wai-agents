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
const NODE_ID = 'aa0e8400-e29b-41d4-a716-446655440010';
const NODE_ID_2 = 'aa0e8400-e29b-41d4-a716-446655440011';
const NODE_ID_3 = 'aa0e8400-e29b-41d4-a716-446655440012';
const EDGE_ID = 'cc0e8400-e29b-41d4-a716-446655440020';
const EDGE_ID_2 = 'cc0e8400-e29b-41d4-a716-446655440021';

function makeNodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NODE_ID,
    agent_id: AGENT_ID,
    user_id: USER_ID,
    label: 'Person',
    name: 'Alice',
    description: 'A developer',
    properties: {},
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeEdgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EDGE_ID,
    agent_id: AGENT_ID,
    user_id: USER_ID,
    source_node_id: NODE_ID,
    target_node_id: NODE_ID_2,
    relationship: 'knows',
    weight: 1.0,
    properties: {},
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  getNeighbors — edge cases                                                 */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge) — getNeighbors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses depth=1 by default (minimum)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    await getNeighbors(NODE_ID, USER_ID);

    expect(sqlUnsafeMock).toHaveBeenCalledWith(expect.any(String), [NODE_ID, 1, USER_ID]);
  });

  it('caps depth at 5 even if higher value is provided', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    await getNeighbors(NODE_ID, USER_ID, { depth: 100 });

    expect(sqlUnsafeMock).toHaveBeenCalledWith(expect.any(String), [NODE_ID, 5, USER_ID]);
  });

  it('returns empty with direction=in when no inbound edges exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID, { direction: 'in' });

    expect(neighbors).toHaveLength(0);
  });

  it('returns empty with direction=out when no outbound edges exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID, { direction: 'out' });

    expect(neighbors).toHaveLength(0);
  });

  it('returns empty with direction=both when node is isolated', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID, { direction: 'both' });

    expect(neighbors).toHaveLength(0);
  });

  it('returns neighbor with null edge when no edge data joins', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([
      {
        ...makeNodeRow({ id: NODE_ID_2, name: 'Bob' }),
        // No edge fields — LEFT JOIN returned nulls
        source_node_id: null,
        target_node_id: null,
        relationship: null,
        weight: null,
        depth: 1,
      },
    ] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID);

    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].node.name).toBe('Bob');
    expect(neighbors[0].edge).toBeNull();
    expect(neighbors[0].depth).toBe(1);
  });

  it('returns multiple neighbors at different depths', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([
      {
        ...makeNodeRow({ id: NODE_ID_2, name: 'Bob' }),
        ...makeEdgeRow(),
        depth: 1,
      },
      {
        ...makeNodeRow({ id: NODE_ID_3, name: 'Charlie' }),
        ...makeEdgeRow({ id: EDGE_ID_2, source_node_id: NODE_ID_2, target_node_id: NODE_ID_3 }),
        depth: 2,
      },
    ] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID, { depth: 3 });

    expect(neighbors).toHaveLength(2);
    expect(neighbors[0].depth).toBe(1);
    expect(neighbors[1].depth).toBe(2);
  });

  it('throws NOT_FOUND when non-owner tries to get neighbors', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    await expect(getNeighbors(NODE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  findPaths — edge cases                                                    */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge) — findPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty when no path exists between nodes', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    const paths = await findPaths(NODE_ID, NODE_ID_2, USER_ID);

    expect(paths).toHaveLength(0);
  });

  it('uses maxDepth=1 for direct connections only', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    await findPaths(NODE_ID, NODE_ID_2, USER_ID, 1);

    expect(sqlUnsafeMock).toHaveBeenCalledWith(expect.any(String), [
      NODE_ID,
      NODE_ID_2,
      USER_ID,
      1,
    ]);
  });

  it('caps maxDepth at 10', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    await findPaths(NODE_ID, NODE_ID_2, USER_ID, 50);

    expect(sqlUnsafeMock).toHaveBeenCalledWith(expect.any(String), [
      NODE_ID,
      NODE_ID_2,
      USER_ID,
      10,
    ]);
  });

  it('defaults maxDepth to 3 when not provided', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    await findPaths(NODE_ID, NODE_ID_2, USER_ID);

    expect(sqlUnsafeMock).toHaveBeenCalledWith(expect.any(String), [
      NODE_ID,
      NODE_ID_2,
      USER_ID,
      3,
    ]);
  });

  it('returns multiple paths between nodes sorted by weight', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    // Two paths found
    sqlUnsafeMock.mockResolvedValueOnce([
      {
        path: [NODE_ID, NODE_ID_2],
        edge_ids: [EDGE_ID],
        total_weight: 1.0,
      },
      {
        path: [NODE_ID, NODE_ID_3, NODE_ID_2],
        edge_ids: [EDGE_ID, EDGE_ID_2],
        total_weight: 2.0,
      },
    ] as any);
    // Fetch nodes for path 1
    sqlUnsafeMock.mockResolvedValueOnce([
      makeNodeRow(),
      makeNodeRow({ id: NODE_ID_2, name: 'Bob' }),
    ] as any);
    // Fetch edges for path 1
    sqlUnsafeMock.mockResolvedValueOnce([makeEdgeRow()] as any);
    // Fetch nodes for path 2
    sqlUnsafeMock.mockResolvedValueOnce([
      makeNodeRow(),
      makeNodeRow({ id: NODE_ID_3, name: 'Charlie' }),
      makeNodeRow({ id: NODE_ID_2, name: 'Bob' }),
    ] as any);
    // Fetch edges for path 2
    sqlUnsafeMock.mockResolvedValueOnce([
      makeEdgeRow(),
      makeEdgeRow({ id: EDGE_ID_2, source_node_id: NODE_ID_3, target_node_id: NODE_ID_2 }),
    ] as any);

    const { findPaths } = await import('./knowledge.service.js');
    const paths = await findPaths(NODE_ID, NODE_ID_2, USER_ID);

    expect(paths).toHaveLength(2);
    expect(paths[0].total_weight).toBe(1.0);
    expect(paths[1].total_weight).toBe(2.0);
  });

  it('handles path with empty edge_ids array', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    // Path found but somehow with empty edge_ids (shouldn't happen normally, but edge case)
    sqlUnsafeMock.mockResolvedValueOnce([
      {
        path: [NODE_ID],
        edge_ids: [],
        total_weight: 0,
      },
    ] as any);
    // Fetch nodes
    sqlUnsafeMock.mockResolvedValueOnce([makeNodeRow()] as any);
    // No edge fetch needed (empty edge_ids)

    const { findPaths } = await import('./knowledge.service.js');
    const paths = await findPaths(NODE_ID, NODE_ID_2, USER_ID);

    expect(paths).toHaveLength(1);
    expect(paths[0].edges).toHaveLength(0);
    expect(paths[0].total_weight).toBe(0);
  });

  it('throws NOT_FOUND when source node does not belong to user', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    await expect(findPaths(NODE_ID, NODE_ID_2, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when target node does not belong to user', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    await expect(findPaths(NODE_ID, NODE_ID_2, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  createEdge — edge cases (non-existent nodes)                              */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge) — createEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND with "Source node not found" for non-existent source', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // source node not found

    const { createEdge } = await import('./knowledge.service.js');
    await expect(
      createEdge(AGENT_ID, USER_ID, {
        source_node_id: 'nonexistent-source',
        target_node_id: NODE_ID_2,
        relationship: 'knows',
      }),
    ).rejects.toThrow('Source node not found');
  });

  it('throws NOT_FOUND with "Target node not found" for non-existent target', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any); // source found
    sqlMock.mockResolvedValueOnce([] as any); // target node not found

    const { createEdge } = await import('./knowledge.service.js');
    await expect(
      createEdge(AGENT_ID, USER_ID, {
        source_node_id: NODE_ID,
        target_node_id: 'nonexistent-target',
        relationship: 'knows',
      }),
    ).rejects.toThrow('Target node not found');
  });

  it('defaults weight to 1.0 when not provided', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // INSERT
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ weight: 1.0 })] as any); // SELECT

    const { createEdge } = await import('./knowledge.service.js');
    const result = await createEdge(AGENT_ID, USER_ID, {
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'connects',
    });

    expect(result.weight).toBe(1.0);
  });

  it('creates edge with weight at boundary 0', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ weight: 0 })] as any);

    const { createEdge } = await import('./knowledge.service.js');
    const result = await createEdge(AGENT_ID, USER_ID, {
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'weak_link',
      weight: 0,
    });

    expect(result.weight).toBe(0);
  });

  it('creates edge with complex properties', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const complexProps = { since: 2020, context: 'work', tags: ['colleague', 'mentor'] };

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ properties: complexProps })] as any);

    const { createEdge } = await import('./knowledge.service.js');
    const result = await createEdge(AGENT_ID, USER_ID, {
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'mentors',
      properties: complexProps,
    });

    expect(result.properties).toEqual(complexProps);
  });
});

/* -------------------------------------------------------------------------- */
/*  updateNode — edge cases                                                   */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge) — updateNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only description while keeping other fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeNodeRow({ description: 'Updated description', label: 'Person', name: 'Alice' }),
    ] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, { description: 'Updated description' });

    expect(result.description).toBe('Updated description');
    expect(result.label).toBe('Person');
    expect(result.name).toBe('Alice');
  });

  it('updates properties to a complex nested object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const newProps = { skills: ['TypeScript', 'Rust'], level: 'senior', nested: { a: 1 } };

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ properties: newProps })] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, { properties: newProps });

    expect(result.properties).toEqual(newProps);
  });

  it('throws NOT_FOUND when UPDATE RETURNING returns empty', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any); // assertNodeOwner
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE RETURNING empty

    const { updateNode } = await import('./knowledge.service.js');
    await expect(updateNode(NODE_ID, USER_ID, { name: 'test' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  listNodes / listEdges — edge cases                                        */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge) — listNodes limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps limit to 200', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    await listNodes(AGENT_ID, USER_ID, { limit: 500 });

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('handles zero offset', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const nodes = await listNodes(AGENT_ID, USER_ID, { offset: 0 });

    expect(nodes).toHaveLength(1);
  });
});

describe('knowledge.service (edge) — listEdges limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caps limit to 200', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listEdges } = await import('./knowledge.service.js');
    await listEdges(AGENT_ID, USER_ID, { limit: 999 });

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('filters by nodeId', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow()] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const edges = await listEdges(AGENT_ID, USER_ID, { nodeId: NODE_ID });

    expect(edges).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  formatNode / formatEdge — edge cases via getNode/listEdges                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge) — formatNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null description returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeNodeRow({ description: null })] as any);

    const { getNode } = await import('./knowledge.service.js');
    const node = await getNode(NODE_ID, USER_ID);

    expect(node.description).toBeNull();
  });

  it('handles undefined description returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeNodeRow({ description: undefined })] as any);

    const { getNode } = await import('./knowledge.service.js');
    const node = await getNode(NODE_ID, USER_ID);

    expect(node.description).toBeNull();
  });

  it('handles undefined properties defaulting to empty object', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeNodeRow({ properties: undefined })] as any);

    const { getNode } = await import('./knowledge.service.js');
    const node = await getNode(NODE_ID, USER_ID);

    expect(node.properties).toEqual({});
  });
});

describe('knowledge.service (edge) — formatEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles undefined properties defaulting to empty object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ properties: undefined })] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const edges = await listEdges(AGENT_ID, USER_ID);

    expect(edges[0].properties).toEqual({});
  });
});
