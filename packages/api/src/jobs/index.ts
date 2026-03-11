export { trendingQueue, trendingWorker, scheduleTrending } from './trending-worker.js';
export { memoryDecayQueue, memoryDecayWorker, scheduleMemoryDecay } from './memory-decay-worker.js';
export {
  articleCollectionQueue,
  articleCollectionWorker,
  scheduleArticleCollection,
} from './article-collection-worker.js';
export { reflectionQueue, reflectionWorker, scheduleReflection } from './agent-reflection-worker.js';
export {
  idempotencyCleanupQueue,
  idempotencyCleanupWorker,
  scheduleIdempotencyCleanup,
} from './idempotency-cleanup-worker.js';
export { connection, createQueue, createWorker } from './queue.js';

import { scheduleTrending } from './trending-worker.js';
import { scheduleMemoryDecay } from './memory-decay-worker.js';
import { scheduleArticleCollection } from './article-collection-worker.js';
import { scheduleReflection } from './agent-reflection-worker.js';
import { scheduleIdempotencyCleanup } from './idempotency-cleanup-worker.js';

/**
 * Initialize all BullMQ workers and schedule repeating jobs.
 * Call this once at application startup.
 */
export async function initWorkers(): Promise<void> {
  await scheduleTrending();
  await scheduleMemoryDecay();
  await scheduleArticleCollection();
  await scheduleReflection();
  await scheduleIdempotencyCleanup();
  console.log('BullMQ workers initialized: trending (15m), memory-decay (1h), article-collection (30m), agent-reflection (6h), idempotency-cleanup (1h)');
}
