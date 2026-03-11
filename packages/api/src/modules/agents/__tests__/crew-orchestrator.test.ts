/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection
vi.mock('../../../db/connection.js', () => {
  const sqlFn = Object.assign(vi.fn(), {
    unsafe: vi.fn(),
    begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
      return cb(sqlFn);
    }),
  });
  return { sql: sqlFn, db: {} };
});

// Mock emitter
vi.mock('../../../ws/emitter.js', () => ({
  emitCrewEvent: vi.fn(),
  emitAgentEvent: vi.fn(),
  emitMessage: vi.fn(),
}));

// Mock runAgentLoop
vi.mock('../loop.js', () => ({
  runAgentLoop: vi.fn(),
}));

import { sql } from '../../../db/connection.js';
import { emitCrewEvent } from '../../../ws/emitter.js';
import { runCrew } from '../crew.js';
import { runAgentLoop } from '../loop.js';

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const CREW_ID = '770e8400-e29b-41d4-a716-446655440002';
const AGENT_ID_1 = '880e8400-e29b-41d4-a716-446655440003';
const AGENT_ID_2 = '990e8400-e29b-41d4-a716-446655440004';
const AGENT_ID_3 = 'aa0e8400-e29b-41d4-a716-446655440005';
const CONVERSATION_ID = 'bb0e8400-e29b-41d4-a716-446655440006';

function makeCrewDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CREW_ID,
    creator_id: USER_ID,
    visibility: 'private',
    steps: [
      { agentId: AGENT_ID_1, role: 'researcher' },
      { agentId: AGENT_ID_2, role: 'writer' },
    ],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  Authorization                                                             */
/* -------------------------------------------------------------------------- */

describe('runCrew — Authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NOT_FOUND when crew does not exist', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([] as any); // crew lookup

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'hello',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws NOT_FOUND when non-owner accesses private crew', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any); // crew is private, owned by USER_ID

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: OTHER_USER_ID, // not the creator
        message: 'hello',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('allows non-owner to run a public crew', async () => {
    const sqlMock = vi.mocked(sql);
    // 1. crew lookup (public)
    sqlMock.mockResolvedValueOnce([makeCrewDbRow({ visibility: 'public' })] as any);
    // 2. conversation membership check
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);
    // No runAgentLoop calls needed if steps execute
    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        response: 'Research',
        usage: { input_tokens: 10, output_tokens: 20 },
      })
      .mockResolvedValueOnce({ response: 'Final', usage: { input_tokens: 10, output_tokens: 20 } });
    // 3. usage count update
    sqlMock.mockResolvedValueOnce([] as any);

    const result = await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: OTHER_USER_ID,
      message: 'hello',
    });

    expect(result.response).toBe('Final');
  });

  it('allows non-owner to run an unlisted crew', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow({ visibility: 'unlisted' })] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);
    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        response: 'Research',
        usage: { input_tokens: 10, output_tokens: 20 },
      })
      .mockResolvedValueOnce({ response: 'Final', usage: { input_tokens: 10, output_tokens: 20 } });
    sqlMock.mockResolvedValueOnce([] as any);

    const result = await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: OTHER_USER_ID,
      message: 'hello',
    });

    expect(result.response).toBe('Final');
  });

  it('throws NOT_FOUND when user is not a conversation member', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any); // crew found
    sqlMock.mockResolvedValueOnce([] as any); // not a member

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'hello',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* -------------------------------------------------------------------------- */
/*  Sequential Execution                                                      */
/* -------------------------------------------------------------------------- */

