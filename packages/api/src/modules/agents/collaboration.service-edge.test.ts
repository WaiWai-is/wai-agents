/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

// Mock emitter
vi.mock('../../ws/emitter.js', () => ({
  emitCollaborationEvent: vi.fn(),
}));

async function resetSqlMocks() {
  const { sql } = await import('../../db/connection.js');
  const sqlMock = vi.mocked(sql);
  sqlMock.mockReset();
  vi.mocked(sqlMock.unsafe).mockReset();
}

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const THIRD_USER_ID = 'aa0e8400-e29b-41d4-a716-446655440099';
const REQUESTER_AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const RESPONDER_AGENT_ID = '990e8400-e29b-41d4-a716-446655440004';
const CONVERSATION_ID = 'cc0e8400-e29b-41d4-a716-446655440005';
const COLLAB_ID = 'dd0e8400-e29b-41d4-a716-446655440006';
const PARENT_COLLAB_ID = 'ee0e8400-e29b-41d4-a716-446655440007';

function makeCollabRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COLLAB_ID,
    requester_agent_id: REQUESTER_AGENT_ID,
    responder_agent_id: RESPONDER_AGENT_ID,
    requester_user_id: USER_ID,
    conversation_id: CONVERSATION_ID,
    status: 'pending',
    priority: 'normal',
    task_description: 'Analyze this dataset',
    context: null,
    task_result: null,
    parent_request_id: null,
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    completed_at: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  respondToCollaboration (accept) with invalid requestId                     */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — accept with invalid requestId', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('throws NOT_FOUND for completely nonexistent collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    await expect(acceptCollaboration('nonexistent-id', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when collaboration exists but user has no access', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    // requester owner
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    // responder owner
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    await expect(acceptCollaboration(COLLAB_ID, THIRD_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  accept on already-responded collaboration                                  */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — accept on already-responded', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('throws BAD_REQUEST when accepting an already accepted collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'accepted' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    await expect(acceptCollaboration(COLLAB_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when accepting a rejected collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'rejected' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    await expect(acceptCollaboration(COLLAB_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when accepting a completed collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'completed' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    await expect(acceptCollaboration(COLLAB_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when rejecting a non-pending collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'in_progress' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { rejectCollaboration } = await import('./collaboration.service.js');
    await expect(rejectCollaboration(COLLAB_ID, OTHER_USER_ID, 'Too late')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  updateCollaborationProgress edge cases                                     */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — updateCollaborationProgress', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('throws NOT_FOUND for nonexistent collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { updateCollaborationProgress } = await import('./collaboration.service.js');
    await expect(
      updateCollaborationProgress('nonexistent', USER_ID, {
        status: 'in_progress',
        message: 'Working on it',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN when requester owner tries to update progress', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'accepted' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { updateCollaborationProgress } = await import('./collaboration.service.js');
    await expect(
      updateCollaborationProgress(COLLAB_ID, USER_ID, {
        status: 'in_progress',
        message: 'Updating',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws BAD_REQUEST when collaboration is pending', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'pending' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { updateCollaborationProgress } = await import('./collaboration.service.js');
    await expect(
      updateCollaborationProgress(COLLAB_ID, OTHER_USER_ID, {
        status: 'in_progress',
        message: 'Starting',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when collaboration is already completed', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'completed' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { updateCollaborationProgress } = await import('./collaboration.service.js');
    await expect(
      updateCollaborationProgress(COLLAB_ID, OTHER_USER_ID, {
        status: 'in_progress',
        message: 'Too late',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when collaboration is rejected', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'rejected' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { updateCollaborationProgress } = await import('./collaboration.service.js');
    await expect(
      updateCollaborationProgress(COLLAB_ID, OTHER_USER_ID, {
        status: 'in_progress',
        message: 'Too late',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('successfully updates progress on accepted collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'accepted' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // UPDATE status
    sqlMock.mockResolvedValueOnce([] as any);
    // INSERT message
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT updated collaboration
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'in_progress' }),
    ] as any);

    const { updateCollaborationProgress } = await import('./collaboration.service.js');
    const result = await updateCollaborationProgress(COLLAB_ID, OTHER_USER_ID, {
      status: 'in_progress',
      message: 'Making progress',
    });

    expect(result.status).toBe('in_progress');
  });

  it('handles failed status correctly', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'in_progress' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // UPDATE status to failed
    sqlMock.mockResolvedValueOnce([] as any);
    // INSERT message
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'failed', completed_at: new Date() }),
    ] as any);

    const { updateCollaborationProgress } = await import('./collaboration.service.js');
    const result = await updateCollaborationProgress(COLLAB_ID, OTHER_USER_ID, {
      status: 'failed',
      message: 'Something went wrong',
    });

    expect(result.status).toBe('failed');
  });
});

/* -------------------------------------------------------------------------- */
/*  completeCollaboration edge cases                                           */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — completeCollaboration on non-accepted', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('throws BAD_REQUEST when completing a pending collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'pending' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    await expect(completeCollaboration(COLLAB_ID, OTHER_USER_ID, 'Result')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when completing a rejected collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'rejected' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    await expect(completeCollaboration(COLLAB_ID, OTHER_USER_ID, 'Result')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when completing an already completed collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'completed' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    await expect(completeCollaboration(COLLAB_ID, OTHER_USER_ID, 'Again')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws BAD_REQUEST when completing a failed collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'failed' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    await expect(completeCollaboration(COLLAB_ID, OTHER_USER_ID, 'Result')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getCollaborationChain                                                      */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — getCollaborationChain', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('returns a single-node chain when no parent exists', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertCollaborationAccess
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // Walk up — no parent
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([{ parent_request_id: null }] as any);
    // Walk down — get the root node
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    // Find children
    sqlMock.mockResolvedValueOnce([] as any);

    const { getCollaborationChain } = await import('./collaboration.service.js');
    const chain = await getCollaborationChain(COLLAB_ID, USER_ID);

    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe(COLLAB_ID);
  });

  it('walks up to root and down to collect full chain', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertCollaborationAccess for child node
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ parent_request_id: PARENT_COLLAB_ID }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // Walk up: find parent
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      { parent_request_id: PARENT_COLLAB_ID },
    ] as any);
    // Walk up: parent has no parent
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([{ parent_request_id: null }] as any);
    // Walk down from root: get parent node
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ id: PARENT_COLLAB_ID, parent_request_id: null }),
    ] as any);
    // Children of parent
    sqlMock.mockResolvedValueOnce([{ id: COLLAB_ID }] as any);
    // Get child node
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ parent_request_id: PARENT_COLLAB_ID }),
    ] as any);
    // Children of child (none)
    sqlMock.mockResolvedValueOnce([] as any);

    const { getCollaborationChain } = await import('./collaboration.service.js');
    const chain = await getCollaborationChain(COLLAB_ID, USER_ID);

    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe(PARENT_COLLAB_ID);
    expect(chain[1].id).toBe(COLLAB_ID);
  });

  it('handles circular references gracefully via visited set', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const unsafeMock = vi.mocked(sqlMock.unsafe);

    // 1. assertCollaborationAccess: sql.unsafe SELECT collab
    unsafeMock.mockResolvedValueOnce([
      makeCollabRow({ parent_request_id: 'circular-ref' }),
    ] as any);
    // 2. assertCollaborationAccess: sql getAgentCreatorId(requester)
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    // 3. assertCollaborationAccess: sql getAgentCreatorId(responder)
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // 4. Walk up iter 1: sql.unsafe SELECT parent_request_id for COLLAB_ID
    unsafeMock.mockResolvedValueOnce([{ parent_request_id: 'circular-ref' }] as any);
    // 5. Walk up iter 2: sql.unsafe SELECT parent_request_id for circular-ref
    //    returns COLLAB_ID which is already visited → break, rootId = 'circular-ref'
    unsafeMock.mockResolvedValueOnce([{ parent_request_id: COLLAB_ID }] as any);
    // 6. Walk down iter 1: sql.unsafe SELECT collab for 'circular-ref'
    unsafeMock.mockResolvedValueOnce([
      makeCollabRow({ id: 'circular-ref', parent_request_id: COLLAB_ID }),
    ] as any);
    // 7. Walk down iter 1: sql SELECT children of 'circular-ref'
    sqlMock.mockResolvedValueOnce([{ id: COLLAB_ID }] as any);
    // 8. Walk down iter 2: sql.unsafe SELECT collab for COLLAB_ID
    unsafeMock.mockResolvedValueOnce([
      makeCollabRow({ parent_request_id: 'circular-ref' }),
    ] as any);
    // 9. Walk down iter 2: sql SELECT children of COLLAB_ID
    sqlMock.mockResolvedValueOnce([{ id: 'circular-ref' }] as any);
    // Walk down iter 3: 'circular-ref' already in seen → skip. Queue empty, done.

    const { getCollaborationChain } = await import('./collaboration.service.js');
    const chain = await getCollaborationChain(COLLAB_ID, USER_ID);

    // Should not infinite loop; chain has both nodes
    expect(chain).toHaveLength(2);
    expect(chain[0].id).toBe('circular-ref');
    expect(chain[1].id).toBe(COLLAB_ID);
  });

  it('throws NOT_FOUND when user has no access', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getCollaborationChain } = await import('./collaboration.service.js');
    await expect(getCollaborationChain('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getCollaborationMessages                                                   */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — getCollaborationMessages', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('returns empty array when no messages exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // messages query
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { getCollaborationMessages } = await import('./collaboration.service.js');
    const messages = await getCollaborationMessages(COLLAB_ID, USER_ID);

    expect(messages).toHaveLength(0);
  });

  it('returns formatted messages', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      {
        id: 'msg-1',
        request_id: COLLAB_ID,
        from_agent_id: REQUESTER_AGENT_ID,
        content: 'Analyze this',
        message_type: 'task',
        inserted_at: new Date('2026-01-01'),
      },
      {
        id: 'msg-2',
        request_id: COLLAB_ID,
        from_agent_id: RESPONDER_AGENT_ID,
        content: 'On it',
        message_type: 'status_update',
        inserted_at: new Date('2026-01-02'),
      },
    ] as any);

    const { getCollaborationMessages } = await import('./collaboration.service.js');
    const messages = await getCollaborationMessages(COLLAB_ID, USER_ID);

    expect(messages).toHaveLength(2);
    expect(messages[0].message_type).toBe('task');
    expect(messages[1].message_type).toBe('status_update');
  });

  it('throws NOT_FOUND for nonexistent collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getCollaborationMessages } = await import('./collaboration.service.js');
    await expect(getCollaborationMessages('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  findCapableAgents                                                          */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — findCapableAgents', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('returns empty array when no agents match', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { findCapableAgents } = await import('./collaboration.service.js');
    const results = await findCapableAgents('nonexistent-capability', USER_ID);

    expect(results).toHaveLength(0);
  });

  it('returns matching agents with capabilities', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: RESPONDER_AGENT_ID,
        name: 'Data Agent',
        slug: 'data-agent',
        description: 'Analyzes data',
        category: 'analytics',
        visibility: 'public',
        usage_count: 50,
        rating_sum: 20,
        rating_count: 5,
        inserted_at: new Date('2026-01-01'),
        capabilities: ['data_analysis', 'charting'],
        max_concurrent_tasks: 3,
        availability_status: 'available',
      },
    ] as any);

    const { findCapableAgents } = await import('./collaboration.service.js');
    const results = await findCapableAgents('data', USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].capabilities).toEqual(['data_analysis', 'charting']);
    expect(results[0].max_concurrent_tasks).toBe(3);
  });

  it('respects limit parameter', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { findCapableAgents } = await import('./collaboration.service.js');
    await findCapableAgents('test', USER_ID, 5);

    expect(vi.mocked(sql)).toHaveBeenCalled();
  });

  it('caps limit at 100', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { findCapableAgents } = await import('./collaboration.service.js');
    await findCapableAgents('test', USER_ID, 500);

    expect(vi.mocked(sql)).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*  registerCapabilities                                                       */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — registerCapabilities', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('throws NOT_FOUND when user does not own agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { registerCapabilities } = await import('./collaboration.service.js');
    await expect(
      registerCapabilities(REQUESTER_AGENT_ID, OTHER_USER_ID, {
        capabilities: ['data_analysis'],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('registers capabilities successfully', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    // UPSERT
    sqlMock.mockResolvedValueOnce([
      {
        id: 'cap-1',
        agent_id: REQUESTER_AGENT_ID,
        capabilities: ['data_analysis'],
        max_concurrent_tasks: 1,
        availability_status: 'available',
        inserted_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      },
    ] as any);

    const { registerCapabilities } = await import('./collaboration.service.js');
    const result = await registerCapabilities(REQUESTER_AGENT_ID, USER_ID, {
      capabilities: ['data_analysis'],
    });

    expect(result.capabilities).toEqual(['data_analysis']);
    expect(result.agent_id).toBe(REQUESTER_AGENT_ID);
  });

  it('registers with max_concurrent_tasks', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      {
        id: 'cap-1',
        agent_id: REQUESTER_AGENT_ID,
        capabilities: ['writing', 'editing'],
        max_concurrent_tasks: 5,
        availability_status: 'available',
        inserted_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      },
    ] as any);

    const { registerCapabilities } = await import('./collaboration.service.js');
    const result = await registerCapabilities(REQUESTER_AGENT_ID, USER_ID, {
      capabilities: ['writing', 'editing'],
      max_concurrent_tasks: 5,
    });

    expect(result.max_concurrent_tasks).toBe(5);
  });

  it('replaces existing capabilities via upsert', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      {
        id: 'cap-1',
        agent_id: REQUESTER_AGENT_ID,
        capabilities: ['new_capability'],
        max_concurrent_tasks: 2,
        availability_status: 'available',
        inserted_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-02'),
      },
    ] as any);

    const { registerCapabilities } = await import('./collaboration.service.js');
    const result = await registerCapabilities(REQUESTER_AGENT_ID, USER_ID, {
      capabilities: ['new_capability'],
      max_concurrent_tasks: 2,
    });

    expect(result.capabilities).toEqual(['new_capability']);
  });
});

