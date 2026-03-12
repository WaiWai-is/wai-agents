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
  emitEvalEvent: vi.fn(),
}));

// Mock agent loop
vi.mock('./loop.js', () => ({
  runAgentLoop: vi.fn().mockResolvedValue({
    response: 'test response',
    usage: { input_tokens: 100, output_tokens: 50 },
  }),
}));

const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440001';
const AGENT_ID = '770e8400-e29b-41d4-a716-446655440002';
const SUITE_ID = '880e8400-e29b-41d4-a716-446655440003';
const SUITE_ID_2 = '880e8400-e29b-41d4-a716-446655440033';
const TEST_CASE_ID = '990e8400-e29b-41d4-a716-446655440004';
const TEST_CASE_ID_2 = '990e8400-e29b-41d4-a716-446655440044';
const RUN_ID = 'aa0e8400-e29b-41d4-a716-446655440005';
const RESULT_ID = 'bb0e8400-e29b-41d4-a716-446655440006';

const NOW = new Date('2026-03-01T12:00:00.000Z');

function makeSuiteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SUITE_ID,
    agent_id: AGENT_ID,
    creator_id: USER_ID,
    name: 'Test Suite',
    description: 'A test evaluation suite',
    scoring_rubric: null,
    metadata: {},
    inserted_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeTestCaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_CASE_ID,
    suite_id: SUITE_ID,
    name: 'Test Case 1',
    input: { message: 'Hello' },
    expected_output: null,
    weight: 1.0,
    tags: [],
    metadata: {},
    inserted_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function makeRunRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    suite_id: SUITE_ID,
    agent_id: AGENT_ID,
    user_id: USER_ID,
    status: 'pending',
    overall_score: null,
    total_test_cases: 1,
    passed_test_cases: 0,
    failed_test_cases: 0,
    total_latency_ms: null,
    metadata: {},
    started_at: NOW,
    completed_at: null,
    inserted_at: NOW,
    ...overrides,
  };
}

function makeResultRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RESULT_ID,
    run_id: RUN_ID,
    test_case_id: TEST_CASE_ID,
    actual_output: { response: 'test' },
    score: 0.85,
    passed: 'pass',
    latency_ms: 150,
    token_usage: { input_tokens: 100, output_tokens: 50 },
    error: null,
    metadata: {},
    inserted_at: NOW,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/*  listSuites                                                                */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — listSuites', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns suites for an agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // list query
    sqlMock.mockResolvedValueOnce([makeSuiteRow()] as any);

    const { listSuites } = await import('./evaluation.service.js');
    const results = await listSuites(AGENT_ID, USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Test Suite');
    expect(results[0].created_at).toBe(NOW.toISOString());
  });

  it('returns empty array when no suites exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { listSuites } = await import('./evaluation.service.js');
    const results = await listSuites(AGENT_ID, USER_ID);

    expect(results).toHaveLength(0);
  });

  it('throws NOT_FOUND when user does not own the agent', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listSuites } = await import('./evaluation.service.js');
    await expect(listSuites(AGENT_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  createSuite                                                               */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — createSuite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a suite with valid input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // INSERT
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT (via sql.unsafe)
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeSuiteRow()] as any);

    const { createSuite } = await import('./evaluation.service.js');
    const result = await createSuite(AGENT_ID, USER_ID, {
      name: 'Test Suite',
      description: 'A test evaluation suite',
    });

    expect(result.name).toBe('Test Suite');
    expect(result.description).toBe('A test evaluation suite');
    expect(result.agent_id).toBe(AGENT_ID);
  });

  it('creates a suite with minimal input (name only)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeSuiteRow({ description: null }),
    ] as any);

    const { createSuite } = await import('./evaluation.service.js');
    const result = await createSuite(AGENT_ID, USER_ID, { name: 'Minimal Suite' });

    expect(result.description).toBeNull();
  });

  it('creates a suite with scoring rubric', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const rubric = { accuracy: 0.5, relevance: 0.3, tone: 0.2 };

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeSuiteRow({ scoring_rubric: rubric }),
    ] as any);

    const { createSuite } = await import('./evaluation.service.js');
    const result = await createSuite(AGENT_ID, USER_ID, {
      name: 'Rubric Suite',
      scoring_rubric: rubric,
    });

    expect(result.scoring_rubric).toEqual(rubric);
  });

  it('creates a suite with metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const meta = { version: 2, team: 'backend' };

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeSuiteRow({ metadata: meta }),
    ] as any);

    const { createSuite } = await import('./evaluation.service.js');
    const result = await createSuite(AGENT_ID, USER_ID, {
      name: 'Meta Suite',
      metadata: meta,
    });

    expect(result.metadata).toEqual(meta);
  });

  it('throws NOT_FOUND when agent does not exist or user is not owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createSuite } = await import('./evaluation.service.js');
    await expect(
      createSuite('nonexistent', USER_ID, { name: 'Test' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('creates a suite with special characters in name', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const specialName = 'Suite with "quotes" & <angles> and emojis';

    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeSuiteRow({ name: specialName }),
    ] as any);

    const { createSuite } = await import('./evaluation.service.js');
    const result = await createSuite(AGENT_ID, USER_ID, { name: specialName });

    expect(result.name).toBe(specialName);
  });
});