describe('runCrew — Sequential Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes steps sequentially and passes output as context', async () => {
    const sqlMock = vi.mocked(sql);
    // 1. crew lookup
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any);
    // 2. conversation membership
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        response: 'Research results',
        usage: { input_tokens: 10, output_tokens: 20 },
      })
      .mockResolvedValueOnce({
        response: 'Final article',
        usage: { input_tokens: 10, output_tokens: 20 },
      });

    // 3. usage count update
    sqlMock.mockResolvedValueOnce([] as any);

    const result = await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'Write about AI',
    });

    expect(result.response).toBe('Final article');
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults[0].response).toBe('Research results');
    expect(result.stepResults[1].response).toBe('Final article');

    // Second agent should receive the first agent's output as context
    const secondCall = vi.mocked(runAgentLoop).mock.calls[1];
    expect(secondCall[0].message).toContain('Research results');
  });

  it('emits step_started and step_completed for each step', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({ response: 'R', usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce({ response: 'W', usage: { input_tokens: 1, output_tokens: 1 } });

    sqlMock.mockResolvedValueOnce([] as any);

    await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'test',
    });

    const emitCalls = vi.mocked(emitCrewEvent).mock.calls;
    const eventTypes = emitCalls.map((c) => (c[1] as any).type);

    expect(eventTypes).toEqual([
      'crew:step_started',
      'crew:step_completed',
      'crew:step_started',
      'crew:step_completed',
      'crew:finished',
    ]);
  });

  it('emits crew:finished with correct total_steps and final_response', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({ response: 'R', usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce({
        response: 'Final output',
        usage: { input_tokens: 1, output_tokens: 1 },
      });

    sqlMock.mockResolvedValueOnce([] as any);

    await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'test',
    });

    const finishedEvent = vi
      .mocked(emitCrewEvent)
      .mock.calls.find((c) => (c[1] as any).type === 'crew:finished');
    expect(finishedEvent).toBeTruthy();
    expect((finishedEvent?.[1] as any).total_steps).toBe(2);
    expect((finishedEvent?.[1] as any).final_response).toBe('Final output');
  });

  it('increments usage count after successful execution', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({ response: 'R', usage: { input_tokens: 1, output_tokens: 1 } })
      .mockResolvedValueOnce({ response: 'W', usage: { input_tokens: 1, output_tokens: 1 } });

    sqlMock.mockResolvedValueOnce([] as any); // usage count update

    await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'test',
    });

    // sql should be called 3 times: crew lookup, membership check, usage count update
    expect(sqlMock).toHaveBeenCalledTimes(3);
  });
});

/* -------------------------------------------------------------------------- */
/*  Parallel Execution                                                        */
/* -------------------------------------------------------------------------- */

