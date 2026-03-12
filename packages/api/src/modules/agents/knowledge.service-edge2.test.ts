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

const NOW = new Date('2026-01-01T00:00:00.000Z');

function makeNodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: NODE_ID,
    agent_id: AGENT_ID,
    user_id: USER_ID,
    label: 'Person',
    name: 'Alice',
    description: 'A developer',
    properties: {},
    created_at: NOW,
    updated_at: NOW,
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
    created_at: NOW,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  createNode — CRUD tests                                                   */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — createNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a node with minimal input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Person',
      name: 'Alice',
    });

    expect(result.label).toBe('Person');
    expect(result.name).toBe('Alice');
    expect(result.description).toBe('A developer');
    expect(result.properties).toEqual({});
  });

  it('creates a node with description', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ description: 'Senior engineer' })] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Person',
      name: 'Alice',
      description: 'Senior engineer',
    });

    expect(result.description).toBe('Senior engineer');
  });

  it('creates a node with properties', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const props = { age: 30, skills: ['TypeScript', 'Python'] };

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ properties: props })] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Person',
      name: 'Alice',
      properties: props,
    });

    expect(result.properties).toEqual(props);
  });

  it('throws NOT_FOUND when agent does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createNode } = await import('./knowledge.service.js');
    await expect(
      createNode('nonexistent', USER_ID, { label: 'X', name: 'Y' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when user is not agent owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createNode } = await import('./knowledge.service.js');
    await expect(
      createNode(AGENT_ID, OTHER_USER_ID, { label: 'X', name: 'Y' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('creates node with special characters in name', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const specialName = "O'Brien & Partners <LLC>";

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ name: specialName })] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Company',
      name: specialName,
    });

    expect(result.name).toBe(specialName);
  });

  it('creates node with very long description', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const longDesc = 'D'.repeat(5000);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ description: longDesc })] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Document',
      name: 'Large Doc',
      description: longDesc,
    });

    expect((result as Record<string, unknown>).description as string).toHaveLength(5000);
  });
});

