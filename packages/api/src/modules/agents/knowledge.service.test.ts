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
const EDGE_ID = 'cc0e8400-e29b-41d4-a716-446655440020';

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
/*  createNode                                                                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — createNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a node with required fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any); // assertAgentOwner
    sqlMock.mockResolvedValueOnce([] as any); // INSERT
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any); // SELECT

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Person',
      name: 'Alice',
    });

    expect(result.id).toBe(NODE_ID);
    expect(result.label).toBe('Person');
    expect(result.name).toBe('Alice');
    expect(result.created_at).toBe(new Date('2026-01-01').toISOString());
  });

  it('creates a node with all optional fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeNodeRow({
        description: 'Senior developer',
        properties: { role: 'lead' },
      }),
    ] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Person',
      name: 'Alice',
      description: 'Senior developer',
      properties: { role: 'lead' },
    });

    expect(result.description).toBe('Senior developer');
    expect(result.properties).toEqual({ role: 'lead' });
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createNode } = await import('./knowledge.service.js');
    await expect(
      createNode(AGENT_ID, OTHER_USER_ID, { label: 'Person', name: 'Alice' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('defaults properties to empty object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ properties: {} })] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Concept',
      name: 'TypeScript',
    });

    expect(result.properties).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/*  listNodes                                                                 */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — listNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns formatted nodes for the user', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const nodes = await listNodes(AGENT_ID, USER_ID);

    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe(NODE_ID);
    expect(nodes[0].name).toBe('Alice');
  });

  it('returns empty array when no nodes exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const nodes = await listNodes(AGENT_ID, USER_ID);

    expect(nodes).toHaveLength(0);
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    await expect(listNodes(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('passes filter options correctly', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ label: 'Concept' })] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const nodes = await listNodes(AGENT_ID, USER_ID, {
      label: 'Concept',
      search: 'Type',
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0].label).toBe('Concept');
  });
});

/* -------------------------------------------------------------------------- */
/*  getNode                                                                   */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — getNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the node for the owner', async () => {
    const { sql } = await import('../../db/connection.js');
    // assertNodeOwner uses sql tagged template
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    // getNode uses sql.unsafe for full select
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeNodeRow()] as any);

    const { getNode } = await import('./knowledge.service.js');
    const node = await getNode(NODE_ID, USER_ID);

    expect(node.id).toBe(NODE_ID);
    expect(node.name).toBe('Alice');
  });

  it('throws NOT_FOUND for non-existent node', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getNode } = await import('./knowledge.service.js');
    await expect(getNode('nonexistent-id', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when non-owner tries to access', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getNode } = await import('./knowledge.service.js');
    await expect(getNode(NODE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  updateNode                                                                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — updateNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates node name', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertNodeOwner
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    // UPDATE RETURNING
    sqlMock.mockResolvedValueOnce([makeNodeRow({ name: 'Bob' })] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, { name: 'Bob' });

    expect(result.name).toBe('Bob');
  });

  it('updates node label', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ label: 'Organization' })] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, { label: 'Organization' });

    expect(result.label).toBe('Organization');
  });

  it('clears description when set to null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ description: null })] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, { description: null });

    expect(result.description).toBeNull();
  });

  it('throws NOT_FOUND when non-owner tries to update', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateNode } = await import('./knowledge.service.js');
    await expect(updateNode(NODE_ID, OTHER_USER_ID, { name: 'Hacked' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteNode                                                                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — deleteNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a node', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertNodeOwner
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    // DELETE
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteNode } = await import('./knowledge.service.js');
    await deleteNode(NODE_ID, USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('throws NOT_FOUND when non-owner tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteNode } = await import('./knowledge.service.js');
    await expect(deleteNode(NODE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  createEdge                                                                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — createEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an edge with required fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any); // assertAgentOwner
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any); // source node check
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any); // target node check
    sqlMock.mockResolvedValueOnce([] as any); // INSERT
    sqlMock.mockResolvedValueOnce([makeEdgeRow()] as any); // SELECT

    const { createEdge } = await import('./knowledge.service.js');
    const result = await createEdge(AGENT_ID, USER_ID, {
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'knows',
    });

    expect(result.id).toBe(EDGE_ID);
    expect(result.relationship).toBe('knows');
    expect(result.weight).toBe(1.0);
  });

  it('creates an edge with custom weight and properties', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeEdgeRow({ weight: 5.0, properties: { since: '2025' } }),
    ] as any);

    const { createEdge } = await import('./knowledge.service.js');
    const result = await createEdge(AGENT_ID, USER_ID, {
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'works_with',
      weight: 5.0,
      properties: { since: '2025' },
    });

    expect(result.weight).toBe(5.0);
    expect(result.properties).toEqual({ since: '2025' });
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createEdge } = await import('./knowledge.service.js');
    await expect(
      createEdge(AGENT_ID, OTHER_USER_ID, {
        source_node_id: NODE_ID,
        target_node_id: NODE_ID_2,
        relationship: 'knows',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when source node does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any); // source not found

    const { createEdge } = await import('./knowledge.service.js');
    await expect(
      createEdge(AGENT_ID, USER_ID, {
        source_node_id: 'nonexistent',
        target_node_id: NODE_ID_2,
        relationship: 'knows',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Source node not found' });
  });

  it('throws NOT_FOUND when target node does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any); // source exists
    sqlMock.mockResolvedValueOnce([] as any); // target not found

    const { createEdge } = await import('./knowledge.service.js');
    await expect(
      createEdge(AGENT_ID, USER_ID, {
        source_node_id: NODE_ID,
        target_node_id: 'nonexistent',
        relationship: 'knows',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Target node not found' });
  });
});

/* -------------------------------------------------------------------------- */
/*  listEdges                                                                 */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — listEdges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns formatted edges for the user', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow()] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const edges = await listEdges(AGENT_ID, USER_ID);

    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe(EDGE_ID);
    expect(edges[0].relationship).toBe('knows');
  });

  it('returns empty array when no edges exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const edges = await listEdges(AGENT_ID, USER_ID);

    expect(edges).toHaveLength(0);
  });

  it('passes filter options correctly', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ relationship: 'works_with' })] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const edges = await listEdges(AGENT_ID, USER_ID, {
      relationship: 'works_with',
      nodeId: NODE_ID,
    });

    expect(edges).toHaveLength(1);
    expect(edges[0].relationship).toBe('works_with');
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listEdges } = await import('./knowledge.service.js');
    await expect(listEdges(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteEdge                                                                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — deleteEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes an edge', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertEdgeOwner
    sqlMock.mockResolvedValueOnce([{ id: EDGE_ID }] as any);
    // DELETE
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteEdge } = await import('./knowledge.service.js');
    await deleteEdge(EDGE_ID, USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('throws NOT_FOUND when non-owner tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteEdge } = await import('./knowledge.service.js');
    await expect(deleteEdge(EDGE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getNeighbors                                                              */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — getNeighbors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns neighbors with default options', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    // assertNodeOwner (tagged template)
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    // CTE query (sql.unsafe)
    sqlUnsafeMock.mockResolvedValueOnce([
      {
        ...makeNodeRow({ id: NODE_ID_2, name: 'Bob' }),
        ...makeEdgeRow(),
        depth: 1,
      },
    ] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID);

    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].depth).toBe(1);
  });

  it('returns empty array when no neighbors exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID);

    expect(neighbors).toHaveLength(0);
  });

  it('throws NOT_FOUND when node does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    await expect(getNeighbors('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('accepts direction parameter', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    const neighbors = await getNeighbors(NODE_ID, USER_ID, { direction: 'out' });

    expect(neighbors).toHaveLength(0);
    expect(sqlUnsafeMock).toHaveBeenCalledTimes(1);
  });

  it('accepts depth parameter', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { getNeighbors } = await import('./knowledge.service.js');
    await getNeighbors(NODE_ID, USER_ID, { depth: 3 });

    expect(sqlUnsafeMock).toHaveBeenCalledWith(expect.any(String), [NODE_ID, 3, USER_ID]);
  });
});

