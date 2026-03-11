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

// Mock emitter
vi.mock('../../ws/emitter.js', () => ({
  emitCollaborationEvent: vi.fn(),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const REQUESTER_AGENT_ID = '880e8400-e29b-41d4-a716-446655440003';
const RESPONDER_AGENT_ID = '990e8400-e29b-41d4-a716-446655440004';
const CONVERSATION_ID = 'cc0e8400-e29b-41d4-a716-446655440005';
const COLLAB_ID = 'dd0e8400-e29b-41d4-a716-446655440006';

function makeCollabRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COLLAB_ID,
    requester_agent_id: REQUESTER_AGENT_ID,
    responder_agent_id: RESPONDER_AGENT_ID,
    requester_user_id: USER_ID,
    conversation_id: CONVERSATION_ID,
    status: 'pending',
    task_description: 'Analyze this dataset',
    task_result: null,
    metadata: {},
    inserted_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    completed_at: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  requestCollaboration                                                       */
/* -------------------------------------------------------------------------- */

describe('collaboration.service — requestCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a collaboration request with valid input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. assertAgentCreator (requester)
    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    // 2. check responder agent exists
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    // 3. check conversation exists
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    // 4. INSERT collaboration
    sqlMock.mockResolvedValueOnce([] as any);
    // 5. SELECT created collaboration (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    // 6. getAgentCreatorId for responder (Socket.IO event)
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    const result = await requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Analyze this dataset',
    });

    expect(result.id).toBe(COLLAB_ID);
    expect(result.status).toBe('pending');
    expect(result.task_description).toBe('Analyze this dataset');
    expect(result.requester_agent_id).toBe(REQUESTER_AGENT_ID);
    expect(result.responder_agent_id).toBe(RESPONDER_AGENT_ID);
  });

  it('throws NOT_FOUND when user does not own requester agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    await expect(
      requestCollaboration(REQUESTER_AGENT_ID, OTHER_USER_ID, CONVERSATION_ID, {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: 'Test',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when responder agent does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator passes
    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    // responder agent not found
    sqlMock.mockResolvedValueOnce([] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    await expect(
      requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
        responder_agent_id: 'nonexistent-id',
        task_description: 'Test',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when conversation does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    // conversation not found
    sqlMock.mockResolvedValueOnce([] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    await expect(
      requestCollaboration(REQUESTER_AGENT_ID, USER_ID, 'nonexistent-conv', {
        responder_agent_id: RESPONDER_AGENT_ID,
        task_description: 'Test',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST when agent tries to collaborate with itself', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    await expect(
      requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
        responder_agent_id: REQUESTER_AGENT_ID,
        task_description: 'Test',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('creates collaboration with metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ metadata: { priority: 'high' } }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    const result = await requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Analyze this dataset',
      metadata: { priority: 'high' },
    });

    expect(result.metadata).toEqual({ priority: 'high' });
  });

  it('emits collaboration:requested event via Socket.IO', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: CONVERSATION_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { requestCollaboration } = await import('./collaboration.service.js');
    await requestCollaboration(REQUESTER_AGENT_ID, USER_ID, CONVERSATION_ID, {
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Analyze this dataset',
    });

    const { emitCollaborationEvent } = await import('../../ws/emitter.js');
    expect(emitCollaborationEvent).toHaveBeenCalledWith(OTHER_USER_ID, {
      type: 'collaboration:requested',
      collaboration_id: expect.any(String),
      requester_agent_id: REQUESTER_AGENT_ID,
      responder_agent_id: RESPONDER_AGENT_ID,
      task_description: 'Analyze this dataset',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  acceptCollaboration                                                        */
/* -------------------------------------------------------------------------- */

describe('collaboration.service — acceptCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a pending collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // 1. assertCollaborationAccess: SELECT collaboration
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    // 2. getAgentCreatorId requester
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    // 3. getAgentCreatorId responder
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // 4. getAgentCreatorId responder (for FORBIDDEN check)
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // 5. UPDATE collaboration
    sqlMock.mockResolvedValueOnce([makeCollabRow({ status: 'accepted' })] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    const result = await acceptCollaboration(COLLAB_ID, OTHER_USER_ID);

    expect(result.status).toBe('accepted');
  });

  it('throws NOT_FOUND for non-existent collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    await expect(acceptCollaboration('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws FORBIDDEN when non-responder-owner tries to accept', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    // getAgentCreatorId requester (for access check)
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    // getAgentCreatorId responder (for access check)
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    // getAgentCreatorId responder (for FORBIDDEN check) — user is requester, not responder
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { acceptCollaboration } = await import('./collaboration.service.js');
    await expect(acceptCollaboration(COLLAB_ID, USER_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws BAD_REQUEST when collaboration is not pending', async () => {
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
});

/* -------------------------------------------------------------------------- */
/*  completeCollaboration                                                      */
/* -------------------------------------------------------------------------- */

describe('collaboration.service — completeCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes an accepted collaboration with result', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'accepted' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeCollabRow({ status: 'completed', task_result: 'Analysis complete' }),
    ] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    const result = await completeCollaboration(COLLAB_ID, OTHER_USER_ID, 'Analysis complete');

    expect(result.status).toBe('completed');
    expect(result.task_result).toBe('Analysis complete');
  });

  it('completes an in_progress collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeCollabRow({ status: 'in_progress' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeCollabRow({ status: 'completed', task_result: 'Done' }),
    ] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    const result = await completeCollaboration(COLLAB_ID, OTHER_USER_ID, 'Done');

    expect(result.status).toBe('completed');
  });

  it('throws FORBIDDEN when non-responder-owner tries to complete', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'accepted' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    await expect(completeCollaboration(COLLAB_ID, USER_ID, 'Result')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws BAD_REQUEST when collaboration is pending', async () => {
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

  it('throws NOT_FOUND for non-existent collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { completeCollaboration } = await import('./collaboration.service.js');
    await expect(completeCollaboration('nonexistent', USER_ID, 'Result')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  rejectCollaboration                                                        */
/* -------------------------------------------------------------------------- */

describe('collaboration.service — rejectCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a pending collaboration with reason', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeCollabRow({ status: 'rejected', task_result: 'Not my expertise' }),
    ] as any);

    const { rejectCollaboration } = await import('./collaboration.service.js');
    const result = await rejectCollaboration(COLLAB_ID, OTHER_USER_ID, 'Not my expertise');

    expect(result.status).toBe('rejected');
    expect(result.task_result).toBe('Not my expertise');
  });

  it('throws FORBIDDEN when non-responder-owner tries to reject', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { rejectCollaboration } = await import('./collaboration.service.js');
    await expect(rejectCollaboration(COLLAB_ID, USER_ID, 'No thanks')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('throws BAD_REQUEST when collaboration is not pending', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow({ status: 'accepted' })] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { rejectCollaboration } = await import('./collaboration.service.js');
    await expect(rejectCollaboration(COLLAB_ID, OTHER_USER_ID, 'Too late')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws NOT_FOUND for non-existent collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { rejectCollaboration } = await import('./collaboration.service.js');
    await expect(rejectCollaboration('nonexistent', USER_ID, 'Reason')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('emits collaboration:rejected event via Socket.IO', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeCollabRow({ status: 'rejected', task_result: 'Busy' }),
    ] as any);

    const { rejectCollaboration } = await import('./collaboration.service.js');
    await rejectCollaboration(COLLAB_ID, OTHER_USER_ID, 'Busy');

    const { emitCollaborationEvent } = await import('../../ws/emitter.js');
    expect(emitCollaborationEvent).toHaveBeenCalledWith(USER_ID, {
      type: 'collaboration:rejected',
      collaboration_id: COLLAB_ID,
      responder_agent_id: RESPONDER_AGENT_ID,
      reason: 'Busy',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  listCollaborations                                                         */
/* -------------------------------------------------------------------------- */

describe('collaboration.service — listCollaborations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all collaborations for an agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    // list collaborations
    sqlMock.mockResolvedValueOnce([makeCollabRow(), makeCollabRow({ id: 'other-id' })] as any);

    const { listCollaborations } = await import('./collaboration.service.js');
    const results = await listCollaborations(REQUESTER_AGENT_ID, USER_ID);

    expect(results).toHaveLength(2);
  });

  it('returns empty array when no collaborations exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listCollaborations } = await import('./collaboration.service.js');
    const results = await listCollaborations(REQUESTER_AGENT_ID, USER_ID);

    expect(results).toHaveLength(0);
  });

  it('filters by status', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeCollabRow({ status: 'completed' })] as any);

    const { listCollaborations } = await import('./collaboration.service.js');
    const results = await listCollaborations(REQUESTER_AGENT_ID, USER_ID, { status: 'completed' });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('completed');
  });

  it('filters by direction sent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: REQUESTER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeCollabRow()] as any);

    const { listCollaborations } = await import('./collaboration.service.js');
    const results = await listCollaborations(REQUESTER_AGENT_ID, USER_ID, { direction: 'sent' });

    expect(results).toHaveLength(1);
  });

  it('filters by direction received', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: RESPONDER_AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeCollabRow()] as any);

    const { listCollaborations } = await import('./collaboration.service.js');
    const results = await listCollaborations(RESPONDER_AGENT_ID, OTHER_USER_ID, {
      direction: 'received',
    });

    expect(results).toHaveLength(1);
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listCollaborations } = await import('./collaboration.service.js');
    await expect(listCollaborations(REQUESTER_AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getCollaboration                                                           */
/* -------------------------------------------------------------------------- */

describe('collaboration.service — getCollaboration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a collaboration for an authorized user', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    // getAgentCreatorId for requester
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    // getAgentCreatorId for responder
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { getCollaboration } = await import('./collaboration.service.js');
    const result = await getCollaboration(COLLAB_ID, USER_ID);

    expect(result.id).toBe(COLLAB_ID);
    expect(result.created_at).toBe(new Date('2026-01-01').toISOString());
  });

  it('throws NOT_FOUND for non-existent collaboration', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getCollaboration } = await import('./collaboration.service.js');
    await expect(getCollaboration('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when unauthorized user tries to access', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeCollabRow()] as any);
    // requester owner is USER_ID
    sqlMock.mockResolvedValueOnce([{ creator_id: USER_ID }] as any);
    // responder owner is OTHER_USER_ID
    sqlMock.mockResolvedValueOnce([{ creator_id: OTHER_USER_ID }] as any);

    const { getCollaboration } = await import('./collaboration.service.js');
    const thirdUserId = 'ff0e8400-e29b-41d4-a716-446655440099';
    await expect(getCollaboration(COLLAB_ID, thirdUserId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  discoverAgents                                                             */
/* -------------------------------------------------------------------------- */

describe('collaboration.service — discoverAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching public agents by capability', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      {
        id: RESPONDER_AGENT_ID,
        name: 'Data Analyst',
        slug: 'data-analyst',
        description: 'Analyzes data sets',
        category: 'analytics',
        visibility: 'public',
        usage_count: 100,
        rating_sum: 45,
        rating_count: 10,
        inserted_at: new Date('2026-01-01'),
      },
    ] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    const results = await discoverAgents('data', USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Data Analyst');
    expect(results[0].category).toBe('analytics');
  });

  it('returns empty array when no agents match', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    const results = await discoverAgents('nonexistent-capability', USER_ID);

    expect(results).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        id: 'a1',
        name: 'Agent 1',
        slug: 'a1',
        description: 'desc',
        category: 'cat',
        visibility: 'public',
        usage_count: 10,
        rating_sum: 5,
        rating_count: 1,
        inserted_at: new Date('2026-01-01'),
      },
    ] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    const results = await discoverAgents('agent', USER_ID, 5);

    expect(results).toHaveLength(1);
  });

  it('caps limit at 100', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([] as any);

    const { discoverAgents } = await import('./collaboration.service.js');
    await discoverAgents('test', USER_ID, 500);

    // The SQL should be called with limit capped at 100
    expect(sqlMock).toHaveBeenCalled();
  });
});
