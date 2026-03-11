/* ---- Knowledge Node ---- */

export interface KnowledgeNode {
  id: string;
  agent_id: string;
  user_id: string;
  label: string;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateKnowledgeNodeInput {
  label: string;
  name: string;
  description?: string;
  properties?: Record<string, unknown>;
}

export interface UpdateKnowledgeNodeInput {
  label?: string;
  name?: string;
  description?: string | null;
  properties?: Record<string, unknown>;
}

/* ---- Knowledge Edge ---- */

export interface KnowledgeEdge {
  id: string;
  agent_id: string;
  user_id: string;
  source_node_id: string;
  target_node_id: string;
  relationship: string;
  weight: number;
  properties: Record<string, unknown>;
  created_at: string | null;
}

export interface CreateKnowledgeEdgeInput {
  source_node_id: string;
  target_node_id: string;
  relationship: string;
  weight?: number;
  properties?: Record<string, unknown>;
}

/* ---- Graph Query Results ---- */

export interface NeighborResult {
  node: KnowledgeNode;
  edge: KnowledgeEdge;
  depth: number;
}

export interface PathResult {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  total_weight: number;
}