/* -------------------------------------------------------------------------- */
/*  findPaths                                                                 */
/* -------------------------------------------------------------------------- */

describe('knowledge.service — findPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paths between two nodes', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    // assertNodeOwner for source (tagged template)
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    // assertNodeOwner for target (tagged template)
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    // CTE path query (sql.unsafe)
    sqlUnsafeMock.mockResolvedValueOnce([
      {
        path: [NODE_ID, NODE_ID_2],
        edge_ids: [EDGE_ID],
        total_weight: 1.0,
      },
    ] as any);
    // Fetch nodes (sql.unsafe)
    sqlUnsafeMock.mockResolvedValueOnce([
      makeNodeRow(),
      makeNodeRow({ id: NODE_ID_2, name: 'Bob' }),
    ] as any);
    // Fetch edges (sql.unsafe)
    sqlUnsafeMock.mockResolvedValueOnce([makeEdgeRow()] as any);

    const { findPaths } = await import('./knowledge.service.js');
    const paths = await findPaths(NODE_ID, NODE_ID_2, USER_ID);

    expect(paths).toHaveLength(1);
    expect(paths[0].nodes).toHaveLength(2);
    expect(paths[0].edges).toHaveLength(1);
    expect(paths[0].total_weight).toBe(1.0);
  });

  it('returns empty array when no paths exist', async () => {
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

  it('throws NOT_FOUND when source node does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    await expect(findPaths('nonexistent', NODE_ID_2, USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when target node does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any); // source exists
    sqlMock.mockResolvedValueOnce([] as any); // target not found

    const { findPaths } = await import('./knowledge.service.js');
    await expect(findPaths(NODE_ID, 'nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('respects maxDepth parameter', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const sqlUnsafeMock = vi.mocked(sql.unsafe);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlUnsafeMock.mockResolvedValueOnce([] as any);

    const { findPaths } = await import('./knowledge.service.js');
    await findPaths(NODE_ID, NODE_ID_2, USER_ID, 5);

    expect(sqlUnsafeMock).toHaveBeenCalledWith(expect.any(String), [
      NODE_ID,
      NODE_ID_2,
      USER_ID,
      5,
    ]);
  });
});
