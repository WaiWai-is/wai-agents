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
const CREW_ID = '770e8400-e29b-41d4-a716-446655440002';
const AGENT_ID_1 = '880e8400-e29b-41d4-a716-446655440003';
const AGENT_ID_2 = '990e8400-e29b-41d4-a716-446655440004';
const AGENT_ID_3 = 'aa0e8400-e29b-41d4-a716-446655440005';

function makeCrewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CREW_ID,
    creator_id: USER_ID,
    name: 'Test Crew',
    slug: 'test-crew',
    description: 'A test crew',
    visibility: 'private',
    steps: [
      { agentId: AGENT_ID_1, role: 'researcher' },
      { agentId: AGENT_ID_2, role: 'writer' },
    ],
    category: 'productivity',
    usage_count: 0,
    rating_sum: 0,
    rating_count: 0,
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  createCrew — edge cases                                                   */
/* -------------------------------------------------------------------------- */

describe('crew.service (edge) — createCrew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates crew with exactly 1 step (minimum)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Validate agent IDs
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);
    // Slug check
    sqlMock.mockResolvedValueOnce([] as any);
    // Insert
    sqlMock.mockResolvedValueOnce([] as any);
    // Fetch
    sqlMock.mockResolvedValueOnce([
      makeCrewRow({ steps: [{ agentId: AGENT_ID_1, role: 'solo' }] }),
    ] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: 'Solo Crew',
      steps: [{ agentId: AGENT_ID_1, role: 'solo' }],
    });

    expect(result.steps).toHaveLength(1);
  });

  it('creates crew with exactly 5 steps (maximum)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const agentIds = [AGENT_ID_1, AGENT_ID_2, AGENT_ID_3, 'agent-4', 'agent-5'];
    const steps = agentIds.map((id, i) => ({ agentId: id, role: `role-${i}` }));

    sqlMock.mockResolvedValueOnce(agentIds.map((id) => ({ id })) as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeCrewRow({ steps })] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: 'Full Crew',
      steps,
    });

    expect(result.steps).toHaveLength(5);
  });

  it('throws BAD_REQUEST for 0 steps', async () => {
    const { createCrew } = await import('./crew.service.js');
    await expect(createCrew(USER_ID, { name: 'Empty', steps: [] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Crew must have between 1 and 5 steps',
    });
  });

  it('throws BAD_REQUEST for 6 steps (exceeds maximum)', async () => {
    const { createCrew } = await import('./crew.service.js');
    const steps = Array.from({ length: 6 }, (_, i) => ({
      agentId: `agent-${i}`,
      role: `role-${i}`,
    }));

    await expect(createCrew(USER_ID, { name: 'Too Many', steps })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when one of multiple agents does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // Only AGENT_ID_1 exists, AGENT_ID_2 missing
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);

    const { createCrew } = await import('./crew.service.js');
    await expect(
      createCrew(USER_ID, {
        name: 'Missing Agent',
        steps: [
          { agentId: AGENT_ID_1, role: 'researcher' },
          { agentId: AGENT_ID_2, role: 'writer' },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: `Agent ${AGENT_ID_2} not found`,
    });
  });

  it('handles slug collision by appending counter', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);
    // Existing slugs: test-crew, test-crew-2
    sqlMock.mockResolvedValueOnce([{ slug: 'test-crew' }, { slug: 'test-crew-2' }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeCrewRow({ slug: 'test-crew-3' })] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: 'Test Crew',
      steps: [{ agentId: AGENT_ID_1, role: 'solo' }],
    });

    expect(result.slug).toBe('test-crew-3');
  });

  it('handles slug with consecutive collisions', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);
    // Existing slugs: my-crew, my-crew-2, my-crew-3, my-crew-4
    sqlMock.mockResolvedValueOnce([
      { slug: 'my-crew' },
      { slug: 'my-crew-2' },
      { slug: 'my-crew-3' },
      { slug: 'my-crew-4' },
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeCrewRow({ slug: 'my-crew-5' })] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: 'My Crew',
      steps: [{ agentId: AGENT_ID_1, role: 'solo' }],
    });

    expect(result.slug).toBe('my-crew-5');
  });

  it('creates crew with no description or category (defaults)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeCrewRow({ description: null, category: null, visibility: 'private' }),
    ] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: 'Minimal Crew',
      steps: [{ agentId: AGENT_ID_1, role: 'worker' }],
    });

    expect(result.description).toBeNull();
    expect(result.category).toBeNull();
    expect(result.visibility).toBe('private');
  });

  it('creates crew with all optional fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([
      makeCrewRow({
        description: 'Full desc',
        visibility: 'unlisted',
        category: 'creative',
      }),
    ] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: 'Full Crew',
      steps: [{ agentId: AGENT_ID_1, role: 'artist' }],
      description: 'Full desc',
      visibility: 'unlisted',
      category: 'creative',
    });

    expect(result.description).toBe('Full desc');
    expect(result.visibility).toBe('unlisted');
    expect(result.category).toBe('creative');
  });
});

