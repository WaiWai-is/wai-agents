'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WaiAgentsApi } from '@/lib/api';
import type { SessionUser } from '@/lib/state/session-store';
import type { FeedItem } from '@/lib/types';
import { getErrorMessage } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type FeedKind = 'for_you' | 'trending' | 'following' | 'new';

interface FeedViewProps {
  api: WaiAgentsApi;
  currentUser: SessionUser;
}

const TABS: Array<{ key: FeedKind; label: string }> = [
  { key: 'for_you', label: 'For You' },
  { key: 'trending', label: 'Trending' },
  { key: 'following', label: 'Following' },
  { key: 'new', label: 'New' },
];

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

function HeartIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--color-error)" stroke="none">
      <title>Liked</title>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Like</title>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function ForkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Fork</title>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>Share</title>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function TypeIcon({ type }: { type: string }) {
  const label = type.charAt(0).toUpperCase();
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <title>Type icon</title>
      <rect width="32" height="32" rx="6" fill="var(--color-accent-subtle)" />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fill="var(--color-accent-primary)"
        fontSize="14"
        fontWeight="600"
      >
        {label}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="feed-card-polished feed-skeleton" aria-hidden="true">
      <div className="feed-card-thumb skeleton-shimmer" />
      <div className="feed-card-body">
        <div className="skeleton-line skeleton-shimmer" style={{ width: '80%', height: 16 }} />
        <div
          className="skeleton-line skeleton-shimmer"
          style={{ width: '60%', height: 12, marginTop: 8 }}
        />
        <div className="feed-card-author" style={{ marginTop: 12 }}>
          <div className="avatar-circle skeleton-shimmer" style={{ width: 20, height: 20 }} />
          <div className="skeleton-line skeleton-shimmer" style={{ width: 80, height: 12 }} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getCreatorInitials(item: FeedItem): string {
  if (item.creator?.display_name) return getInitials(item.creator.display_name);
  if (item.creator?.username) return getInitials(item.creator.username);
  return '??';
}

function getCreatorName(item: FeedItem): string {
  if (item.creator?.display_name) return item.creator.display_name;
  if (item.creator?.username) return item.creator.username;
  return 'Unknown';
}

function timeAgo(dateIso: string): string {
  const now = Date.now();
  const then = new Date(dateIso).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateIso).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

type TabCache = {
  items: FeedItem[];
  cursor: string | null;
  hasMore: boolean;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FeedView({ api, currentUser: _currentUser }: FeedViewProps) {
  const [kind, setKind] = useState<FeedKind>('for_you');
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [likeAnimating, setLikeAnimating] = useState<string | null>(null);

  const cacheRef = useRef<Partial<Record<FeedKind, TabCache>>>({});

  const selected = items.find((i) => i.id === selectedId) ?? null;

  /* ---- Load feed ---- */

  const load = useCallback(
    async (nextKind: FeedKind, nextCursor?: string | null) => {
      const isInitial = !nextCursor;
      if (isInitial) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      try {
        const response = await api.listFeed(nextKind, {
          limit: 20,
          cursor: nextCursor ?? undefined,
        });

        setItems((prev) => {
          const base = isInitial ? [] : prev;
          const ids = new Set(base.map((i) => i.id));
          const merged = [...base];
          for (const item of response.items) {
            if (!ids.has(item.id)) merged.push(item);
          }

          /* update cache */
          cacheRef.current[nextKind] = {
            items: merged,
            cursor: response.page_info.next_cursor,
            hasMore: response.page_info.has_more,
          };

          return merged;
        });

        setCursor(response.page_info.next_cursor);
        setHasMore(response.page_info.has_more);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [api],
  );

  /* ---- Tab switch (use cache if available) ---- */

  useEffect(() => {
    const cached = cacheRef.current[kind];
    if (cached) {
      setItems(cached.items);
      setCursor(cached.cursor);
      setHasMore(cached.hasMore);
      setLoading(false);
      return;
    }
    void load(kind);
  }, [kind, load]);

  /* ---- Like toggle (optimistic) ---- */

  const onLikeToggle = async (item: FeedItem) => {
    const wasLiked = !!liked[item.id];
    const newCount = wasLiked ? Math.max(0, item.like_count - 1) : item.like_count + 1;

    /* optimistic */
    setLiked((prev) => ({ ...prev, [item.id]: !wasLiked }));
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, like_count: newCount } : i)));

    /* animate */
    setLikeAnimating(item.id);
    setTimeout(() => setLikeAnimating(null), 300);

    try {
      if (wasLiked) {
        await api.unlikeFeedItem(item.id);
      } else {
        await api.likeFeedItem(item.id);
      }
    } catch (err) {
      /* revert */
      setLiked((prev) => ({ ...prev, [item.id]: wasLiked }));
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, like_count: item.like_count } : i)),
      );
      setError(getErrorMessage(err));
    }
  };

  /* ---- Fork ---- */

  const onFork = async (item: FeedItem) => {
    setError(null);
    try {
      await api.forkAgent(item.reference_id);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, fork_count: i.fork_count + 1 } : i)),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  /* ---- Share (copy link) ---- */

  const onShare = (item: FeedItem) => {
    const url = `${window.location.origin}/feed/${item.id}`;
    void navigator.clipboard.writeText(url);
  };

  /* ---- Render ---- */

  return (
    <section className="feed-view" aria-label="feed-module">
      <style>{feedStyles}</style>

      {/* Tab bar */}
      <div className="feed-tabs" role="tablist" aria-label="feed-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === kind}
            className={`feed-tab ${tab.key === kind ? 'feed-tab-active' : ''}`}
            onClick={() => {
              setSelectedId(null);
              setKind(tab.key);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && <div className="error-banner">{error}</div>}

      {/* Content area */}
      <div className="feed-content-grid">
        {/* Left: card grid */}
        <div className="feed-cards-area">
          {loading ? (
            <div className="feed-card-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="feed-empty">
              <p>Nothing here yet</p>
            </div>
          ) : (
            <>
              <div className="feed-card-grid">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`feed-card-polished ${selectedId === item.id ? 'feed-card-selected' : ''}`}
                    onClick={() => setSelectedId(item.id)}
                  >
                    {/* Thumbnail */}
                    <div className="feed-card-thumb">
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt={item.title ?? 'Feed item'}
                          loading="lazy"
                        />
                      ) : (
                        <div className="feed-card-thumb-placeholder">
                          <TypeIcon type={item.type} />
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="feed-card-body">
                      <h3 className="feed-card-title">
                        {item.title || `${item.type} · ${item.id.slice(0, 8)}`}
                      </h3>
                      {item.description && <p className="feed-card-desc">{item.description}</p>}

                      {/* Author row */}
                      <div className="feed-card-author">
                        <span className="avatar-circle avatar-sm">{getCreatorInitials(item)}</span>
                        <span className="feed-card-author-name">{getCreatorName(item)}</span>
                      </div>

                      {/* Stats row */}
                      <div className="feed-card-stats">
                        <button
                          type="button"
                          className={`feed-stat-btn ${likeAnimating === item.id ? 'like-pop' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onLikeToggle(item);
                          }}
                        >
                          <HeartIcon filled={!!liked[item.id]} />
                          <span>{item.like_count}</span>
                        </button>
                        <span className="feed-stat">
                          <ForkIcon />
                          <span>{item.fork_count}</span>
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="feed-load-more">
                  <button
                    type="button"
                    className="feed-load-more-btn"
                    onClick={() => void load(kind, cursor)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: detail panel */}
        <aside className="feed-detail-panel">
          {selected ? (
            <div className="feed-detail-inner">
              {/* Large thumbnail */}
              <div className="feed-detail-thumb">
                {selected.thumbnail_url ? (
                  <img src={selected.thumbnail_url} alt={selected.title ?? 'Feed item'} />
                ) : (
                  <div className="feed-card-thumb-placeholder">
                    <TypeIcon type={selected.type} />
                  </div>
                )}
              </div>

              {/* Title + type badge */}
              <div className="feed-detail-header">
                <h2 className="feed-detail-title">{selected.title || selected.id.slice(0, 12)}</h2>
                <span className="feed-type-badge">{selected.type}</span>
              </div>

              {/* Description */}
              {selected.description && <p className="feed-detail-desc">{selected.description}</p>}

              {/* Author */}
              <div className="feed-detail-author">
                <span className="avatar-circle avatar-md">{getCreatorInitials(selected)}</span>
                <div>
                  <div className="feed-detail-author-name">{getCreatorName(selected)}</div>
                  <div className="feed-detail-author-role">Creator</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="feed-detail-actions">
                <button
                  type="button"
                  className={`feed-action-btn ${liked[selected.id] ? 'feed-action-liked' : ''}`}
                  onClick={() => void onLikeToggle(selected)}
                >
                  <HeartIcon filled={!!liked[selected.id]} />
                  <span>{liked[selected.id] ? 'Liked' : 'Like'}</span>
                </button>
                <button
                  type="button"
                  className="feed-action-btn"
                  onClick={() => void onFork(selected)}
                >
                  <ForkIcon />
                  <span>Fork</span>
                </button>
                <button type="button" className="feed-action-btn" onClick={() => onShare(selected)}>
                  <ShareIcon />
                  <span>Share</span>
                </button>
              </div>

              {/* Stats */}
              <div className="feed-detail-stats">
                <div className="feed-detail-stat">
                  <span className="feed-detail-stat-value">{selected.view_count}</span>
                  <span className="feed-detail-stat-label">Views</span>
                </div>
                <div className="feed-detail-stat">
                  <span className="feed-detail-stat-value">
                    {selected.quality_score.toFixed(1)}
                  </span>
                  <span className="feed-detail-stat-label">Quality</span>
                </div>
                <div className="feed-detail-stat">
                  <span className="feed-detail-stat-value">
                    {selected.trending_score.toFixed(1)}
                  </span>
                  <span className="feed-detail-stat-label">Trending</span>
                </div>
              </div>

              {/* Timestamp */}
              <p className="feed-detail-time">{timeAgo(selected.created_at)}</p>
            </div>
          ) : (
            <div className="feed-detail-empty">
              <p>Select an item to view details</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export function FeedPlaceholder() {
  return <section aria-label="feed-placeholder">Feed module placeholder</section>;
}

/* ------------------------------------------------------------------ */
/*  Scoped styles                                                      */
/* ------------------------------------------------------------------ */

const feedStyles = `
/* ---- Layout ---- */
.feed-view {
  display: grid;
  gap: var(--space-4);
}

/* ---- Tab bar ---- */
.feed-tabs {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.feed-tab {
  border: none;
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-default),
              color var(--duration-fast) var(--ease-default);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.feed-tab:hover {
  background: var(--color-border-primary);
  color: var(--color-text-primary);
}

.feed-tab-active {
  background: var(--color-accent-primary);
  color: #FFFFFF;
}

.feed-tab-active:hover {
  background: var(--color-accent-primary-hover);
  color: #FFFFFF;
}

/* ---- Content grid (cards + detail) ---- */
.feed-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--space-4);
  align-items: start;
}

@media (max-width: 960px) {
  .feed-content-grid {
    grid-template-columns: 1fr;
  }
}

/* ---- Card grid ---- */
.feed-card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

@media (max-width: 768px) {
  .feed-card-grid {
    grid-template-columns: 1fr;
  }
}

/* ---- Feed card ---- */
.feed-card-polished {
  all: unset;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-xl);
  background: var(--color-bg-secondary);
  overflow: hidden;
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-default),
              box-shadow var(--duration-fast) var(--ease-default),
              transform var(--duration-fast) var(--ease-default);
  box-shadow: var(--shadow-xs);
}

.feed-card-polished:hover {
  border-color: var(--color-accent-primary);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.feed-card-polished:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
}

.feed-card-selected {
  border-color: var(--color-accent-primary);
  box-shadow: var(--shadow-md);
}

/* ---- Thumbnail ---- */
.feed-card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--color-bg-tertiary);
  overflow: hidden;
}