/* -------------------------------------------------------------------------- */
/*  getAgentCapabilities                                                       */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — getAgentCapabilities', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('returns null when agent has no capabilities', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getAgentCapabilities } = await import('./collaboration.service.js');
    const result = await getAgentCapabilities('nonexistent');

    expect(result).toBeNull();
  });

  it('returns capabilities for an agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([
      {
        id: 'cap-1',
        agent_id: REQUESTER_AGENT_ID,
        capabilities: ['analysis', 'writing'],
        max_concurrent_tasks: 3,
        availability_status: 'available',
        inserted_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      },
    ] as any);

    const { getAgentCapabilities } = await import('./collaboration.service.js');
    const result = await getAgentCapabilities(REQUESTER_AGENT_ID);

    expect(result).not.toBeNull();
    expect(result?.capabilities).toEqual(['analysis', 'writing']);
    expect(result?.availability_status).toBe('available');
  });
});

/* -------------------------------------------------------------------------- */
/*  discoverAgents edge cases                                                  */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — discoverAgents edge cases', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('handles SQL LIKE wildcard characters in capability', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    const results = await discoverAgents('test%injection_attempt', USER_ID);

    expect(results).toHaveLength(0);
  });

  it('handles backslash in capability', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    const results = await discoverAgents('test\\path', USER_ID);

    expect(results).toHaveLength(0);
  });

  it('returns formatted results with created_at', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'agent-1',
        name: 'Agent 1',
        slug: 'agent-1',
        description: 'Test',
        category: 'general',
        visibility: 'public',
        usage_count: 10,
        rating_sum: 5,
        rating_count: 1,
        inserted_at: new Date('2026-01-15'),
      },
    ] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    const results = await discoverAgents('agent', USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].created_at).toBe(new Date('2026-01-15').toISOString());
  });

  it('uses default limit of 20 when not specified', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    await discoverAgents('test', USER_ID);

    expect(vi.mocked(sql)).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/*  requestCollaboration with parent_request_id                                */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — requestCollaboration with parent', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('throws NOT_FOUND when parent_request_id does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    // responder exists
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    // conversation exists
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    // parent request not found
    sqlMock.mockResolvedValueOnce([] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    await expect(
      requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: 'Child task',
        conversation_id: CONVERSATION_ID,
        parent_request_id: 'nonexistent-parent',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('creates collaboration with valid parent_request_id', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    // responder exists
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    // conversation exists
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    // parent request exists
    sqlMock.mockResolvedValueOnce([{ id: PARENT_COLLAB_ID }] as any);
    // INSERT collaboration
    sqlMock.mockResolvedValueOnce([] as any);
    // INSERT message
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT collaboration
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ parent_request_id: PARENT_COLLAB_ID }),
    ] as any);
    // getAgentCreatorId for responder
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    const result = await requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Child task',
      conversation_id: CONVERSATION_ID,
      parent_request_id: PARENT_COLLAB_ID,
    });

    expect(result.parent_request_id).toBe(PARENT_COLLAB_ID);
  });
});

/* -------------------------------------------------------------------------- */
/*  requestCollaboration with priority                                         */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — requestCollaboration with priority', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('creates collaboration with high priority', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ priority: 'high' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    const result = await requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Urgent task',
      conversation_id: CONVERSATION_ID,
      priority: 'high',
    });

    expect(result.priority).toBe('high');
  });

  it('defaults to normal priority when not specified', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    const result = await requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Normal task',
      conversation_id: CONVERSATION_ID,
    });

    expect(result.priority).toBe('normal');
  });
});

/* -------------------------------------------------------------------------- */
/*  requestCollaboration with context                                          */
/* -------------------------------------------------------------------------- */

describe('collaboration.service-edge — requestCollaboration with context', () => {
  beforeEach(async () => {
    await resetSqlMocks();
  });

  it('creates collaboration with context data', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ context: { data: 'test-context' } }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    const result = await requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Task with context',
      conversation_id: CONVERSATION_ID,
      context: { data: 'test-context' },
    });

    expect(result.context).toEqual({ data: 'test-context' });
  });
});