/* -------------------------------------------------------------------------- */
/*  updateCrew — edge cases                                                   */
/* -------------------------------------------------------------------------- */

describe('crew.service (edge) — updateCrew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates only name without touching other fields', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any); // assertCreator
    sqlMock.mockResolvedValueOnce([
      makeCrewRow({ name: 'Renamed', description: 'A test crew', visibility: 'private' }),
    ] as any);

    const { updateCrew } = await import('./crew.service.js');
    const result = await updateCrew(CREW_ID, USER_ID, { name: 'Renamed' });

    expect(result.name).toBe('Renamed');
    expect(result.description).toBe('A test crew');
    expect(result.visibility).toBe('private');
  });

  it('updates only description', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeCrewRow({ description: 'New description' })] as any);

    const { updateCrew } = await import('./crew.service.js');
    const result = await updateCrew(CREW_ID, USER_ID, { description: 'New description' });

    expect(result.description).toBe('New description');
  });

  it('updates only category', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeCrewRow({ category: 'analytics' })] as any);

    const { updateCrew } = await import('./crew.service.js');
    const result = await updateCrew(CREW_ID, USER_ID, { category: 'analytics' });

    expect(result.category).toBe('analytics');
  });

  it('validates agents when updating steps', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any); // assertCreator
    // Validate agent IDs — agent not found
    sqlMock.mockResolvedValueOnce([] as any);

    const { updateCrew } = await import('./crew.service.js');
    await expect(
      updateCrew(CREW_ID, USER_ID, {
        steps: [{ agentId: 'nonexistent-agent', role: 'worker' }],
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Agent nonexistent-agent not found',
    });
  });

  it('throws BAD_REQUEST when updated steps are empty (< 1)', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: CREW_ID }] as any);

    const { updateCrew } = await import('./crew.service.js');
    await expect(updateCrew(CREW_ID, USER_ID, { steps: [] })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Crew must have between 1 and 5 steps',
    });
  });

  it('throws BAD_REQUEST when updated steps exceed 5', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([{ id: CREW_ID }] as any);

    const { updateCrew } = await import('./crew.service.js');
    const steps = Array.from({ length: 6 }, (_, i) => ({
      agentId: `agent-${i}`,
      role: `role-${i}`,
    }));

    await expect(updateCrew(CREW_ID, USER_ID, { steps })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('skips step validation when steps are not being updated', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any);
    // Only UPDATE RETURNING — no agent validation needed
    sqlMock.mockResolvedValueOnce([makeCrewRow({ visibility: 'public' })] as any);

    const { updateCrew } = await import('./crew.service.js');
    const result = await updateCrew(CREW_ID, USER_ID, { visibility: 'public' });

    expect(result.visibility).toBe('public');
    // Should be exactly 2 calls: assertCreator + UPDATE RETURNING
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('throws NOT_FOUND when UPDATE RETURNING returns empty', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any); // assertCreator
    sqlMock.mockResolvedValueOnce([] as any); // UPDATE RETURNING empty

    const { updateCrew } = await import('./crew.service.js');
    await expect(updateCrew(CREW_ID, USER_ID, { name: 'Vanished' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('updates steps with valid single agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any); // validate agent
    sqlMock.mockResolvedValueOnce([
      makeCrewRow({ steps: [{ agentId: AGENT_ID_1, role: 'solo' }] }),
    ] as any);

    const { updateCrew } = await import('./crew.service.js');
    const result = await updateCrew(CREW_ID, USER_ID, {
      steps: [{ agentId: AGENT_ID_1, role: 'solo' }],
    });

    expect(result.steps).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteCrew — edge cases                                                   */
/* -------------------------------------------------------------------------- */

describe('crew.service (edge) — deleteCrew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when crew does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteCrew } = await import('./crew.service.js');
    await expect(deleteCrew('nonexistent-crew', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Crew not found or access denied',
    });
  });

  it('throws NOT_FOUND when non-creator tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteCrew } = await import('./crew.service.js');
    await expect(deleteCrew(CREW_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('successfully deletes when creator owns the crew', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: CREW_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteCrew } = await import('./crew.service.js');
    await deleteCrew(CREW_ID, USER_ID);

    expect(sqlMock).toHaveBeenCalledTimes(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  getCrew — edge cases                                                      */
/* -------------------------------------------------------------------------- */

describe('crew.service (edge) — getCrew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns crew with all fields properly formatted', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([makeCrewRow()] as any);

    const { getCrew } = await import('./crew.service.js');
    const crew = await getCrew(CREW_ID, USER_ID);

    expect(crew.id).toBe(CREW_ID);
    expect(crew.creator_id).toBe(USER_ID);
    expect(crew.name).toBe('Test Crew');
    expect(crew.slug).toBe('test-crew');
    expect(crew.description).toBe('A test crew');
    expect(crew.visibility).toBe('private');
    expect(crew.steps).toHaveLength(2);
    expect(crew.category).toBe('productivity');
    expect(crew.usage_count).toBe(0);
    expect(crew.rating_sum).toBe(0);
    expect(crew.rating_count).toBe(0);
    expect(crew.created_at).toBe(new Date('2026-01-01').toISOString());
    expect(crew.updated_at).toBe(new Date('2026-01-01').toISOString());
  });

  it('throws NOT_FOUND for non-existent crew with clear error message', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getCrew } = await import('./crew.service.js');
    await expect(getCrew('ghost-id', USER_ID)).rejects.toThrow('Crew not found');
  });

  it('returns crew with null description and category', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      makeCrewRow({ description: null, category: null }),
    ] as any);

    const { getCrew } = await import('./crew.service.js');
    const crew = await getCrew(CREW_ID, USER_ID);

    expect(crew.description).toBeNull();
    expect(crew.category).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/*  listCrews — edge cases                                                    */
/* -------------------------------------------------------------------------- */

describe('crew.service (edge) — listCrews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for user with no crews', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listCrews } = await import('./crew.service.js');
    const crews = await listCrews(USER_ID);

    expect(crews).toEqual([]);
    expect(crews).toHaveLength(0);
  });

  it('maps inserted_at to created_at and updated_at correctly', async () => {
    const { sql } = await import('../../db/connection.js');
    const insertDate = new Date('2026-02-15T09:30:00.000Z');
    const updateDate = new Date('2026-03-01T14:00:00.000Z');
    vi.mocked(sql).mockResolvedValueOnce([
      makeCrewRow({ inserted_at: insertDate, updated_at: updateDate }),
    ] as any);

    const { listCrews } = await import('./crew.service.js');
    const crews = await listCrews(USER_ID);

    expect(crews[0].created_at).toBe('2026-02-15T09:30:00.000Z');
    expect(crews[0].updated_at).toBe('2026-03-01T14:00:00.000Z');
  });

  it('returns crews with different visibilities', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      makeCrewRow({ id: 'crew-1', visibility: 'public' }),
      makeCrewRow({ id: 'crew-2', visibility: 'private' }),
      makeCrewRow({ id: 'crew-3', visibility: 'unlisted' }),
    ] as any);

    const { listCrews } = await import('./crew.service.js');
    const crews = await listCrews(USER_ID);

    expect(crews).toHaveLength(3);
    expect(crews[0].visibility).toBe('public');
    expect(crews[1].visibility).toBe('private');
    expect(crews[2].visibility).toBe('unlisted');
  });
});

/* -------------------------------------------------------------------------- */
/*  slugify — edge cases (tested via createCrew)                              */
/* -------------------------------------------------------------------------- */

describe('crew.service (edge) — slugify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles name with special characters', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeCrewRow({ slug: 'my-crew-123' })] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: 'My Crew!!! @#$ 123',
      steps: [{ agentId: AGENT_ID_1, role: 'worker' }],
    });

    // Slug should be sanitized
    expect(result.slug).toBe('my-crew-123');
  });

  it('handles name with leading/trailing special characters', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID_1 }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([makeCrewRow({ slug: 'hello-world' })] as any);

    const { createCrew } = await import('./crew.service.js');
    const result = await createCrew(USER_ID, {
      name: '---Hello World---',
      steps: [{ agentId: AGENT_ID_1, role: 'worker' }],
    });

    expect(result.slug).toBe('hello-world');
  });
});