.feed-card-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.feed-card-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- Card body ---- */
.feed-card-body {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.feed-card-title {
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  color: var(--color-text-primary);
  line-height: var(--leading-tight);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.feed-card-desc {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  line-height: var(--leading-normal);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

/* ---- Author row ---- */
.feed-card-author {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.avatar-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--color-accent-subtle);
  color: var(--color-accent-primary);
  font-weight: var(--weight-semibold);
  flex-shrink: 0;
}

.avatar-sm {
  width: 20px;
  height: 20px;
  font-size: 9px;
}

.avatar-md {
  width: 40px;
  height: 40px;
  font-size: 14px;
}

.feed-card-author-name {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

/* ---- Stats row ---- */
.feed-card-stats {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-1);
}

.feed-stat-btn,
.feed-stat {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

.feed-stat-btn {
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-default);
  border: none;
  background: none;
  padding: 0;
}

.feed-stat-btn:hover {
  color: var(--color-text-primary);
}

/* ---- Like animation ---- */
.like-pop {
  animation: likePop 300ms var(--ease-out);
}

@keyframes likePop {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

/* ---- Load more ---- */
.feed-load-more {
  display: flex;
  justify-content: center;
  padding: var(--space-4) 0;
}

.feed-load-more-btn {
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-6);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-default),
              background var(--duration-fast) var(--ease-default);
}

.feed-load-more-btn:hover {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-subtle);
}

