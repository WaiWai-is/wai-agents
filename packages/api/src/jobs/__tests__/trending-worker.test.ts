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
    // Store the processor so we can call it in tests
    (createWorkerRef as { processor: typeof processor }).processor = processor;
    return { on: vi.fn(), close: vi.fn() };
  }),
}));

// Reference to capture the worker processor function
const createWorkerRef: { processor: ((job: { data: unknown; name: string; id?: string }) => Promise<void>) | null } = {
  processor: null,
};

// Import after mocks are set up
import { createWorker } from '../queue.js';

// Trigger the module to register the processor
await import('../trending-worker.js');

describe('trendingWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes the UPDATE SQL to recalculate trending scores', async () => {
    sqlMock.mockResolvedValueOnce([]);

    await createWorkerRef.processor!({ data: {}, name: 'recalculate-trending' });

    expect(sqlMock).toHaveBeenCalledTimes(1);
    // The SQL tagged template is called with template strings array + values
    // Verify it was called (the actual SQL is embedded in the template)
    const callArgs = sqlMock.mock.calls[0];
    // Tagged template calls pass [TemplateStringsArray, ...values]
    // First arg is the template strings array
    const templateStrings = callArgs[0] as unknown as TemplateStringsArray;
    const fullQuery = Array.isArray(templateStrings)
      ? templateStrings.join('')
      : String(templateStrings);
    expect(fullQuery).toContain('UPDATE feed_items');
    expect(fullQuery).toContain('trending_score');
    expect(fullQuery).toContain('like_count');
    expect(fullQuery).toContain('fork_count');
    expect(fullQuery).toContain('view_count');
    expect(fullQuery).toContain('POWER');
  });

  it('propagates database errors to BullMQ for retry', async () => {
    const dbError = new Error('connection refused');
    sqlMock.mockRejectedValueOnce(dbError);

    await expect(
      createWorkerRef.processor!({ data: {}, name: 'recalculate-trending' }),
    ).rejects.toThrow('connection refused');
  });

  it('handles empty feed_items table without error', async () => {
    // UPDATE on empty table returns empty result - no rows affected
    sqlMock.mockResolvedValueOnce([]);

    await expect(
      createWorkerRef.processor!({ data: {}, name: 'recalculate-trending' }),
    ).resolves.toBeUndefined();
  });
});

describe('scheduleTrending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clears existing repeatable jobs before adding a new one', async () => {
    const existingJobs = [
      { key: 'old-job-key-1' },
      { key: 'old-job-key-2' },
    ];
    mockGetRepeatableJobs.mockResolvedValueOnce(existingJobs);

    const { scheduleTrending } = await import('../trending-worker.js');
    await scheduleTrending();

    expect(mockRemoveRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('old-job-key-1');
    expect(mockRemoveRepeatableByKey).toHaveBeenCalledWith('old-job-key-2');
  });

  it('schedules a repeatable job every 15 minutes', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([]);

    const { scheduleTrending } = await import('../trending-worker.js');
    await scheduleTrending();

    expect(mockAdd).toHaveBeenCalledWith(
      'recalculate-trending',
      {},
      { repeat: { every: 15 * 60 * 1000 } },
    );
  });

  it('works when no existing repeatable jobs are present', async () => {
    mockGetRepeatableJobs.mockResolvedValueOnce([]);

    const { scheduleTrending } = await import('../trending-worker.js');
    await scheduleTrending();

    expect(mockRemoveRepeatableByKey).not.toHaveBeenCalled();
    expect(mockAdd).toHaveBeenCalledTimes(1);
  });
});

describe('trending score formula analysis', () => {
  it('formula produces higher scores for items with more engagement', () => {
    // Testing the formula: score = (likes*2 + forks*3 + views*0.1) / (age_hours + 2)^1.5
    const calcScore = (likes: number, forks: number, views: number, ageHours: number) =>
      (likes * 2 + forks * 3 + views * 0.1) / Math.pow(ageHours + 2, 1.5);

    const highEngagement = calcScore(100, 50, 1000, 1);
    const lowEngagement = calcScore(1, 0, 10, 1);

    expect(highEngagement).toBeGreaterThan(lowEngagement);
  });

  it('formula decays scores over time', () => {
    const calcScore = (likes: number, forks: number, views: number, ageHours: number) =>
      (likes * 2 + forks * 3 + views * 0.1) / Math.pow(ageHours + 2, 1.5);

    const fresh = calcScore(10, 5, 100, 0);   // brand new
    const aged = calcScore(10, 5, 100, 48);    // 2 days old
    const ancient = calcScore(10, 5, 100, 720); // 30 days old

    expect(fresh).toBeGreaterThan(aged);
    expect(aged).toBeGreaterThan(ancient);
  });

  it('formula never divides by zero (age_hours + 2 floor)', () => {
    const calcScore = (likes: number, forks: number, views: number, ageHours: number) =>
      (likes * 2 + forks * 3 + views * 0.1) / Math.pow(ageHours + 2, 1.5);

    // Even at age 0, denominator is 2^1.5 = ~2.83
    const score = calcScore(0, 0, 0, 0);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(0); // 0 engagement = 0 score
  });

  it('formula handles zero engagement gracefully', () => {
    const calcScore = (likes: number, forks: number, views: number, ageHours: number) =>
      (likes * 2 + forks * 3 + views * 0.1) / Math.pow(ageHours + 2, 1.5);

    const score = calcScore(0, 0, 0, 100);
    expect(score).toBe(0);
  });

  it('forks are weighted more heavily than likes in the formula', () => {
    const calcScore = (likes: number, forks: number, views: number, ageHours: number) =>
      (likes * 2 + forks * 3 + views * 0.1) / Math.pow(ageHours + 2, 1.5);

    const likesOnly = calcScore(3, 0, 0, 1);   // 3 likes = 6 points
    const forksOnly = calcScore(0, 2, 0, 1);   // 2 forks = 6 points

    // Same engagement points, so same score
    expect(likesOnly).toBeCloseTo(forksOnly);

    // But 3 forks > 3 likes at same count
    const threeLikes = calcScore(3, 0, 0, 1);
    const threeForks = calcScore(0, 3, 0, 1);
    expect(threeForks).toBeGreaterThan(threeLikes);
  });
});