/* -------------------------------------------------------------------------- */
/*  getSuite                                                                  */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — getSuite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns suite with test cases', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertSuiteCreator
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    // SELECT suite
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeSuiteRow()] as any);
    // SELECT test cases
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeTestCaseRow()] as any);

    const { getSuite } = await import('./evaluation.service.js');
    const result = await getSuite(SUITE_ID, USER_ID);

    expect(result.name).toBe('Test Suite');
    expect(result.test_cases).toHaveLength(1);
    expect(result.test_cases[0].name).toBe('Test Case 1');
  });

  it('returns suite with empty test cases array', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeSuiteRow()] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { getSuite } = await import('./evaluation.service.js');
    const result = await getSuite(SUITE_ID, USER_ID);

    expect(result.test_cases).toHaveLength(0);
  });

  it('throws NOT_FOUND when suite row does not exist after auth check passes', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { getSuite } = await import('./evaluation.service.js');
    await expect(getSuite(SUITE_ID, USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when user is not creator', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getSuite } = await import('./evaluation.service.js');
    await expect(getSuite(SUITE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  updateSuite                                                               */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — updateSuite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates suite name', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeSuiteRow({ name: 'Updated Suite' })] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    const result = await updateSuite(SUITE_ID, USER_ID, { name: 'Updated Suite' });

    expect(result.name).toBe('Updated Suite');
  });

  it('updates suite description', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeSuiteRow({ description: 'New description' }),
    ] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    const result = await updateSuite(SUITE_ID, USER_ID, {
      description: 'New description',
    });

    expect(result.description).toBe('New description');
  });

  it('clears description by setting to null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeSuiteRow({ description: null })] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    const result = await updateSuite(SUITE_ID, USER_ID, { description: null });

    expect(result.description).toBeNull();
  });

  it('updates scoring rubric', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const newRubric = { accuracy: 1.0 };

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeSuiteRow({ scoring_rubric: newRubric }),
    ] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    const result = await updateSuite(SUITE_ID, USER_ID, {
      scoring_rubric: newRubric,
    });

    expect(result.scoring_rubric).toEqual(newRubric);
  });

  it('updates metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeSuiteRow({ metadata: { updated: true } }),
    ] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    const result = await updateSuite(SUITE_ID, USER_ID, {
      metadata: { updated: true },
    });

    expect(result.metadata).toEqual({ updated: true });
  });

  it('updates with empty object (no changes)', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeSuiteRow()] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    const result = await updateSuite(SUITE_ID, USER_ID, {});

    expect(result.name).toBe('Test Suite');
  });

  it('throws NOT_FOUND when suite does not exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    await expect(
      updateSuite('nonexistent', USER_ID, { name: 'Test' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when UPDATE RETURNING returns empty', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { updateSuite } = await import('./evaluation.service.js');
    await expect(
      updateSuite(SUITE_ID, USER_ID, { name: 'Test' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteSuite                                                               */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — deleteSuite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a suite successfully', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteSuite } = await import('./evaluation.service.js');
    await expect(deleteSuite(SUITE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND for non-existent suite', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteSuite } = await import('./evaluation.service.js');
    await expect(deleteSuite('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when non-owner tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteSuite } = await import('./evaluation.service.js');
    await expect(deleteSuite(SUITE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  listTestCases                                                             */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — listTestCases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns test cases for a suite', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow(),
      makeTestCaseRow({ id: TEST_CASE_ID_2, name: 'Test Case 2' }),
    ] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    const results = await listTestCases(SUITE_ID, USER_ID);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Test Case 1');
    expect(results[1].name).toBe('Test Case 2');
  });

  it('returns empty array when no test cases exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    const results = await listTestCases(SUITE_ID, USER_ID);

    expect(results).toHaveLength(0);
  });

  it('throws NOT_FOUND for non-owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    await expect(listTestCases(SUITE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  createTestCase                                                            */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — createTestCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a test case with valid input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeTestCaseRow()] as any);

    const { createTestCase } = await import('./evaluation.service.js');
    const result = await createTestCase(SUITE_ID, USER_ID, {
      name: 'Test Case 1',
      input: { message: 'Hello' },
    });

    expect(result.name).toBe('Test Case 1');
    expect(result.input).toEqual({ message: 'Hello' });
  });

  it('creates a test case with expected output', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const expectedOutput = { contains: ['hello', 'world'] };

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ expected_output: expectedOutput }),
    ] as any);

    const { createTestCase } = await import('./evaluation.service.js');
    const result = await createTestCase(SUITE_ID, USER_ID, {
      name: 'Test Case with Output',
      input: { message: 'Hi' },
      expected_output: expectedOutput,
    });

    expect(result.expected_output).toEqual(expectedOutput);
  });

  it('creates a test case with custom weight', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ weight: 2.5 }),
    ] as any);

    const { createTestCase } = await import('./evaluation.service.js');
    const result = await createTestCase(SUITE_ID, USER_ID, {
      name: 'Weighted Test',
      input: { message: 'test' },
      weight: 2.5,
    });

    expect(result.weight).toBe(2.5);
  });

  it('creates a test case with tags', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const tags = ['accuracy', 'tone', 'factual'];

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ tags }),
    ] as any);

    const { createTestCase } = await import('./evaluation.service.js');
    const result = await createTestCase(SUITE_ID, USER_ID, {
      name: 'Tagged Test',
      input: { message: 'test' },
      tags,
    });

    expect(result.tags).toEqual(tags);
  });

  it('creates a test case with metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const meta = { priority: 'high', category: 'regression' };

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ metadata: meta }),
    ] as any);

    const { createTestCase } = await import('./evaluation.service.js');
    const result = await createTestCase(SUITE_ID, USER_ID, {
      name: 'Meta Test',
      input: { message: 'test' },
      metadata: meta,
    });

    expect(result.metadata).toEqual(meta);
  });

  it('defaults weight to 1.0 when not provided', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ weight: 1.0 }),
    ] as any);

    const { createTestCase } = await import('./evaluation.service.js');
    const result = await createTestCase(SUITE_ID, USER_ID, {
      name: 'Default Weight',
      input: { message: 'test' },
    });

    expect(result.weight).toBe(1.0);
  });

  it('throws NOT_FOUND when suite does not belong to user', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { createTestCase } = await import('./evaluation.service.js');
    await expect(
      createTestCase(SUITE_ID, OTHER_USER_ID, {
        name: 'Unauthorized',
        input: { message: 'test' },
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  updateTestCase                                                            */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — updateTestCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates test case name', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // ownership check
    sqlMock.mockResolvedValueOnce([{ suite_id: SUITE_ID }] as any);
    // UPDATE RETURNING
    sqlMock.mockResolvedValueOnce([makeTestCaseRow({ name: 'Updated Name' })] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    const result = await updateTestCase(TEST_CASE_ID, USER_ID, {
      name: 'Updated Name',
    });

    expect(result.name).toBe('Updated Name');
  });

  it('updates test case input', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const newInput = { message: 'Updated prompt', context: 'new context' };

    sqlMock.mockResolvedValueOnce([{ suite_id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeTestCaseRow({ input: newInput })] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    const result = await updateTestCase(TEST_CASE_ID, USER_ID, {
      input: newInput,
    });

    expect(result.input).toEqual(newInput);
  });

  it('updates test case expected_output', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const newExpected = { response: 'expected answer' };

    sqlMock.mockResolvedValueOnce([{ suite_id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeTestCaseRow({ expected_output: newExpected }),
    ] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    const result = await updateTestCase(TEST_CASE_ID, USER_ID, {
      expected_output: newExpected,
    });

    expect(result.expected_output).toEqual(newExpected);
  });

  it('clears expected_output by setting to null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ suite_id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeTestCaseRow({ expected_output: null }),
    ] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    const result = await updateTestCase(TEST_CASE_ID, USER_ID, {
      expected_output: null,
    });

    expect(result.expected_output).toBeNull();
  });

  it('updates weight', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ suite_id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([makeTestCaseRow({ weight: 5.0 })] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    const result = await updateTestCase(TEST_CASE_ID, USER_ID, { weight: 5.0 });

    expect(result.weight).toBe(5.0);
  });

  it('updates tags', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ suite_id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([
      makeTestCaseRow({ tags: ['new-tag-1', 'new-tag-2'] }),
    ] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    const result = await updateTestCase(TEST_CASE_ID, USER_ID, {
      tags: ['new-tag-1', 'new-tag-2'],
    });

    expect(result.tags).toEqual(['new-tag-1', 'new-tag-2']);
  });

  it('throws NOT_FOUND when test case does not exist or not owned', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    await expect(
      updateTestCase('nonexistent', USER_ID, { name: 'test' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when UPDATE RETURNING is empty', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ suite_id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { updateTestCase } = await import('./evaluation.service.js');
    await expect(
      updateTestCase(TEST_CASE_ID, USER_ID, { name: 'test' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  deleteTestCase                                                            */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — deleteTestCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a test case successfully', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: TEST_CASE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { deleteTestCase } = await import('./evaluation.service.js');
    await expect(deleteTestCase(TEST_CASE_ID, USER_ID)).resolves.toBeUndefined();
  });

  it('throws NOT_FOUND for non-existent test case', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteTestCase } = await import('./evaluation.service.js');
    await expect(deleteTestCase('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when non-owner tries to delete', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { deleteTestCase } = await import('./evaluation.service.js');
    await expect(
      deleteTestCase(TEST_CASE_ID, OTHER_USER_ID),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  runEvaluation                                                             */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — runEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a run with valid suite and agent', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // assertSuiteCreator
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    // assertAgentCreator
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    // Load test cases
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeTestCaseRow()] as any);
    // INSERT run
    sqlMock.mockResolvedValueOnce([] as any);
    // SELECT run
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);

    const { runEvaluation } = await import('./evaluation.service.js');
    const result = await runEvaluation(SUITE_ID, AGENT_ID, USER_ID, {});

    expect(result.status).toBe('pending');
    expect(result.suite_id).toBe(SUITE_ID);
    expect(result.agent_id).toBe(AGENT_ID);
    expect(result.total_test_cases).toBe(1);
  });

  it('throws BAD_REQUEST when suite has no test cases', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { runEvaluation } = await import('./evaluation.service.js');
    await expect(
      runEvaluation(SUITE_ID, AGENT_ID, USER_ID, {}),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('throws NOT_FOUND when suite is not owned by user', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { runEvaluation } = await import('./evaluation.service.js');
    await expect(
      runEvaluation(SUITE_ID, AGENT_ID, OTHER_USER_ID, {}),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when agent is not owned by user', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { runEvaluation } = await import('./evaluation.service.js');
    await expect(
      runEvaluation(SUITE_ID, AGENT_ID, USER_ID, {}),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('creates a run with metadata', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const runMeta = { trigger: 'manual', environment: 'staging' };

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeTestCaseRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeRunRow({ metadata: runMeta }),
    ] as any);

    const { runEvaluation } = await import('./evaluation.service.js');
    const result = await runEvaluation(SUITE_ID, AGENT_ID, USER_ID, {
      metadata: runMeta,
    });

    expect(result.metadata).toEqual(runMeta);
  });

  it('creates a run with multiple test cases and reflects total_test_cases', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    sqlMock.mockResolvedValueOnce([{ id: AGENT_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow(),
      makeTestCaseRow({ id: TEST_CASE_ID_2, name: 'TC 2' }),
    ] as any);
    sqlMock.mockResolvedValueOnce([] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeRunRow({ total_test_cases: 2 }),
    ] as any);

    const { runEvaluation } = await import('./evaluation.service.js');
    const result = await runEvaluation(SUITE_ID, AGENT_ID, USER_ID, {});

    expect(result.total_test_cases).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/*  listRuns                                                                  */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — listRuns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns runs for a suite', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);

    const { listRuns } = await import('./evaluation.service.js');
    const results = await listRuns(SUITE_ID, USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].suite_id).toBe(SUITE_ID);
  });

  it('returns empty array when no runs exist', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { listRuns } = await import('./evaluation.service.js');
    const results = await listRuns(SUITE_ID, USER_ID);

    expect(results).toHaveLength(0);
  });

  it('returns multiple runs', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);
    const runId2 = 'aa0e8400-e29b-41d4-a716-446655440099';

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeRunRow({ status: 'completed', overall_score: 0.9 }),
      makeRunRow({ id: runId2, status: 'completed', overall_score: 0.7 }),
    ] as any);

    const { listRuns } = await import('./evaluation.service.js');
    const results = await listRuns(SUITE_ID, USER_ID);

    expect(results).toHaveLength(2);
    expect(results[0].overall_score).toBe(0.9);
  });

  it('throws NOT_FOUND for non-owner', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { listRuns } = await import('./evaluation.service.js');
    await expect(listRuns(SUITE_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getRun                                                                    */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — getRun', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a run with results', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    // SELECT run
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    // assertSuiteCreator
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    // SELECT results
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeResultRow()] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.id).toBe(RUN_ID);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].score).toBe(0.85);
    expect(result.results[0].passed).toBe('pass');
  });

  it('returns a run with empty results', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.results).toHaveLength(0);
  });

  it('throws NOT_FOUND for non-existent run', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql.unsafe).mockResolvedValueOnce([] as any);

    const { getRun } = await import('./evaluation.service.js');
    await expect(getRun('nonexistent', USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws NOT_FOUND when user does not own the suite for the run', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([] as any);

    const { getRun } = await import('./evaluation.service.js');
    await expect(getRun(RUN_ID, OTHER_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

/* -------------------------------------------------------------------------- */
/*  getLeaderboard                                                            */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — getLeaderboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns leaderboard entries ranked by best_score', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([
      {
        agent_id: AGENT_ID,
        agent_name: 'Agent Alpha',
        suite_id: SUITE_ID,
        suite_name: 'Suite A',
        best_score: 0.95,
        avg_score: 0.85,
        total_runs: 5,
        last_run_at: NOW,
      },
      {
        agent_id: 'agent-2',
        agent_name: 'Agent Beta',
        suite_id: SUITE_ID_2,
        suite_name: 'Suite B',
        best_score: 0.80,
        avg_score: 0.70,
        total_runs: 3,
        last_run_at: NOW,
      },
    ] as any);

    const { getLeaderboard } = await import('./evaluation.service.js');
    const results = await getLeaderboard(USER_ID);

    expect(results).toHaveLength(2);
    expect(results[0].best_score).toBe(0.95);
    expect(results[0].agent_name).toBe('Agent Alpha');
    expect(results[1].best_score).toBe(0.80);
    expect(results[1].agent_name).toBe('Agent Beta');
  });

  it('returns empty leaderboard when no completed runs exist', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([] as any);

    const { getLeaderboard } = await import('./evaluation.service.js');
    const results = await getLeaderboard(USER_ID);

    expect(results).toHaveLength(0);
  });

  it('handles null agent_name gracefully', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        agent_id: AGENT_ID,
        agent_name: null,
        suite_id: SUITE_ID,
        suite_name: 'Suite A',
        best_score: 0.5,
        avg_score: 0.5,
        total_runs: 1,
        last_run_at: NOW,
      },
    ] as any);

    const { getLeaderboard } = await import('./evaluation.service.js');
    const results = await getLeaderboard(USER_ID);

    expect(results[0].agent_name).toBeNull();
  });

  it('handles null best_score defaulting to 0', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        agent_id: AGENT_ID,
        agent_name: 'Agent',
        suite_id: SUITE_ID,
        suite_name: 'Suite A',
        best_score: null,
        avg_score: null,
        total_runs: null,
        last_run_at: null,
      },
    ] as any);

    const { getLeaderboard } = await import('./evaluation.service.js');
    const results = await getLeaderboard(USER_ID);

    expect(results[0].best_score).toBe(0);
    expect(results[0].avg_score).toBe(0);
    expect(results[0].total_runs).toBe(0);
    expect(results[0].last_run_at).toBeNull();
  });

  it('returns single entry for an agent with one completed run', async () => {
    const { sql } = await import('../../db/connection.js');
    vi.mocked(sql).mockResolvedValueOnce([
      {
        agent_id: AGENT_ID,
        agent_name: 'Solo Agent',
        suite_id: SUITE_ID,
        suite_name: 'Solo Suite',
        best_score: 1.0,
        avg_score: 1.0,
        total_runs: 1,
        last_run_at: NOW,
      },
    ] as any);

    const { getLeaderboard } = await import('./evaluation.service.js');
    const results = await getLeaderboard(USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].best_score).toBe(1.0);
    expect(results[0].total_runs).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/*  Formatter edge cases                                                      */
/* -------------------------------------------------------------------------- */

describe('evaluation.service — formatSuite edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null description returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeSuiteRow({ description: null }),
    ] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { getSuite } = await import('./evaluation.service.js');
    const result = await getSuite(SUITE_ID, USER_ID);

    expect(result.description).toBeNull();
  });

  it('handles undefined scoring_rubric returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeSuiteRow({ scoring_rubric: undefined }),
    ] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { getSuite } = await import('./evaluation.service.js');
    const result = await getSuite(SUITE_ID, USER_ID);

    expect(result.scoring_rubric).toBeNull();
  });

  it('handles undefined metadata defaulting to empty object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeSuiteRow({ metadata: undefined }),
    ] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([] as any);

    const { getSuite } = await import('./evaluation.service.js');
    const result = await getSuite(SUITE_ID, USER_ID);

    expect(result.metadata).toEqual({});
  });
});

