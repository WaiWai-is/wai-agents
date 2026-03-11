import { describe, expect, it } from 'vitest';
import {
  CreateEdgeSchema,
  CreateNodeSchema,
  NeighborQuerySchema,
  PathQuerySchema,
  UpdateNodeSchema,
} from './knowledge.schema.js';

/* ================================================================
 * CreateNodeSchema
 * ================================================================ */
describe('CreateNodeSchema', () => {
  it('accepts a minimal valid input', () => {
    const data = { label: 'Person', name: 'Alice' };
    const result = CreateNodeSchema.parse(data);
    expect(result.label).toBe('Person');
    expect(result.name).toBe('Alice');
  });

  it('accepts a fully specified input', () => {
    const data = {
      label: 'Organization',
      name: 'Acme Corp',
      description: 'A technology company',
      properties: { industry: 'tech', founded: 2020 },
    };
    const result = CreateNodeSchema.parse(data);
    expect(result.description).toBe('A technology company');
    expect(result.properties).toEqual({ industry: 'tech', founded: 2020 });
  });

  it('strips HTML tags from label', () => {
    const data = { label: '<b>Person</b>', name: 'Alice' };
    const result = CreateNodeSchema.parse(data);
    expect(result.label).toBe('Person');
  });

  it('strips HTML tags from name', () => {
    const data = { label: 'Person', name: '<script>alert("xss")</script>Alice' };
    const result = CreateNodeSchema.parse(data);
    expect(result.name).toBe('alert("xss")Alice');
  });

  it('strips HTML tags from description', () => {
    const data = {
      label: 'Person',
      name: 'Alice',
      description: '<div><b>Bold</b> and <a href="https://evil.com">link</a></div>',
    };
    const result = CreateNodeSchema.parse(data);
    expect(result.description).toBe('Bold and link');
  });

  it('rejects empty label', () => {
    const result = CreateNodeSchema.safeParse({ label: '', name: 'Alice' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = CreateNodeSchema.safeParse({ label: 'Person', name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing label', () => {
    const result = CreateNodeSchema.safeParse({ name: 'Alice' });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = CreateNodeSchema.safeParse({ label: 'Person' });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 200 characters', () => {
    const result = CreateNodeSchema.safeParse({
      label: 'Person',
      name: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('accepts name at exactly 200 characters', () => {
    const result = CreateNodeSchema.parse({
      label: 'Person',
      name: 'a'.repeat(200),
    });
    expect(result.name).toBe('a'.repeat(200));
  });

  it('rejects label exceeding 100 characters', () => {
    const result = CreateNodeSchema.safeParse({
      label: 'a'.repeat(101),
      name: 'Alice',
    });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 2000 characters', () => {
    const result = CreateNodeSchema.safeParse({
      label: 'Person',
      name: 'Alice',
      description: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts description at exactly 2000 characters', () => {
    const result = CreateNodeSchema.parse({
      label: 'Person',
      name: 'Alice',
      description: 'a'.repeat(2000),
    });
    expect(result.description).toBe('a'.repeat(2000));
  });

  it('accepts unicode content', () => {
    const data = { label: 'Персона', name: 'Алиса' };
    const result = CreateNodeSchema.parse(data);
    expect(result.name).toBe('Алиса');
  });

  it('accepts properties with nested objects', () => {
    const data = {
      label: 'Person',
      name: 'Alice',
      properties: { nested: { deep: { value: 42 } } },
    };
    const result = CreateNodeSchema.parse(data);
    expect(result.properties).toEqual({ nested: { deep: { value: 42 } } });
  });
});

/* ================================================================
 * UpdateNodeSchema
 * ================================================================ */
describe('UpdateNodeSchema', () => {
  it('accepts an empty update (all fields optional)', () => {
    expect(UpdateNodeSchema.parse({})).toEqual({});
  });

  it('accepts a partial update with only name', () => {
    const result = UpdateNodeSchema.parse({ name: 'Bob' });
    expect(result.name).toBe('Bob');
  });

  it('strips HTML from name in update', () => {
    const result = UpdateNodeSchema.parse({ name: '<b>Bob</b>' });
    expect(result.name).toBe('Bob');
  });

  it('accepts nullable description', () => {
    const result = UpdateNodeSchema.parse({ description: null });
    expect(result.description).toBeNull();
  });

  it('rejects name exceeding 200 characters', () => {
    const result = UpdateNodeSchema.safeParse({ name: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects empty name string (min 1)', () => {
    const result = UpdateNodeSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a full update with all fields', () => {
    const data = {
      label: 'Organization',
      name: 'New Name',
      description: 'New description',
      properties: { updated: true },
    };
    const result = UpdateNodeSchema.parse(data);
    expect(result.name).toBe('New Name');
    expect(result.label).toBe('Organization');
  });

  it('rejects invalid label in update (empty)', () => {
    const result = UpdateNodeSchema.safeParse({ label: '' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * CreateEdgeSchema
 * ================================================================ */
describe('CreateEdgeSchema', () => {
  const validEdge = {
    source_node_id: '550e8400-e29b-41d4-a716-446655440000',
    target_node_id: '660e8400-e29b-41d4-a716-446655440001',
    relationship: 'knows',
  };

  it('accepts a minimal valid edge', () => {
    const result = CreateEdgeSchema.parse(validEdge);
    expect(result.relationship).toBe('knows');
  });

  it('accepts edge with all optional fields', () => {
    const data = {
      ...validEdge,
      weight: 5.0,
      properties: { since: '2025' },
    };
    const result = CreateEdgeSchema.parse(data);
    expect(result.weight).toBe(5.0);
    expect(result.properties).toEqual({ since: '2025' });
  });

  it('rejects non-uuid source_node_id', () => {
    const result = CreateEdgeSchema.safeParse({
      ...validEdge,
      source_node_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid target_node_id', () => {
    const result = CreateEdgeSchema.safeParse({
      ...validEdge,
      target_node_id: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing relationship', () => {
    const result = CreateEdgeSchema.safeParse({
      source_node_id: validEdge.source_node_id,
      target_node_id: validEdge.target_node_id,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty relationship', () => {
    const result = CreateEdgeSchema.safeParse({
      ...validEdge,
      relationship: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects relationship exceeding 100 characters', () => {
    const result = CreateEdgeSchema.safeParse({
      ...validEdge,
      relationship: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('rejects weight below 0', () => {
    const result = CreateEdgeSchema.safeParse({
      ...validEdge,
      weight: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects weight above 10', () => {
    const result = CreateEdgeSchema.safeParse({
      ...validEdge,
      weight: 11,
    });
    expect(result.success).toBe(false);
  });

  it('accepts weight at boundaries 0 and 10', () => {
    expect(CreateEdgeSchema.parse({ ...validEdge, weight: 0 }).weight).toBe(0);
    expect(CreateEdgeSchema.parse({ ...validEdge, weight: 10 }).weight).toBe(10);
  });

  it('strips HTML from relationship', () => {
    const result = CreateEdgeSchema.parse({
      ...validEdge,
      relationship: '<b>knows</b>',
    });
    expect(result.relationship).toBe('knows');
  });
});

/* ================================================================
 * NeighborQuerySchema
 * ================================================================ */
describe('NeighborQuerySchema', () => {
  it('uses defaults when no params provided', () => {
    const result = NeighborQuerySchema.parse({});
    expect(result.depth).toBe(1);
    expect(result.direction).toBe('both');
  });

  it('accepts valid depth and direction', () => {
    const result = NeighborQuerySchema.parse({ depth: '3', direction: 'out' });
    expect(result.depth).toBe(3);
    expect(result.direction).toBe('out');
  });

  it('accepts in direction', () => {
    const result = NeighborQuerySchema.parse({ direction: 'in' });
    expect(result.direction).toBe('in');
  });

  it('rejects invalid direction', () => {
    const result = NeighborQuerySchema.safeParse({ direction: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects depth above 5', () => {
    const result = NeighborQuerySchema.safeParse({ depth: '6' });
    expect(result.success).toBe(false);
  });

  it('rejects depth below 1', () => {
    const result = NeighborQuerySchema.safeParse({ depth: '0' });
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * PathQuerySchema
 * ================================================================ */
describe('PathQuerySchema', () => {
  const validPath = {
    source: '550e8400-e29b-41d4-a716-446655440000',
    target: '660e8400-e29b-41d4-a716-446655440001',
  };

  it('accepts valid source and target', () => {
    const result = PathQuerySchema.parse(validPath);
    expect(result.source).toBe(validPath.source);
    expect(result.target).toBe(validPath.target);
    expect(result.max_depth).toBe(3);
  });

  it('accepts custom max_depth', () => {
    const result = PathQuerySchema.parse({ ...validPath, max_depth: '5' });
    expect(result.max_depth).toBe(5);
  });

  it('rejects non-uuid source', () => {
    const result = PathQuerySchema.safeParse({ ...validPath, source: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid target', () => {
    const result = PathQuerySchema.safeParse({ ...validPath, target: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects missing source', () => {
    const result = PathQuerySchema.safeParse({ target: validPath.target });
    expect(result.success).toBe(false);
  });

  it('rejects missing target', () => {
    const result = PathQuerySchema.safeParse({ source: validPath.source });
    expect(result.success).toBe(false);
  });

  it('rejects max_depth above 10', () => {
    const result = PathQuerySchema.safeParse({ ...validPath, max_depth: '11' });
    expect(result.success).toBe(false);
  });

  it('rejects max_depth below 1', () => {
    const result = PathQuerySchema.safeParse({ ...validPath, max_depth: '0' });
    expect(result.success).toBe(false);
  });
});
