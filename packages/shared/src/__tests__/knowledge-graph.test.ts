import { describe, expect, it } from 'vitest';
import type {
  CreateKnowledgeEdgeInput,
  CreateKnowledgeNodeInput,
  KnowledgeEdge,
  KnowledgeNode,
  NeighborResult,
  PathResult,
  UpdateKnowledgeNodeInput,
} from '../types/knowledge-graph.js';

/* ================================================================
 * KnowledgeNode interface shape
 * ================================================================ */
describe('KnowledgeNode interface', () => {
  it('satisfies the interface with all required fields', () => {
    const node: KnowledgeNode = {
      id: 'node-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      label: 'Person',
      name: 'Alice',
      description: 'A developer',
      properties: { role: 'lead' },
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-03-10T12:00:00Z',
    };

    expect(node.id).toBe('node-1');
    expect(node.label).toBe('Person');
    expect(node.name).toBe('Alice');
    expect(node.properties).toEqual({ role: 'lead' });
  });

  it('allows null for nullable fields', () => {
    const node: KnowledgeNode = {
      id: 'node-2',
      agent_id: 'agent-2',
      user_id: 'user-2',
      label: 'Concept',
      name: 'TypeScript',
      description: null,
      properties: {},
      created_at: null,
      updated_at: null,
    };

    expect(node.description).toBeNull();
    expect(node.created_at).toBeNull();
    expect(node.updated_at).toBeNull();
  });

  it('allows empty properties object', () => {
    const node: KnowledgeNode = {
      id: 'node-3',
      agent_id: 'agent-3',
      user_id: 'user-3',
      label: 'Location',
      name: 'Berlin',
      description: null,
      properties: {},
      created_at: null,
      updated_at: null,
    };

    expect(node.properties).toEqual({});
  });
});

/* ================================================================
 * KnowledgeEdge interface shape
 * ================================================================ */
describe('KnowledgeEdge interface', () => {
  it('satisfies the interface with all required fields', () => {
    const edge: KnowledgeEdge = {
      id: 'edge-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      relationship: 'knows',
      weight: 5.0,
      properties: { since: '2025' },
      created_at: '2026-01-01T00:00:00Z',
    };

    expect(edge.id).toBe('edge-1');
    expect(edge.relationship).toBe('knows');
    expect(edge.weight).toBe(5.0);
    expect(edge.properties).toEqual({ since: '2025' });
  });

  it('allows null created_at', () => {
    const edge: KnowledgeEdge = {
      id: 'edge-2',
      agent_id: 'agent-2',
      user_id: 'user-2',
      source_node_id: 'node-3',
      target_node_id: 'node-4',
      relationship: 'works_with',
      weight: 1.0,
      properties: {},
      created_at: null,
    };

    expect(edge.created_at).toBeNull();
  });
});

/* ================================================================
 * CreateKnowledgeNodeInput interface
 * ================================================================ */
describe('CreateKnowledgeNodeInput interface', () => {
  it('accepts minimal required fields', () => {
    const input: CreateKnowledgeNodeInput = {
      label: 'Person',
      name: 'Alice',
    };

    expect(input.label).toBe('Person');
    expect(input.name).toBe('Alice');
    expect(input.description).toBeUndefined();
    expect(input.properties).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const input: CreateKnowledgeNodeInput = {
      label: 'Organization',
      name: 'Acme Corp',
      description: 'A tech company',
      properties: { industry: 'tech' },
    };

    expect(input.description).toBe('A tech company');
    expect(input.properties).toEqual({ industry: 'tech' });
  });
});

/* ================================================================
 * UpdateKnowledgeNodeInput interface
 * ================================================================ */
describe('UpdateKnowledgeNodeInput interface', () => {
  it('accepts a fully empty update (all optional)', () => {
    const input: UpdateKnowledgeNodeInput = {};
    expect(Object.keys(input)).toHaveLength(0);
  });

  it('accepts partial updates', () => {
    const input: UpdateKnowledgeNodeInput = {
      name: 'Bob',
    };

    expect(input.name).toBe('Bob');
    expect(input.label).toBeUndefined();
  });

  it('accepts null for nullable fields (clearing values)', () => {
    const input: UpdateKnowledgeNodeInput = {
      description: null,
    };

    expect(input.description).toBeNull();
  });
});

/* ================================================================
 * CreateKnowledgeEdgeInput interface
 * ================================================================ */
describe('CreateKnowledgeEdgeInput interface', () => {
  it('accepts minimal required fields', () => {
    const input: CreateKnowledgeEdgeInput = {
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      relationship: 'knows',
    };

    expect(input.source_node_id).toBe('node-1');
    expect(input.target_node_id).toBe('node-2');
    expect(input.relationship).toBe('knows');
    expect(input.weight).toBeUndefined();
    expect(input.properties).toBeUndefined();
  });

  it('accepts all optional fields', () => {
    const input: CreateKnowledgeEdgeInput = {
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      relationship: 'works_with',
      weight: 7.5,
      properties: { department: 'engineering' },
    };

    expect(input.weight).toBe(7.5);
    expect(input.properties).toEqual({ department: 'engineering' });
  });
});

/* ================================================================
 * NeighborResult interface
 * ================================================================ */
describe('NeighborResult interface', () => {
  it('satisfies the interface', () => {
    const result: NeighborResult = {
      node: {
        id: 'node-2',
        agent_id: 'agent-1',
        user_id: 'user-1',
        label: 'Person',
        name: 'Bob',
        description: null,
        properties: {},
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      edge: {
        id: 'edge-1',
        agent_id: 'agent-1',
        user_id: 'user-1',
        source_node_id: 'node-1',
        target_node_id: 'node-2',
        relationship: 'knows',
        weight: 1.0,
        properties: {},
        created_at: '2026-01-01T00:00:00Z',
      },
      depth: 1,
    };

    expect(result.depth).toBe(1);
    expect(result.node.name).toBe('Bob');
    expect(result.edge.relationship).toBe('knows');
  });
});

/* ================================================================
 * PathResult interface
 * ================================================================ */
describe('PathResult interface', () => {
  it('satisfies the interface', () => {
    const result: PathResult = {
      nodes: [
        {
          id: 'node-1',
          agent_id: 'agent-1',
          user_id: 'user-1',
          label: 'Person',
          name: 'Alice',
          description: null,
          properties: {},
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'node-2',
          agent_id: 'agent-1',
          user_id: 'user-1',
          label: 'Person',
          name: 'Bob',
          description: null,
          properties: {},
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      edges: [
        {
          id: 'edge-1',
          agent_id: 'agent-1',
          user_id: 'user-1',
          source_node_id: 'node-1',
          target_node_id: 'node-2',
          relationship: 'knows',
          weight: 1.0,
          properties: {},
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      total_weight: 1.0,
    };

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.total_weight).toBe(1.0);
  });

  it('allows empty path arrays', () => {
    const result: PathResult = {
      nodes: [],
      edges: [],
      total_weight: 0,
    };

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.total_weight).toBe(0);
  });
});
