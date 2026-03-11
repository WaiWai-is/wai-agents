import { randomUUID } from 'node:crypto';
import { sql } from '../../db/connection.js';
import { toISO } from '../../lib/utils.js';
import type { CreateEdgeInput, CreateNodeInput, UpdateNodeInput } from './knowledge.schema.js';

/* -------------------------------------------------------------------------- */
/*  Formatters                                                                */
/* -------------------------------------------------------------------------- */

function formatNode(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    user_id: row.user_id,
    label: row.label,
    name: row.name,
    description: row.description ?? null,
    properties: row.properties ?? {},
    created_at: toISO(row.created_at),
    updated_at: toISO(row.updated_at),
  };
}

function formatEdge(row: Record<string, unknown>) {
  return {
    id: row.id,
    agent_id: row.agent_id,
    user_id: row.user_id,
    source_node_id: row.source_node_id,
    target_node_id: row.target_node_id,
    relationship: row.relationship,
    weight: row.weight,
    properties: row.properties ?? {},
    created_at: toISO(row.created_at),
  };
}

const NODE_COLS =
  'id, agent_id, user_id, label, name, description, properties, created_at, updated_at';
const EDGE_COLS =
  'id, agent_id, user_id, source_node_id, target_node_id, relationship, weight, properties, created_at';

/* -------------------------------------------------------------------------- */
/*  Ownership Checks                                                          */
/* -------------------------------------------------------------------------- */

async function assertAgentOwner(agentId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM agents WHERE id = ${agentId} AND creator_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Agent not found or access denied'), { code: 'NOT_FOUND' });
  }
}

async function assertNodeOwner(nodeId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM knowledge_nodes WHERE id = ${nodeId} AND user_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Node not found or access denied'), { code: 'NOT_FOUND' });
  }
}

async function assertEdgeOwner(edgeId: string, userId: string): Promise<void> {
  const rows = await sql`
    SELECT id FROM knowledge_edges WHERE id = ${edgeId} AND user_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    throw Object.assign(new Error('Edge not found or access denied'), { code: 'NOT_FOUND' });
  }
}

/* -------------------------------------------------------------------------- */
/*  Node CRUD                                                                 */
/* -------------------------------------------------------------------------- */

export interface ListNodesOptions {
  label?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function createNode(agentId: string, userId: string, input: CreateNodeInput) {
  await assertAgentOwner(agentId, userId);

  const nodeId = randomUUID();
  const now = new Date().toISOString();
  const propertiesJson = input.properties ? JSON.stringify(input.properties) : '{}';

  await sql`
    INSERT INTO knowledge_nodes (
      id, agent_id, user_id, label, name, description, properties, created_at, updated_at
    ) VALUES (
      ${nodeId}, ${agentId}, ${userId}, ${input.label}, ${input.name},
      ${input.description ?? null}, ${propertiesJson}::jsonb, ${now}, ${now}
    )
  `;

  const rows = await sql`
    SELECT ${sql.unsafe(NODE_COLS)} FROM knowledge_nodes WHERE id = ${nodeId}
  `;
  return formatNode(rows[0] as Record<string, unknown>);
}

export async function listNodes(agentId: string, userId: string, options?: ListNodesOptions) {
  await assertAgentOwner(agentId, userId);

  const limit = Math.min(options?.limit ?? 50, 200);
  const offset = options?.offset ?? 0;
  const label = options?.label ?? null;
  const search = options?.search ?? null;

  const rows = await sql`
    SELECT ${sql.unsafe(NODE_COLS)}
    FROM knowledge_nodes
    WHERE agent_id = ${agentId} AND user_id = ${userId}
      AND (${label} IS NULL OR label = ${label})
      AND (${search} IS NULL OR name ILIKE '%' || ${search} || '%')
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((row) => formatNode(row as Record<string, unknown>));
}

