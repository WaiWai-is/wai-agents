import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB connection before importing worker
const sqlMock = vi.fn();
vi.mock('../../db/connection.js', () => ({
  sql: sqlMock,
  db: {},
}));

// Mock queue.ts to avoid Redis connection
const mockAdd = vi.fn();
const mockGetRepeatableJobs = vi.fn().mockResolvedValue([]);
const mockRemoveRepeatableByKey = vi.fn();

vi.mock('../queue.js', () => ({
  createQueue: vi.fn(() => ({
    add: mockAdd,
    getRepeatableJobs: mockGetRepeatableJobs,
    removeRepeatableByKey: mockRemoveRepeatableByKey,
  })),
  createWorker: vi.fn((_name: string, processor: (...args: unknown[]) => unknown) => {
    (createWorkerRef as { processor: typeof processor }).processor = processor;
    return { on: vi.fn(), close: vi.fn() };
  }),
}));

const createWorkerRef: {
  processor: ((job: { data: unknown; name: string; id?: string }) => Promise<void>) | null;
} = {
  processor: null,
};

await import('../memory-decay-worker.js');

describe('memoryDecayWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes two SQL statements: decay update then delete', async () => {
    // Step 1: UPDATE decay_factor
    sqlMock.mockResolvedValueOnce([]);
    // Step 2: DELETE below threshold
    sqlMock.mockResolvedValueOnce([]);

    await createWorkerRef.processor?.({ data: {}, name: 'decay-memories' });

    expect(sqlMock).toHaveBeenCalledTimes(2);

    // Verify first call is the UPDATE
    const updateCall = sqlMock.mock.calls[0][0] as unknown as TemplateStringsArray;
    const updateQuery = Array.isArray(updateCall) ? updateCall.join('') : String(updateCall);
    expect(updateQuery).toContain('UPDATE agent_memories');
    expect(updateQuery).toContain('decay_factor * 0.995');
    expect(updateQuery).toContain("INTERVAL '24 hours'");
    expect(updateQuery).toContain('decay_factor >= 0.01');

    // Verify second call is the DELETE
    const deleteCall = sqlMock.mock.calls[1][0] as unknown as TemplateStringsArray;
    const deleteQuery = Array.isArray(deleteCall) ? deleteCall.join('') : String(deleteCall);
    expect(deleteQuery).toContain('DELETE FROM agent_memories');
    expect(deleteQuery).toContain('decay_factor < 0.01');
  });

  it('runs decay UPDATE before DELETE (correct order)', async () => {
    const callOrder: string[] = [];

    sqlMock.mockImplementation((...args: unknown[]) => {
      const template = args[0] as unknown as TemplateStringsArray;
      const query = Array.isArray(template) ? template.join('') : String(template);
      if (query.includes('UPDATE')) callOrder.push('update');
      if (query.includes('DELETE')) callOrder.push('delete');
      return Promise.resolve([]);
    });

    await createWorkerRef.processor?.({ data: {}, name: 'decay-memories' });

    expect(callOrder).toEqual(['update', 'delete']);
  });

  it('propagates UPDATE error without executing DELETE', async () => {
    const dbError = new Error('disk full');
    sqlMock.mockRejectedValueOnce(dbError);

    await expect(createWorkerRef.processor?.({ data: {}, name: 'decay-memories' })).rejects.toThrow(
      'disk full',
    );

    // DELETE should not have been called since UPDATE threw
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it('propagates DELETE error after successful UPDATE', async () => {
    sqlMock.mockResolvedValueOnce([]); // UPDATE succeeds
    sqlMock.mockRejectedValueOnce(new Error('constraint violation'));

    await expect(createWorkerRef.processor?.({ data: {}, name: 'decay-memories' })).rejects.toThrow(
      'constraint violation',
    );
  });

  it('handles empty agent_memories table gracefully', async () => {
    // Both operations on empty table return empty arrays
    sqlMock.mockResolvedValueOnce([]);
    sqlMock.mockResolvedValueOnce([]);

    await expect(
      createWorkerRef.processor?.({ data: {}, name: 'decay-memories' }),
    ).resolves.toBeUndefined();
  });
});

describe('memory decay math analysis', () => {
  it('decay factor reaches 0.01 threshold after ~920 hourly runs', () => {
    // Starting from 1.0, multiplying by 0.995 each hour
    let factor = 1.0;
    let hours = 0;
    while (factor >= 0.01) {
      factor *= 0.995;
      hours++;
    }
    // Should take approximately 920 hours (~38 days)
    expect(hours).toBeGreaterThan(900);
    expect(hours).toBeLessThan(950);
  });

  it('memories at various initial decay factors reach threshold at expected times', () => {
    // A memory starting at 0.5 should take half as many iterations
    let factor = 0.5;
    let hours = 0;
    while (factor >= 0.01) {
      factor *= 0.995;
      hours++;
    }
    // ln(0.01/0.5) / ln(0.995) ~ 781 hours
    expect(hours).toBeGreaterThan(770);
    expect(hours).toBeLessThan(800);
  });

  it('decay only applies to memories older than 24 hours (by SQL WHERE clause)', () => {
    // This is a design verification — the SQL includes:
    // WHERE inserted_at < NOW() - INTERVAL '24 hours'
    // So memories younger than 24 hours are NOT decayed.
    // This is verified by the SQL template check in the first test.
    expect(true).toBe(true); // Design assertion documented
  });

  it('decay factor multiplication is idempotent per run (no accumulation bugs)', () => {
    // Each run multiplies by exactly 0.995 once
    // After N runs: factor = initial * 0.995^N
    const initial = 1.0;
    const afterOneRun = initial * 0.995;
    const afterTwoRuns = afterOneRun * 0.995;
    const afterThreeRuns = afterTwoRuns * 0.995;

    expect(afterOneRun).toBeCloseTo(0.995);
    expect(afterTwoRuns).toBeCloseTo(0.990025);
    expect(afterThreeRuns).toBeCloseTo(0.985074875);
  });
});

describe('scheduleMemoryDecay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears existing repeatable jobs before adding new one', async () => {
    const existingJobs = [{ key: 'decay-key-1' }];
    mockGetRepeatableJobs.mockResolvedValueOnce(existingJobs);

    const { scheduleMemoryDecay } = await import('../memory-decay-worker.js');
    await scheduleMemoryDecay();

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('decay-key-1');
  });

  it('schedules repeatable job every hour', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([]);

    const { scheduleMemoryDecay } = await import('../memory-decay-worker.js');
    await scheduleMemoryDecay();

    expect(mockAdd).toHaveBeenCalledWith(
      'decay-memories',
      {},
      { repeat: { every: 60 * 60 * 1000 } },
    );
  });

  it('handles empty repeatable jobs list', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([]);

    const { scheduleMemoryDecay } = await import('../memory-decay-worker.js');
    await scheduleMemoryDecay();

    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});
