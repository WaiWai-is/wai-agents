/**
 * In-memory token blacklist for server-side JWT revocation on logout.
 *
 * Tokens are stored with their expiry time and automatically pruned
 * to prevent unbounded memory growth.
 */

const blacklistedTokens = new Map<string, number>(); // token -> expiryTimestamp (ms)

const PRUNE_INTERVAL_MS = 60_000; // prune every 60 seconds

let pruneTimer: ReturnType<typeof setInterval> | null = null;

function startPruneTimer() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [token, expiry] of blacklistedTokens) {
      if (expiry <= now) {
        blacklistedTokens.delete(token);
      }
    }
  }, PRUNE_INTERVAL_MS);
  // Allow the process to exit even if the timer is running
  if (pruneTimer && typeof pruneTimer === 'object' && 'unref' in pruneTimer) {
    pruneTimer.unref();
  }
}

/**
 * Add a token to the blacklist. It will be automatically removed after `expiresInMs`.
 */
export function blacklistToken(token: string, expiresInMs: number): void {
  blacklistedTokens.set(token, Date.now() + expiresInMs);
  startPruneTimer();
}

/**
 * Check if a token has been blacklisted (revoked).
 */
export function isTokenBlacklisted(token: string): boolean {
  const expiry = blacklistedTokens.get(token);
  if (expiry === undefined) return false;
  if (expiry <= Date.now()) {
    blacklistedTokens.delete(token);
    return false;
  }
  return true;
}

/**
 * Clear all blacklisted tokens. For testing only.
 */
export function clearBlacklist(): void {
  blacklistedTokens.clear();
}