export async function getNode(nodeId: string, userId: string) {
  await assertNodeOwner(nodeId, userId);
  const rows = await sql.unsafe(
    `SELECT ${NODE_COLS} FROM knowledge_nodes WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [nodeId, userId],
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Node not found'), { code: 'NOT_FOUND' });
  }
  return formatNode(rows[0] as Record<string, unknown>);
}

export async function updateNode(nodeId: string, userId: string, updates: UpdateNodeInput) {
  await assertNodeOwner(nodeId, userId);

  const hasLabel = updates.label !== undefined;
  const hasName = updates.name !== undefined;
  const hasDescription = updates.description !== undefined;
  const hasProperties = updates.properties !== undefined;

  const label: string | null = hasLabel ? (updates.label as string) : null;
  const name: string | null = hasName ? (updates.name as string) : null;
  const description: string | null = hasDescription ? (updates.description ?? null) : null;
  const propertiesJson: string | null = hasProperties ? JSON.stringify(updates.properties) : null;

  const rows = await sql`
    UPDATE knowledge_nodes SET
      label       = CASE WHEN ${hasLabel} THEN ${label} ELSE label END,
      name        = CASE WHEN ${hasName} THEN ${name} ELSE name END,
      description = CASE WHEN ${hasDescription} THEN ${description} ELSE description END,
      properties  = CASE WHEN ${hasProperties} THEN ${propertiesJson}::jsonb ELSE properties END,
      updated_at  = NOW()
    WHERE id = ${nodeId}
    RETURNING ${sql.unsafe(NODE_COLS)}
  `;

  if (rows.length === 0) {
    throw Object.assign(new Error('Node not found'), { code: 'NOT_FOUND' });
  }

  return formatNode(rows[0] as Record<string, unknown>);
}

export async function deleteNode(nodeId: string, userId: string) {
  await assertNodeOwner(nodeId, userId);
  // Edges are cascade-deleted via FK constraint on source_node_id and target_node_id
  await sql`DELETE FROM knowledge_nodes WHERE id = ${nodeId}`;
}

/* -------------------------------------------------------------------------- */
/*  Edge CRUD                                                                 */
/* -------------------------------------------------------------------------- */

export interface ListEdgesOptions {
  relationship?: string;
  nodeId?: string;
  limit?: number;
  offset?: number;
}

export async function createEdge(agentId: string, userId: string, input: CreateEdgeInput) {
  await assertAgentOwner(agentId, userId);

  // Validate source node exists and belongs to this agent/user
  const sourceRows = await sql`
    SELECT id FROM knowledge_nodes
    WHERE id = ${input.source_node_id} AND agent_id = ${agentId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (sourceRows.length === 0) {
    throw Object.assign(new Error('Source node not found'), { code: 'NOT_FOUND' });
  }

  // Validate target node exists and belongs to this agent/user
  const targetRows = await sql`
    SELECT id FROM knowledge_nodes
    WHERE id = ${input.target_node_id} AND agent_id = ${agentId} AND user_id = ${userId}
    LIMIT 1
  `;
  if (targetRows.length === 0) {
    throw Object.assign(new Error('Target node not found'), { code: 'NOT_FOUND' });
  }

  const edgeId = randomUUID();
  const now = new Date().toISOString();
  const propertiesJson = input.properties ? JSON.stringify(input.properties) : '{}';
  const weight = input.weight ?? 1.0;

  await sql`
    INSERT INTO knowledge_edges (
      id, agent_id, user_id, source_node_id, target_node_id,
      relationship, weight, properties, created_at
    ) VALUES (
      ${edgeId}, ${agentId}, ${userId}, ${input.source_node_id}, ${input.target_node_id},
      ${input.relationship}, ${weight}, ${propertiesJson}::jsonb, ${now}
    )
  `;

  const rows = await sql`
    SELECT ${sql.unsafe(EDGE_COLS)} FROM knowledge_edges WHERE id = ${edgeId}
  `;
  return formatEdge(rows[0] as Record<string, unknown>);
}

export async function listEdges(agentId: string, userId: string, options?: ListEdgesOptions) {
  await assertAgentOwner(agentId, userId);

  const limit = Math.min(options?.limit ?? 50, 200);
  const offset = options?.offset ?? 0;
  const relationship = options?.relationship ?? null;
  const nodeId = options?.nodeId ?? null;

  const rows = await sql`
    SELECT ${sql.unsafe(EDGE_COLS)}
    FROM knowledge_edges
    WHERE agent_id = ${agentId} AND user_id = ${userId}
      AND (${relationship} IS NULL OR relationship = ${relationship})
      AND (${nodeId} IS NULL OR source_node_id = ${nodeId} OR target_node_id = ${nodeId})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((row) => formatEdge(row as Record<string, unknown>));
}

export async function deleteEdge(edgeId: string, userId: string) {
  await assertEdgeOwner(edgeId, userId);
  await sql`DELETE FROM knowledge_edges WHERE id = ${edgeId}`;
}

/* -------------------------------------------------------------------------- */
/*  Graph Queries                                                             */
/* -------------------------------------------------------------------------- */

export interface GetNeighborsOptions {
  depth?: number;
  direction?: 'in' | 'out' | 'both';
}

export async function getNeighbors(nodeId: string, userId: string, options?: GetNeighborsOptions) {
  // Verify node ownership
  await assertNodeOwner(nodeId, userId);

  const maxDepth = Math.min(options?.depth ?? 1, 5);
  const direction = options?.direction ?? 'both';

  // Use a recursive CTE to traverse the graph
  const directionFilter =
    direction === 'out'
      ? 'e.source_node_id = t.node_id'
      : direction === 'in'
        ? 'e.target_node_id = t.node_id'
        : '(e.source_node_id = t.node_id OR e.target_node_id = t.node_id)';

  const neighborSelect =
    direction === 'out'
      ? 'e.target_node_id'
      : direction === 'in'
        ? 'e.source_node_id'
        : 'CASE WHEN e.source_node_id = t.node_id THEN e.target_node_id ELSE e.source_node_id END';

  const rows = await sql.unsafe(
    `WITH RECURSIVE traversal AS (
      SELECT $1::uuid AS node_id, 0 AS depth
      UNION ALL
      SELECT ${neighborSelect} AS node_id, t.depth + 1
      FROM traversal t
      JOIN knowledge_edges e ON ${directionFilter}
      WHERE t.depth < $2
    )
    SELECT DISTINCT n.${NODE_COLS.split(',')
      .map((c) => c.trim())
      .join(', n.')},
           e.${EDGE_COLS.split(',')
             .map((c) => c.trim())
             .join(', e.')},
           t.depth
    FROM traversal t
    JOIN knowledge_nodes n ON n.id = t.node_id
    LEFT JOIN knowledge_edges e ON (
      (e.source_node_id = t.node_id OR e.target_node_id = t.node_id)
      AND e.user_id = $3
    )
    WHERE t.node_id != $1 AND n.user_id = $3
    ORDER BY t.depth, n.created_at DESC`,
    [nodeId, maxDepth, userId],
  );

  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      node: formatNode(r),
      edge: r.source_node_id ? formatEdge(r) : null,
      depth: r.depth as number,
    };
  });
}

export async function findPaths(
  sourceNodeId: string,
  targetNodeId: string,
  userId: string,
  maxDepth?: number,
) {
  // Verify both nodes belong to user
  await assertNodeOwner(sourceNodeId, userId);
  await assertNodeOwner(targetNodeId, userId);

  const depth = Math.min(maxDepth ?? 3, 10);

  // Use recursive CTE to find paths between two nodes
  const rows = await sql.unsafe(
    `WITH RECURSIVE path_search AS (
      SELECT
        ARRAY[$1::uuid] AS path,
        ARRAY[]::uuid[] AS edge_ids,
        $1::uuid AS current_node,
        0 AS depth,
        0::real AS total_weight
      UNION ALL
      SELECT
        ps.path || CASE WHEN e.source_node_id = ps.current_node THEN e.target_node_id ELSE e.source_node_id END,
        ps.edge_ids || e.id,
        CASE WHEN e.source_node_id = ps.current_node THEN e.target_node_id ELSE e.source_node_id END,
        ps.depth + 1,
        ps.total_weight + e.weight
      FROM path_search ps
      JOIN knowledge_edges e ON (e.source_node_id = ps.current_node OR e.target_node_id = ps.current_node)
        AND e.user_id = $3
      WHERE ps.depth < $4
        AND NOT (
          CASE WHEN e.source_node_id = ps.current_node THEN e.target_node_id ELSE e.source_node_id END
        ) = ANY(ps.path)
    )
    SELECT path, edge_ids, total_weight
    FROM path_search
    WHERE current_node = $2
    ORDER BY total_weight ASC, depth ASC
    LIMIT 10`,
    [sourceNodeId, targetNodeId, userId, depth],
  );

  // For each found path, fetch the full node and edge data
  const paths = [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const nodePath = r.path as string[];
    const edgeIds = r.edge_ids as string[];
    const totalWeight = r.total_weight as number;

    const nodeRows =
      nodePath.length > 0
        ? await sql.unsafe(
            `SELECT ${NODE_COLS} FROM knowledge_nodes WHERE id = ANY($1) AND user_id = $2`,
            [nodePath, userId],
          )
        : [];

    const edgeRows =
      edgeIds.length > 0
        ? await sql.unsafe(
            `SELECT ${EDGE_COLS} FROM knowledge_edges WHERE id = ANY($1) AND user_id = $2`,
            [edgeIds, userId],
          )
        : [];

    // Re-order nodes to match path order
    const nodeMap = new Map(nodeRows.map((n) => [(n as Record<string, unknown>).id as string, n]));
    const orderedNodes = nodePath
      .map((id) => nodeMap.get(id))
      .filter(Boolean)
      .map((n) => formatNode(n as Record<string, unknown>));

    // Re-order edges to match edge_ids order
    const edgeMap = new Map(edgeRows.map((e) => [(e as Record<string, unknown>).id as string, e]));
    const orderedEdges = edgeIds
      .map((id) => edgeMap.get(id))
      .filter(Boolean)
      .map((e) => formatEdge(e as Record<string, unknown>));

    paths.push({
      nodes: orderedNodes,
      edges: orderedEdges,
      total_weight: totalWeight,
    });
  }

  return paths;
}