describe('runCrew — Parallel Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs steps with the same parallelGroup concurrently', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([
      makeCrewDbRow({
        steps: [
          { agentId: AGENT_ID_1, role: 'analyst-1', parallelGroup: 'analysis' },
          { agentId: AGENT_ID_2, role: 'analyst-2', parallelGroup: 'analysis' },
          { agentId: AGENT_ID_3, role: 'synthesizer' },
        ],
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        response: 'Analysis 1',
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce({
        response: 'Analysis 2',
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce({
        response: 'Synthesized',
        usage: { input_tokens: 1, output_tokens: 1 },
      });

    sqlMock.mockResolvedValueOnce([] as any);

    const result = await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'Analyze this',
    });

    expect(result.stepResults).toHaveLength(3);
    expect(result.response).toBe('Synthesized');

    // The synthesizer should receive merged parallel output
    const synthesizerCall = vi.mocked(runAgentLoop).mock.calls[2];
    expect(synthesizerCall[0].message).toContain('[analyst-1]: Analysis 1');
    expect(synthesizerCall[0].message).toContain('[analyst-2]: Analysis 2');
  });

  it('does not group non-contiguous steps with same parallelGroup', async () => {
    const sqlMock = vi.mocked(sql);
    // Steps: [A-group1, B-sequential, C-group1] => should NOT run A and C in parallel
    sqlMock.mockResolvedValueOnce([
      makeCrewDbRow({
        steps: [
          { agentId: AGENT_ID_1, role: 'first', parallelGroup: 'group1' },
          { agentId: AGENT_ID_2, role: 'middle' }, // sequential, breaks the group
          { agentId: AGENT_ID_3, role: 'third', parallelGroup: 'group1' },
        ],
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        response: 'First result',
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce({
        response: 'Middle result',
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce({
        response: 'Third result',
        usage: { input_tokens: 1, output_tokens: 1 },
      });

    sqlMock.mockResolvedValueOnce([] as any);

    const result = await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'test',
    });

    expect(result.stepResults).toHaveLength(3);

    // First step (alone in its "parallel" group of 1) runs with original message
    const firstCall = vi.mocked(runAgentLoop).mock.calls[0];
    expect(firstCall[0].message).toContain('test');

    // Middle step runs after first, receives first's output
    const middleCall = vi.mocked(runAgentLoop).mock.calls[1];
    expect(middleCall[0].message).toContain('First result');

    // Third step runs after middle, receives middle's output
    const thirdCall = vi.mocked(runAgentLoop).mock.calls[2];
    expect(thirdCall[0].message).toContain('Middle result');
  });
});

/* -------------------------------------------------------------------------- */
/*  Error Handling                                                            */
/* -------------------------------------------------------------------------- */

describe('runCrew — Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws BAD_REQUEST when crew has no steps', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow({ steps: [] })] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'test',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('emits crew:error when a sequential step fails', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error('Agent failed'));

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'test',
      }),
    ).rejects.toThrow('Agent failed');

    // Should emit crew:error
    const errorEvent = vi
      .mocked(emitCrewEvent)
      .mock.calls.find((c) => (c[1] as any).type === 'crew:error');
    expect(errorEvent).toBeTruthy();
    expect((errorEvent?.[1] as any).error).toBe('Agent failed');
    expect((errorEvent?.[1] as any).crew_id).toBe(CREW_ID);
  });

  it('does not emit crew:finished when a step fails', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error('Agent failed'));

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'test',
      }),
    ).rejects.toThrow();

    const finishedEvent = vi
      .mocked(emitCrewEvent)
      .mock.calls.find((c) => (c[1] as any).type === 'crew:finished');
    expect(finishedEvent).toBeUndefined();
  });

  it('does not increment usage count when a step fails', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([makeCrewDbRow()] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error('Agent failed'));

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'test',
      }),
    ).rejects.toThrow();

    // sql called only for crew lookup + membership check, not for usage count update
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it('handles all parallel steps failing', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([
      makeCrewDbRow({
        steps: [
          { agentId: AGENT_ID_1, role: 'a1', parallelGroup: 'group' },
          { agentId: AGENT_ID_2, role: 'a2', parallelGroup: 'group' },
        ],
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockRejectedValueOnce(new Error('Agent 1 failed'))
      .mockRejectedValueOnce(new Error('Agent 2 failed'));

    await expect(
      runCrew({
        crewId: CREW_ID,
        conversationId: CONVERSATION_ID,
        userId: USER_ID,
        message: 'test',
      }),
    ).rejects.toThrow('All parallel steps failed');
  });

  it('continues with successful results when some parallel steps fail', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([
      makeCrewDbRow({
        steps: [
          { agentId: AGENT_ID_1, role: 'a1', parallelGroup: 'group' },
          { agentId: AGENT_ID_2, role: 'a2', parallelGroup: 'group' },
        ],
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop)
      .mockResolvedValueOnce({
        response: 'Success from a1',
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockRejectedValueOnce(new Error('Agent 2 failed'));

    sqlMock.mockResolvedValueOnce([] as any); // usage count update

    const result = await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'test',
    });

    // Should succeed with partial results
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].response).toBe('Success from a1');

    // Should emit crew:error for the failed step
    const errorEvents = vi
      .mocked(emitCrewEvent)
      .mock.calls.filter((c) => (c[1] as any).type === 'crew:error');
    expect(errorEvents).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  Single Step Crew                                                          */
/* -------------------------------------------------------------------------- */

describe('runCrew — Single Step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles a crew with a single step', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([
      makeCrewDbRow({
        steps: [{ agentId: AGENT_ID_1, role: 'sole-agent' }],
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop).mockResolvedValueOnce({
      response: 'Done',
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    sqlMock.mockResolvedValueOnce([] as any);

    const result = await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'test',
    });

    expect(result.response).toBe('Done');
    expect(result.stepResults).toHaveLength(1);
  });

  it('passes crew role in the message to runAgentLoop', async () => {
    const sqlMock = vi.mocked(sql);
    sqlMock.mockResolvedValueOnce([
      makeCrewDbRow({
        steps: [{ agentId: AGENT_ID_1, role: 'analyst' }],
      }),
    ] as any);
    sqlMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);

    vi.mocked(runAgentLoop).mockResolvedValueOnce({
      response: 'Done',
      usage: { input_tokens: 5, output_tokens: 10 },
    });

    sqlMock.mockResolvedValueOnce([] as any);

    await runCrew({
      crewId: CREW_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
      message: 'Analyze this data',
    });

    const loopCall = vi.mocked(runAgentLoop).mock.calls[0];
    expect(loopCall[0].message).toContain('[Crew role: analyst]');
    expect(loopCall[0].message).toContain('Analyze this data');
    expect(loopCall[0].agentId).toBe(AGENT_ID_1);
    expect(loopCall[0].conversationId).toBe(CONVERSATION_ID);
    expect(loopCall[0].userId).toBe(USER_ID);
  });
});