.feed-load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ---- Empty state ---- */
.feed-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  color: var(--color-text-tertiary);
  font-size: var(--text-base);
}

/* ---- Detail panel ---- */
.feed-detail-panel {
  position: sticky;
  top: var(--space-5);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-xl);
  background: var(--color-bg-secondary);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.feed-detail-inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.feed-detail-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--color-bg-tertiary);
  overflow: hidden;
}

.feed-detail-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.feed-detail-header {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  flex-wrap: wrap;
}

.feed-detail-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
  line-height: var(--leading-tight);
  flex: 1;
  margin: 0;
}

.feed-type-badge {
  display: inline-block;
  border-radius: var(--radius-full);
  padding: 2px 10px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  background: var(--color-accent-subtle);
  color: var(--color-accent-primary);
  text-transform: capitalize;
  white-space: nowrap;
}

.feed-detail-desc {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--leading-relaxed);
  padding: 0 var(--space-4);
  margin: 0;
}

/* ---- Detail author ---- */
.feed-detail-author {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
}

.feed-detail-author-name {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-primary);
}

.feed-detail-author-role {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

/* ---- Detail actions ---- */
.feed-detail-actions {
  display: flex;
  gap: var(--space-2);
  padding: 0 var(--space-4);
}

.feed-action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-full);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: border-color var(--duration-fast) var(--ease-default),
              background var(--duration-fast) var(--ease-default);
}