describe('evaluation.service — formatTestCase edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles undefined input defaulting to empty object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ input: undefined }),
    ] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    const results = await listTestCases(SUITE_ID, USER_ID);

    expect(results[0].input).toEqual({});
  });

  it('handles undefined expected_output returning null', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ expected_output: undefined }),
    ] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    const results = await listTestCases(SUITE_ID, USER_ID);

    expect(results[0].expected_output).toBeNull();
  });

  it('handles undefined weight defaulting to 1.0', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ weight: undefined }),
    ] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    const results = await listTestCases(SUITE_ID, USER_ID);

    expect(results[0].weight).toBe(1.0);
  });

  it('handles undefined tags defaulting to empty array', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ tags: undefined }),
    ] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    const results = await listTestCases(SUITE_ID, USER_ID);

    expect(results[0].tags).toEqual([]);
  });

  it('handles undefined metadata defaulting to empty object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeTestCaseRow({ metadata: undefined }),
    ] as any);

    const { listTestCases } = await import('./evaluation.service.js');
    const results = await listTestCases(SUITE_ID, USER_ID);

    expect(results[0].metadata).toEqual({});
  });
});

describe('evaluation.service — formatRun edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null overall_score', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeRunRow({ overall_score: null }),
    ] as any);

    const { listRuns } = await import('./evaluation.service.js');
    const results = await listRuns(SUITE_ID, USER_ID);

    expect(results[0].overall_score).toBeNull();
  });

  it('handles undefined total_test_cases defaulting to 0', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeRunRow({ total_test_cases: undefined }),
    ] as any);

    const { listRuns } = await import('./evaluation.service.js');
    const results = await listRuns(SUITE_ID, USER_ID);

    expect(results[0].total_test_cases).toBe(0);
  });

  it('handles null completed_at for pending run', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeRunRow({ completed_at: null, status: 'pending' }),
    ] as any);

    const { listRuns } = await import('./evaluation.service.js');
    const results = await listRuns(SUITE_ID, USER_ID);

    expect(results[0].completed_at).toBeNull();
    expect(results[0].status).toBe('pending');
  });
});

