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

const createWorkerRef: { processor: ((job: { data: unknown; name: string; id?: string }) => Promise<void>) | null } = {
  processor: null,
};

await import('../idempotency-cleanup-worker.js');

describe('idempotencyCleanupWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes DELETE SQL for expired idempotency keys', async () => {
    sqlMock.mockResolvedValueOnce([]);

    await createWorkerRef.processor!({ data: {}, name: 'cleanup-expired-keys' });

    expect(sqlMock).toHaveBeenCalledTimes(1);

    const callArgs = sqlMock.mock.calls[0];
    const templateStrings = callArgs[0] as unknown as TemplateStringsArray;
    const fullQuery = Array.isArray(templateStrings)
      ? templateStrings.join('')
      : String(templateStrings);
    expect(fullQuery).toContain('DELETE FROM idempotency_keys');
    expect(fullQuery).toContain('expires_at < NOW()');
  });

  it('does not delete non-expired keys (verified by SQL WHERE clause)', async () => {
    sqlMock.mockResolvedValueOnce([]);

    await createWorkerRef.processor!({ data: {}, name: 'cleanup-expired-keys' });

    // The SQL only targets expired keys — WHERE expires_at < NOW()
    const callArgs = sqlMock.mock.calls[0];
    const templateStrings = callArgs[0] as unknown as TemplateStringsArray;
    const fullQuery = Array.isArray(templateStrings)
      ? templateStrings.join('')
      : String(templateStrings);
    // Verify there's no unconditional DELETE
    expect(fullQuery).toContain('WHERE');
    expect(fullQuery).toContain('expires_at');
  });

  it('propagates database errors for BullMQ retry', async () => {
    const dbError = new Error('deadlock detected');
    sqlMock.mockRejectedValueOnce(dbError);

    await expect(
      createWorkerRef.processor!({ data: {}, name: 'cleanup-expired-keys' }),
    ).rejects.toThrow('deadlock detected');
  });

  it('handles empty idempotency_keys table without error', async () => {
    sqlMock.mockResolvedValueOnce([]);

    await expect(
      createWorkerRef.processor!({ data: {}, name: 'cleanup-expired-keys' }),
    ).resolves.toBeUndefined();
  });

  it('executes only one SQL statement per run', async () => {
    sqlMock.mockResolvedValueOnce([]);

    await createWorkerRef.processor!({ data: {}, name: 'cleanup-expired-keys' });

    expect(sqlMock).toHaveBeenCalledTimes(1);
  });
});

describe('scheduleIdempotencyCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes all existing repeatable jobs before scheduling', async () => {
    const existingJobs = [
      { key: 'cleanup-key-1' },
      { key: 'cleanup-key-2' },
      { key: 'cleanup-key-3' },
    ];
    mockGetRepeatableJobs.mockResolvedValueOnce(existingJobs);

    const { scheduleIdempotencyCleanup } = await import('../idempotency-cleanup-worker.js');
    await scheduleIdempotencyCleanup();

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledTimes(3);
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('cleanup-key-1');
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('cleanup-key-2');
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('cleanup-key-3');
  });

  it('schedules repeatable job every hour', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([]);

    const { scheduleIdempotencyCleanup } = await import('../idempotency-cleanup-worker.js');
    await scheduleIdempotencyCleanup();

    expect(mockAdd).toHaveBeenCalledWith(
      'cleanup-expired-keys',
      {},
      { repeat: { every: 60 * 60 * 1000 } },
    );
  });

  it('handles no existing repeatable jobs', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([]);

    const { scheduleIdempotencyCleanup } = await import('../idempotency-cleanup-worker.js');
    await scheduleIdempotencyCleanup();

    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from getRepeatableJobs', async () => {
    mockGetRepeatableJobs.mockRejectedValueOnce(new Error('redis connection lost'));

    const { scheduleIdempotencyCleanup } = await import('../idempotency-cleanup-worker.js');
    await expect(scheduleIdempotencyCleanup()).rejects.toThrow('redis connection lost');
  });

  it('propagates errors from removeRepeatableByKey', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([{ key: 'bad-key' }]);
    mockRemoveRepeatableByKey.mockRejectedValueOnce(new Error('permission denied'));

    const { scheduleIdempotencyCleanup } = await import('../idempotency-cleanup-worker.js');
    await expect(scheduleIdempotencyCleanup()).rejects.toThrow('permission denied');
  });
});