.feed-action-btn:hover {
  border-color: var(--color-accent-primary);
  background: var(--color-accent-subtle);
}

.feed-action-liked {
  border-color: var(--color-error);
  color: var(--color-error);
}

.feed-action-liked:hover {
  border-color: var(--color-error);
  background: #fff0ee;
}

/* ---- Detail stats ---- */
.feed-detail-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  padding: 0 var(--space-4);
  text-align: center;
}

.feed-detail-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  border-radius: var(--radius-lg);
  background: var(--color-bg-tertiary);
}

.feed-detail-stat-value {
  font-size: var(--text-md);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}

.feed-detail-stat-label {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.feed-detail-time {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  padding: 0 var(--space-4) var(--space-4);
  margin: 0;
}

.feed-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--color-text-tertiary);
  font-size: var(--text-sm);
}

/* ---- Skeleton / shimmer ---- */
.feed-skeleton {
  pointer-events: none;
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--color-bg-tertiary) 25%,
    var(--color-border-secondary) 50%,
    var(--color-bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

.skeleton-line {
  display: block;
  border-radius: var(--radius-sm);
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ---- Mobile detail overlay ---- */
@media (max-width: 960px) {
  .feed-detail-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    top: auto;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    max-height: 70vh;
    overflow-y: auto;
    z-index: 100;
    box-shadow: var(--shadow-xl);
  }
}
`;
