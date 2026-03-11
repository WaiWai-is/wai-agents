import { createQueue, createWorker } from './queue.js';
import { sql } from '../db/connection.js';

const QUEUE_NAME = 'idempotency-cleanup';

export const idempotencyCleanupQueue = createQueue(QUEUE_NAME);

/**
 * Delete expired idempotency keys to prevent unbounded table growth.
 */
export const idempotencyCleanupWorker = createWorker(
  QUEUE_NAME,
  async () => {
    await sql`DELETE FROM idempotency_keys WHERE expires_at < NOW()`;
  },
);

/**
 * Schedule idempotency key cleanup to run every hour.
 */
export async function scheduleIdempotencyCleanup(): Promise<void> {
  const repeatableJobs = await idempotencyCleanupQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await idempotencyCleanupQueue.removeRepeatableByKey(job.key);
  }

  await idempotencyCleanupQueue.add(
    'cleanup-expired-keys',
    {},
    {
      repeat: { every: 60 * 60 * 1000 }, // 1 hour
    },
  );
}