/* -------------------------------------------------------------------------- */
/*  getNode                                                                    */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — getNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns node for valid owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeNodeRow()] as any);

    const { getNode } = await import('./knowledge.service.js');
    const result = await getNode(NODE_ID, USER_ID);

    expect(result.id).toBe(NODE_ID);
    expect(result.name).toBe('Alice');
  });

  it('throws NOT_FOUND for non-owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getNode } = await import('./knowledge.service.js');
    await expect(getNode(NODE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when node row is not returned from SELECT', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getNode } = await import('./knowledge.service.js');
    await expect(getNode(NODE_ID, USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('formats created_at and updated_at as ISO strings', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([
      makeNodeRow({
        created_at: new Date('2026-06-15T10:30:00.000Z'),
        updated_at: new Date('2026-06-16T14:00:00.000Z'),
      }),
    ] as any);

    const { getNode } = await import('./knowledge.service.js');
    const result = await getNode(NODE_ID, USER_ID);

    expect(result.created_at).toBe('2026-06-15T10:30:00.000Z');
    expect(result.updated_at).toBe('2026-06-16T14:00:00.000Z');
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteNode                                                                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — deleteNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a node successfully', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteNode } = await import('./knowledge.service.js');
    await expect(deleteNode(NODE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND for non-existent node', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteNode } = await import('./knowledge.service.js');
    await expect(deleteNode('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
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
/*  deleteEdge                                                                */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — deleteEdge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes an edge successfully', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: EDGE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteEdge } = await import('./knowledge.service.js');
    await expect(deleteEdge(EDGE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND for non-existent edge', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteEdge } = await import('./knowledge.service.js');
    await expect(deleteEdge('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when non-owner tries to delete edge', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteEdge } = await import('./knowledge.service.js');
    await expect(deleteEdge(EDGE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  listNodes — search with LIKE wildcards                                    */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — listNodes search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns nodes filtered by label', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ label: 'Concept' })] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID, { label: 'Concept' });

    expect(results).toHaveLength(1);
    expect(results[0].label).toBe('Concept');
  });

  it('returns nodes filtered by search term', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID, { search: 'Ali' });

    expect(results).toHaveLength(1);
  });

  it('handles search term with percent wildcard character', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID, { search: '50%' });

    // Should not crash — the % is escaped in the service
    expect(results).toHaveLength(0);
  });

  it('handles search term with underscore wildcard character', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID, { search: 'test_case' });

    expect(results).toHaveLength(0);
  });

  it('handles search term with backslash character', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID, { search: 'path\\to' });

    expect(results).toHaveLength(0);
  });

  it('uses default limit of 50 when not specified', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    await listNodes(AGENT_ID, USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('uses default offset of 0 when not specified', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID);

    expect(results).toHaveLength(1);
  });

  it('handles both label and search combined', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID, {
      label: 'Person',
      search: 'Alice',
    });

    expect(results).toHaveLength(1);
  });

  it('throws NOT_FOUND when non-owner lists nodes', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listNodes } = await import('./knowledge.service.js');
    await expect(listNodes(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  listEdges — filtering                                                     */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — listEdges filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all edges for an agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow()] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const results = await listEdges(AGENT_ID, USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].relationship).toBe('knows');
  });

  it('filters by relationship type', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ relationship: 'works_with' })] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const results = await listEdges(AGENT_ID, USER_ID, {
      relationship: 'works_with',
    });

    expect(results).toHaveLength(1);
    expect(results[0].relationship).toBe('works_with');
  });

  it('returns empty array when no edges match', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const results = await listEdges(AGENT_ID, USER_ID, {
      relationship: 'nonexistent',
    });

    expect(results).toHaveLength(0);
  });

  it('paginates with offset', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow()] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const results = await listEdges(AGENT_ID, USER_ID, {
      offset: 10,
      limit: 5,
    });

    expect(results).toHaveLength(1);
  });

  it('throws NOT_FOUND for non-owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listEdges } = await import('./knowledge.service.js');
    await expect(listEdges(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  updateNode — additional edge cases                                        */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — updateNode additional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates label only', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ label: 'Organization' })] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, {
      label: 'Organization',
    });

    expect(result.label).toBe('Organization');
  });

  it('updates name only', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ name: 'Bob' })] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, { name: 'Bob' });

    expect(result.name).toBe('Bob');
  });

  it('clears description by setting to null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ description: null })] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, {
      description: null,
    });

    expect(result.description).toBeNull();
  });

  it('updates all fields at once', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const newProps = { level: 'expert' };

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeNodeRow({
        label: 'Expert',
        name: 'Charlie',
        description: 'Domain expert',
        properties: newProps,
      }),
    ] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, {
      label: 'Expert',
      name: 'Charlie',
      description: 'Domain expert',
      properties: newProps,
    });

    expect(result.label).toBe('Expert');
    expect(result.name).toBe('Charlie');
    expect(result.description).toBe('Domain expert');
    expect(result.properties).toEqual(newProps);
  });

  it('updates with empty object (no changes)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow()] as any);

    const { updateNode } = await import('./knowledge.service.js');
    const result = await updateNode(NODE_ID, USER_ID, {});

    expect(result.name).toBe('Alice');
  });

  it('throws NOT_FOUND for non-owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateNode } = await import('./knowledge.service.js');
    await expect(updateNode(NODE_ID, OTHER_USER_ID, { name: 'Hack' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  createEdge — additional edge cases                                        */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — createEdge additional', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates edge with all fields populated', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const props = { since: 2020, context: 'colleague' };

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ weight: 0.5, properties: props })] as any);

    const { createEdge } = await import('./knowledge.service.js');
    const result = await createEdge(AGENT_ID, USER_ID, {
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'works_with',
      weight: 0.5,
      properties: props,
    });

    expect(result.weight).toBe(0.5);
    expect(result.properties).toEqual(props);
  });

  it('creates edge with relationship containing special characters', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: NODE_ID_2 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ relationship: 'is-a/subtype_of' })] as any);

    const { createEdge } = await import('./knowledge.service.js');
    const result = await createEdge(AGENT_ID, USER_ID, {
      source_node_id: NODE_ID,
      target_node_id: NODE_ID_2,
      relationship: 'is-a/subtype_of',
    });

    expect(result.relationship).toBe('is-a/subtype_of');
  });

  it('throws NOT_FOUND for non-owner agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createEdge } = await import('./knowledge.service.js');
    await expect(
      createEdge(AGENT_ID, OTHER_USER_ID, {
        source_node_id: NODE_ID,
        target_node_id: NODE_ID_2,
        relationship: 'knows',
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  Large document handling                                                    */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — large document handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates node with very large properties object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Create a large properties object
    const largeProps: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      largeProps[`key_${i}`] = 'value_'.repeat(100);
    }

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ properties: largeProps })] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Document',
      name: 'Large Document',
      properties: largeProps,
    });

    expect(Object.keys(result.properties as Record<string, unknown>).length).toBe(100);
  });

  it('creates node with deeply nested properties', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const deepProps = {
      level1: {
        level2: {
          level3: {
            level4: {
              value: 'deep',
            },
          },
        },
      },
    };

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeNodeRow({ properties: deepProps })] as any);

    const { createNode } = await import('./knowledge.service.js');
    const result = await createNode(AGENT_ID, USER_ID, {
      label: 'Config',
      name: 'Deep Config',
      properties: deepProps,
    });

    const props = result.properties as any;
    expect(props.level1.level2.level3.level4.value).toBe('deep');
  });

  it('lists many nodes correctly', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    const manyNodes = Array.from({ length: 50 }, (_, i) =>
      makeNodeRow({ id: `node-${i}`, name: `Node ${i}` }),
    );

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce(manyNodes as any);

    const { listNodes } = await import('./knowledge.service.js');
    const results = await listNodes(AGENT_ID, USER_ID, { limit: 50 });

    expect(results).toHaveLength(50);
    expect(results[0].name).toBe('Node 0');
    expect(results[49].name).toBe('Node 49');
  });
});

/* -------------------------------------------------------------------------- */
/*  formatNode / formatEdge — timestamp edge cases                            */
/* -------------------------------------------------------------------------- */

describe('knowledge.service (edge2) — timestamp formatting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null created_at returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeNodeRow({ created_at: null })] as any);

    const { getNode } = await import('./knowledge.service.js');
    const node = await getNode(NODE_ID, USER_ID);

    expect(node.created_at).toBeNull();
  });

  it('handles null updated_at returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([makeNodeRow({ updated_at: null })] as any);

    const { getNode } = await import('./knowledge.service.js');
    const node = await getNode(NODE_ID, USER_ID);

    expect(node.updated_at).toBeNull();
  });

  it('handles edge with null created_at', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeEdgeRow({ created_at: null })] as any);

    const { listEdges } = await import('./knowledge.service.js');
    const edges = await listEdges(AGENT_ID, USER_ID);

    expect(edges[0].created_at).toBeNull();
  });

  it('handles string date values (converted by toISO)', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: NODE_ID }] as any);
    vi.mocked(sql.unsafe).mockResolvedValueOnce([
      makeNodeRow({ created_at: '2026-07-01T00:00:00.000Z' }),
    ] as any);

    const { getNode } = await import('./knowledge.service.js');
    const node = await getNode(NODE_ID, USER_ID);

    expect(node.created_at).toBe('2026-07-01T00:00:00.000Z');
  });
});