describe('evaluation.service — formatResult edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles null actual_output', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeResultRow({ actual_output: null }),
    ] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.results[0].actual_output).toBeNull();
  });

  it('handles null score', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeResultRow({ score: null }),
    ] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.results[0].score).toBeNull();
  });

  it('handles null passed', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeResultRow({ passed: null }),
    ] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.results[0].passed).toBeNull();
  });

  it('handles error field', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeResultRow({
        error: 'Agent loop timeout',
        passed: 'error',
        score: 0,
      }),
    ] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.results[0].error).toBe('Agent loop timeout');
    expect(result.results[0].passed).toBe('error');
  });

  it('handles null token_usage', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeResultRow({ token_usage: null }),
    ] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.results[0].token_usage).toBeNull();
  });

  it('handles undefined metadata defaulting to empty object', async () => {
    const { sql } = await import('../../db/connection.js');
    const sqlMock = vi.mocked(sql);

    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([makeRunRow()] as any);
    sqlMock.mockResolvedValueOnce([{ id: SUITE_ID }] as any);
    vi.mocked(sqlMock.unsafe).mockResolvedValueOnce([
      makeResultRow({ metadata: undefined }),
    ] as any);

    const { getRun } = await import('./evaluation.service.js');
    const result = await getRun(RUN_ID, USER_ID);

    expect(result.results[0].metadata).toEqual({});
  });
});
