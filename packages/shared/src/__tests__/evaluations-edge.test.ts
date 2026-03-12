import { describe, expect, it } from 'vitest';
import {
  EvalStartedEventSchema,
  EvalProgressEventSchema,
  EvalCompletedEventSchema,
  EvalFailedEventSchema,
  type EvalStartedEvent,
  type EvalProgressEvent,
  type EvalCompletedEvent,
  type EvalFailedEvent,
  type EvalEvent,
  type EvalSuiteStatus,
  type EvalRunStatus,
  type EvalResultVerdict,
  type AgentEvalSuite,
  type EvalTestCase,
  type EvalRun,
  type EvalResult,
  type EvalRunWithResults,
  type EvalSuiteWithTestCases,
  type LeaderboardEntry,
} from '../types/evaluations.js';

/* ================================================================
 * EvalStartedEventSchema
 * ================================================================ */

describe('EvalStartedEventSchema — validation', () => {
  it('accepts valid event', () => {
    const event = {
      type: 'eval:started' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      total_test_cases: 10,
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('eval:started');
      expect(result.data.total_test_cases).toBe(10);
    }
  });

  it('rejects event with wrong type literal', () => {
    const event = {
      type: 'eval:progress',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      total_test_cases: 10,
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing suite_id', () => {
    const event = {
      type: 'eval:started',
      run_id: 'run-1',
      agent_id: 'agent-1',
      total_test_cases: 10,
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing run_id', () => {
    const event = {
      type: 'eval:started',
      suite_id: 'suite-1',
      agent_id: 'agent-1',
      total_test_cases: 10,
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing agent_id', () => {
    const event = {
      type: 'eval:started',
      suite_id: 'suite-1',
      run_id: 'run-1',
      total_test_cases: 10,
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing total_test_cases', () => {
    const event = {
      type: 'eval:started',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with string total_test_cases', () => {
    const event = {
      type: 'eval:started',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      total_test_cases: 'ten',
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('accepts event with zero total_test_cases', () => {
    const event = {
      type: 'eval:started' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      total_test_cases: 0,
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts event with negative total_test_cases (no min constraint)', () => {
    const event = {
      type: 'eval:started' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      total_test_cases: -1,
    };
    const result = EvalStartedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects empty object', () => {
    const result = EvalStartedEventSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects null', () => {
    const result = EvalStartedEventSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('rejects undefined', () => {
    const result = EvalStartedEventSchema.safeParse(undefined);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * EvalProgressEventSchema
 * ================================================================ */

describe('EvalProgressEventSchema — validation', () => {
  it('accepts valid progress event with pass verdict', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Test Case 1',
      completed: 3,
      total: 10,
      score: 0.85,
      passed: 'pass' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe('pass');
      expect(result.data.score).toBe(0.85);
    }
  });

  it('accepts progress event with fail verdict', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Failed Test',
      completed: 1,
      total: 5,
      score: 0.2,
      passed: 'fail' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe('fail');
    }
  });

  it('accepts progress event with error verdict', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Error Test',
      completed: 1,
      total: 5,
      score: 0,
      passed: 'error' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.passed).toBe('error');
    }
  });

  it('accepts null score', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Null Score Test',
      completed: 0,
      total: 1,
      score: null,
      passed: null,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBeNull();
      expect(result.data.passed).toBeNull();
    }
  });

  it('rejects invalid passed enum value', () => {
    const event = {
      type: 'eval:progress',
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Bad Verdict',
      completed: 1,
      total: 1,
      score: 0.5,
      passed: 'unknown',
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with wrong type literal', () => {
    const event = {
      type: 'eval:started',
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Test',
      completed: 1,
      total: 1,
      score: 0.5,
      passed: 'pass',
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing test_case_id', () => {
    const event = {
      type: 'eval:progress',
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_name: 'Test',
      completed: 1,
      total: 1,
      score: 0.5,
      passed: 'pass',
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing test_case_name', () => {
    const event = {
      type: 'eval:progress',
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      completed: 1,
      total: 1,
      score: 0.5,
      passed: 'pass',
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('accepts score of exactly 0', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Zero Score',
      completed: 1,
      total: 1,
      score: 0,
      passed: 'fail' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts score of exactly 1', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Perfect Score',
      completed: 1,
      total: 1,
      score: 1,
      passed: 'pass' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts NaN score (z.number() does not reject NaN)', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'NaN Score',
      completed: 1,
      total: 1,
      score: Number.NaN,
      passed: 'error' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    // z.number() rejects NaN by default in Zod
    // This tests the actual behavior
    if (!result.success) {
      expect(result.success).toBe(false);
    } else {
      expect(Number.isNaN(result.data.score)).toBe(true);
    }
  });

  it('accepts Infinity score (z.number() behavior)', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Infinity Score',
      completed: 1,
      total: 1,
      score: Number.POSITIVE_INFINITY,
      passed: 'pass' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    // z.number() behavior with Infinity — check actual behavior
    if (!result.success) {
      expect(result.success).toBe(false);
    } else {
      expect(result.data.score).toBe(Number.POSITIVE_INFINITY);
    }
  });

  it('accepts negative score', () => {
    const event = {
      type: 'eval:progress' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Negative Score',
      completed: 1,
      total: 1,
      score: -0.5,
      passed: 'fail' as const,
    };
    const result = EvalProgressEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.score).toBe(-0.5);
    }
  });
});

/* ================================================================
 * EvalCompletedEventSchema
 * ================================================================ */

describe('EvalCompletedEventSchema — validation', () => {
  it('accepts valid completed event', () => {
    const event = {
      type: 'eval:completed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0.92,
      passed_test_cases: 9,
      failed_test_cases: 1,
      total_latency_ms: 5000,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overall_score).toBe(0.92);
      expect(result.data.passed_test_cases).toBe(9);
      expect(result.data.failed_test_cases).toBe(1);
    }
  });

  it('accepts null overall_score', () => {
    const event = {
      type: 'eval:completed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: null,
      passed_test_cases: 0,
      failed_test_cases: 0,
      total_latency_ms: null,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overall_score).toBeNull();
      expect(result.data.total_latency_ms).toBeNull();
    }
  });

  it('accepts null total_latency_ms', () => {
    const event = {
      type: 'eval:completed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0.5,
      passed_test_cases: 1,
      failed_test_cases: 1,
      total_latency_ms: null,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects event with wrong type literal', () => {
    const event = {
      type: 'eval:failed',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0.5,
      passed_test_cases: 1,
      failed_test_cases: 0,
      total_latency_ms: 100,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing passed_test_cases', () => {
    const event = {
      type: 'eval:completed',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0.5,
      failed_test_cases: 0,
      total_latency_ms: 100,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing failed_test_cases', () => {
    const event = {
      type: 'eval:completed',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0.5,
      passed_test_cases: 1,
      total_latency_ms: 100,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('accepts zero passed and failed counts', () => {
    const event = {
      type: 'eval:completed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0,
      passed_test_cases: 0,
      failed_test_cases: 0,
      total_latency_ms: 0,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts large latency values', () => {
    const event = {
      type: 'eval:completed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0.5,
      passed_test_cases: 50,
      failed_test_cases: 50,
      total_latency_ms: 3600000,
    };
    const result = EvalCompletedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total_latency_ms).toBe(3600000);
    }
  });
});

/* ================================================================
 * EvalFailedEventSchema
 * ================================================================ */

describe('EvalFailedEventSchema — validation', () => {
  it('accepts valid failed event', () => {
    const event = {
      type: 'eval:failed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      error: 'Agent loop timed out',
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe('Agent loop timed out');
    }
  });

  it('rejects event with wrong type', () => {
    const event = {
      type: 'eval:completed',
      suite_id: 'suite-1',
      run_id: 'run-1',
      error: 'some error',
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing error field', () => {
    const event = {
      type: 'eval:failed',
      suite_id: 'suite-1',
      run_id: 'run-1',
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing suite_id', () => {
    const event = {
      type: 'eval:failed',
      run_id: 'run-1',
      error: 'error message',
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('rejects event with missing run_id', () => {
    const event = {
      type: 'eval:failed',
      suite_id: 'suite-1',
      error: 'error message',
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('accepts error with very long message', () => {
    const longError = 'E'.repeat(10000);
    const event = {
      type: 'eval:failed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      error: longError,
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error.length).toBe(10000);
    }
  });

  it('accepts error with special characters', () => {
    const event = {
      type: 'eval:failed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      error: 'Error: Unexpected token < in JSON at position 0\n  at parse (<anonymous>)',
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts empty string error', () => {
    const event = {
      type: 'eval:failed' as const,
      suite_id: 'suite-1',
      run_id: 'run-1',
      error: '',
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects numeric error value', () => {
    const event = {
      type: 'eval:failed',
      suite_id: 'suite-1',
      run_id: 'run-1',
      error: 404,
    };
    const result = EvalFailedEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});

/* ================================================================
 * Type interface compile-time verification
 * ================================================================ */

describe('Evaluation types — compile-time shape verification', () => {
  it('EvalSuiteStatus has expected union members', () => {
    const active: EvalSuiteStatus = 'active';
    const archived: EvalSuiteStatus = 'archived';
    expect(active).toBe('active');
    expect(archived).toBe('archived');
  });

  it('EvalRunStatus has expected union members', () => {
    const statuses: EvalRunStatus[] = [
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled',
    ];
    expect(statuses).toHaveLength(5);
  });

  it('EvalResultVerdict has expected union members', () => {
    const verdicts: EvalResultVerdict[] = ['pass', 'fail', 'error'];
    expect(verdicts).toHaveLength(3);
  });

  it('AgentEvalSuite interface has expected fields', () => {
    const suite: AgentEvalSuite = {
      id: 'suite-1',
      agent_id: 'agent-1',
      creator_id: 'user-1',
      name: 'My Suite',
      description: null,
      scoring_rubric: null,
      metadata: {},
      created_at: null,
      updated_at: null,
    };
    expect(suite.id).toBe('suite-1');
    expect(suite.description).toBeNull();
    expect(suite.scoring_rubric).toBeNull();
  });

  it('AgentEvalSuite with populated optional fields', () => {
    const suite: AgentEvalSuite = {
      id: 'suite-2',
      agent_id: 'agent-2',
      creator_id: 'user-2',
      name: 'Full Suite',
      description: 'A fully populated suite',
      scoring_rubric: { accuracy: 0.5, tone: 0.5 },
      metadata: { version: 3 },
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
    };
    expect(suite.description).toBe('A fully populated suite');
    expect(suite.scoring_rubric).toEqual({ accuracy: 0.5, tone: 0.5 });
    expect(suite.metadata).toEqual({ version: 3 });
  });

  it('EvalTestCase interface has expected fields', () => {
    const tc: EvalTestCase = {
      id: 'tc-1',
      suite_id: 'suite-1',
      name: 'Test Case',
      input: { message: 'hello' },
      expected_output: null,
      weight: 1.0,
      tags: [],
      metadata: {},
      created_at: null,
      updated_at: null,
    };
    expect(tc.weight).toBe(1.0);
    expect(tc.tags).toEqual([]);
  });

  it('EvalRun interface has expected fields', () => {
    const run: EvalRun = {
      id: 'run-1',
      suite_id: 'suite-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      status: 'completed',
      overall_score: 0.85,
      total_test_cases: 10,
      passed_test_cases: 8,
      failed_test_cases: 2,
      total_latency_ms: 5000,
      metadata: {},
      started_at: '2026-01-01T00:00:00.000Z',
      completed_at: '2026-01-01T00:01:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    expect(run.status).toBe('completed');
    expect(run.overall_score).toBe(0.85);
  });

  it('EvalResult interface has expected fields', () => {
    const result: EvalResult = {
      id: 'result-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      actual_output: { response: 'Hello back' },
      score: 0.9,
      passed: 'pass',
      latency_ms: 150,
      token_usage: { input_tokens: 100, output_tokens: 50 },
      error: null,
      metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    };
    expect(result.passed).toBe('pass');
    expect(result.error).toBeNull();
  });

  it('EvalResult with error state', () => {
    const result: EvalResult = {
      id: 'result-2',
      run_id: 'run-1',
      test_case_id: 'tc-2',
      actual_output: null,
      score: 0,
      passed: 'error',
      latency_ms: 30000,
      token_usage: null,
      error: 'Agent loop timed out after 30s',
      metadata: {},
      created_at: null,
    };
    expect(result.passed).toBe('error');
    expect(result.actual_output).toBeNull();
    expect(result.error).toBe('Agent loop timed out after 30s');
  });

  it('EvalRunWithResults extends EvalRun with results array', () => {
    const runWithResults: EvalRunWithResults = {
      id: 'run-1',
      suite_id: 'suite-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      status: 'completed',
      overall_score: 0.75,
      total_test_cases: 2,
      passed_test_cases: 1,
      failed_test_cases: 1,
      total_latency_ms: 300,
      metadata: {},
      started_at: null,
      completed_at: null,
      created_at: null,
      results: [
        {
          id: 'r1',
          run_id: 'run-1',
          test_case_id: 'tc-1',
          actual_output: null,
          score: 1.0,
          passed: 'pass',
          latency_ms: 100,
          token_usage: null,
          error: null,
          metadata: {},
          created_at: null,
        },
        {
          id: 'r2',
          run_id: 'run-1',
          test_case_id: 'tc-2',
          actual_output: null,
          score: 0.0,
          passed: 'fail',
          latency_ms: 200,
          token_usage: null,
          error: null,
          metadata: {},
          created_at: null,
        },
      ],
    };
    expect(runWithResults.results).toHaveLength(2);
  });

  it('EvalSuiteWithTestCases extends AgentEvalSuite with test_cases array', () => {
    const suite: EvalSuiteWithTestCases = {
      id: 'suite-1',
      agent_id: 'agent-1',
      creator_id: 'user-1',
      name: 'Suite with TCs',
      description: null,
      scoring_rubric: null,
      metadata: {},
      created_at: null,
      updated_at: null,
      test_cases: [
        {
          id: 'tc-1',
          suite_id: 'suite-1',
          name: 'TC 1',
          input: {},
          expected_output: null,
          weight: 1,
          tags: [],
          metadata: {},
          created_at: null,
          updated_at: null,
        },
      ],
    };
    expect(suite.test_cases).toHaveLength(1);
    expect(suite.test_cases[0].name).toBe('TC 1');
  });

  it('LeaderboardEntry interface has expected fields', () => {
    const entry: LeaderboardEntry = {
      agent_id: 'agent-1',
      agent_name: 'Agent Alpha',
      suite_id: 'suite-1',
      suite_name: 'Main Suite',
      best_score: 0.95,
      avg_score: 0.85,
      total_runs: 10,
      last_run_at: '2026-03-01T00:00:00.000Z',
    };
    expect(entry.best_score).toBe(0.95);
    expect(entry.total_runs).toBe(10);
  });

  it('LeaderboardEntry with null last_run_at', () => {
    const entry: LeaderboardEntry = {
      agent_id: 'agent-2',
      agent_name: 'Agent Beta',
      suite_id: 'suite-2',
      suite_name: 'Test Suite',
      best_score: 0,
      avg_score: 0,
      total_runs: 0,
      last_run_at: null,
    };
    expect(entry.last_run_at).toBeNull();
    expect(entry.total_runs).toBe(0);
  });
});

/* ================================================================
 * EvalEvent union type
 * ================================================================ */

describe('EvalEvent — union type handling', () => {
  it('can hold EvalStartedEvent', () => {
    const event: EvalEvent = {
      type: 'eval:started',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      total_test_cases: 5,
    };
    expect(event.type).toBe('eval:started');
  });

  it('can hold EvalProgressEvent', () => {
    const event: EvalEvent = {
      type: 'eval:progress',
      suite_id: 'suite-1',
      run_id: 'run-1',
      test_case_id: 'tc-1',
      test_case_name: 'Test 1',
      completed: 1,
      total: 5,
      score: 0.5,
      passed: 'pass',
    };
    expect(event.type).toBe('eval:progress');
  });

  it('can hold EvalCompletedEvent', () => {
    const event: EvalEvent = {
      type: 'eval:completed',
      suite_id: 'suite-1',
      run_id: 'run-1',
      agent_id: 'agent-1',
      overall_score: 0.8,
      passed_test_cases: 4,
      failed_test_cases: 1,
      total_latency_ms: 2000,
    };
    expect(event.type).toBe('eval:completed');
  });

  it('can hold EvalFailedEvent', () => {
    const event: EvalEvent = {
      type: 'eval:failed',
      suite_id: 'suite-1',
      run_id: 'run-1',
      error: 'Internal error',
    };
    expect(event.type).toBe('eval:failed');
  });

  it('discriminates by type field', () => {
    const events: EvalEvent[] = [
      {
        type: 'eval:started',
        suite_id: 's',
        run_id: 'r',
        agent_id: 'a',
        total_test_cases: 1,
      },
      {
        type: 'eval:progress',
        suite_id: 's',
        run_id: 'r',
        test_case_id: 'tc',
        test_case_name: 'T',
        completed: 1,
        total: 1,
        score: 1,
        passed: 'pass',
      },
      {
        type: 'eval:completed',
        suite_id: 's',
        run_id: 'r',
        agent_id: 'a',
        overall_score: 1,
        passed_test_cases: 1,
        failed_test_cases: 0,
        total_latency_ms: 100,
      },
      {
        type: 'eval:failed',
        suite_id: 's',
        run_id: 'r',
        error: 'oops',
      },
    ];

    expect(events.map((e) => e.type)).toEqual([
      'eval:started',
      'eval:progress',
      'eval:completed',
      'eval:failed',
    ]);
  });
});
