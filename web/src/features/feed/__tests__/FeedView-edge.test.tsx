import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WaiAgentsApi } from '@/lib/api/services';
import type { SessionUser } from '@/lib/state/session-store';
import type { FeedItem } from '@/lib/types';
import { FeedView } from '../FeedView';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: 'feed-1',
    creator_id: 'user-2',
    type: 'agent',
    reference_id: 'agent-1',
    reference_type: 'agent',
    title: 'Cool AI Agent',
    description: 'An amazing agent for coding',
    thumbnail_url: null,
    quality_score: 8.5,
    trending_score: 7.2,
    like_count: 42,
    fork_count: 5,
    view_count: 200,
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
    creator: {
      id: 'user-2',
      username: 'bob',
      display_name: 'Bob Builder',
      avatar_url: null,
    },
    liked_by_me: false,
    ...overrides,
  };
}

const currentUser: SessionUser = {
  id: 'user-1',
  username: 'alice',
  display_name: 'Alice',
  email: 'alice@test.com',
  avatar_url: null,
  bio: null,
};

function createMockApi(overrides: Partial<WaiAgentsApi> = {}): WaiAgentsApi {
  return {
    listFeed: vi.fn().mockResolvedValue({
      items: [
        makeFeedItem(),
        makeFeedItem({
          id: 'feed-2',
          title: 'Writing Assistant',
          description: 'Helps write better',
          like_count: 20,
          fork_count: 3,
          view_count: 100,
          creator: { id: 'user-3', username: 'carol', display_name: 'Carol', avatar_url: null },
        }),
      ],
      page_info: { next_cursor: null, has_more: false },
    }),
    likeFeedItem: vi.fn().mockResolvedValue({ status: 'liked' }),
    unlikeFeedItem: vi.fn().mockResolvedValue(undefined),
    forkAgent: vi.fn().mockResolvedValue({ agent: { id: 'forked' } }),
    ...overrides,
  } as unknown as WaiAgentsApi;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('FeedView edge cases', () => {
  let api: WaiAgentsApi;

  beforeEach(() => {
    api = createMockApi();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /* ---- Feed items rendering ---- */

  it('renders feed items with titles', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
      expect(screen.getByText('Writing Assistant')).toBeInTheDocument();
    });
  });

  it('renders feed item descriptions', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('An amazing agent for coding')).toBeInTheDocument();
      expect(screen.getByText('Helps write better')).toBeInTheDocument();
    });
  });

  it('renders like counts for each feed item', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
    });
  });

  it('renders fork counts for each feed item', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  /* ---- Like / unlike toggle ---- */

  it('toggles like state optimistically when clicking like button', async () => {
    const singleApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ liked_by_me: false, like_count: 10 })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={singleApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Like button shows "10" as count
    const likeBtn = screen.getByText('10').closest('button')!;
    await user.click(likeBtn);

    // Count should increase to 11 optimistically
    await waitFor(() => {
      expect(screen.getByText('11')).toBeInTheDocument();
    });
    expect(singleApi.likeFeedItem).toHaveBeenCalledWith('feed-1');
  });

  it('unlikes when already liked', async () => {
    const likedApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ liked_by_me: true, like_count: 10 })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={likedApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const likeBtn = screen.getByText('10').closest('button')!;
    await user.click(likeBtn);

    await waitFor(() => {
      expect(screen.getByText('9')).toBeInTheDocument();
    });
    expect(likedApi.unlikeFeedItem).toHaveBeenCalledWith('feed-1');
  });

  it('reverts like count on API failure', async () => {
    const failLikeApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ liked_by_me: false, like_count: 10 })],
        page_info: { next_cursor: null, has_more: false },
      }),
      likeFeedItem: vi.fn().mockRejectedValue(new Error('Like failed')),
    });
    render(<FeedView api={failLikeApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const likeBtn = screen.getByText('10').closest('button')!;
    await user.click(likeBtn);

    // Should revert to original count after error
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });
    // Error banner should appear
    expect(screen.getByText('Like failed')).toBeInTheDocument();
  });

  /* ---- Like animation timer cleanup ---- */

  it('cleans up like animation timer on unmount', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const singleApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ liked_by_me: false, like_count: 10 })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    const { unmount } = render(<FeedView api={singleApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const likeBtn = screen.getByText('10').closest('button')!;
    await user.click(likeBtn);

    // Unmount while the animation timer is running
    unmount();
    // clearTimeout should have been called during cleanup
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('like-pop animation class is applied during animation', async () => {
    const singleApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ liked_by_me: false, like_count: 10 })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={singleApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const likeBtn = screen.getByText('10').closest('button')!;
    await user.click(likeBtn);

    // Immediately after click, the button should have like-pop class
    expect(likeBtn.classList.contains('like-pop')).toBe(true);
  });

  /* ---- Fork action ---- */

  it('calls forkAgent when fork action is clicked in detail panel', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      const forkBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(2)');
      expect(forkBtn).not.toBeNull();
    });

    const forkBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(2)')!;
    await user.click(forkBtn as HTMLElement);
    await waitFor(() => {
      expect(api.forkAgent).toHaveBeenCalledWith('agent-1');
    });
  });

  it('increments fork count after successful fork', async () => {
    const singleApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ fork_count: 5 })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={singleApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      const forkBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(2)');
      expect(forkBtn).not.toBeNull();
    });
    const forkBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(2)')!;
    await user.click(forkBtn as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('6')).toBeInTheDocument();
    });
  });

  it('shows error when fork fails', async () => {
    const failForkApi = createMockApi({
      forkAgent: vi.fn().mockRejectedValue(new Error('Fork denied')),
    });
    render(<FeedView api={failForkApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      const forkBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(2)');
      expect(forkBtn).not.toBeNull();
    });
    const forkBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(2)')!;
    await user.click(forkBtn as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Fork denied')).toBeInTheDocument();
    });
  });

  /* ---- Tab switching ---- */

  it('sets "For You" tab as active by default', () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    const forYouTab = screen.getByRole('tab', { name: 'For You' });
    expect(forYouTab.getAttribute('aria-selected')).toBe('true');
  });

  it('marks Trending tab as active when clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Trending' }));
    expect(screen.getByRole('tab', { name: 'Trending' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: 'For You' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('fetches new data when switching to Following tab', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Following' }));
    await waitFor(() => {
      expect(api.listFeed).toHaveBeenCalledWith('following', expect.any(Object));
    });
  });

  it('fetches new data when switching to New tab', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'New' }));
    await waitFor(() => {
      expect(api.listFeed).toHaveBeenCalledWith('new', expect.any(Object));
    });
  });

  it('uses cached data when switching back to a previously loaded tab', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    // Switch to Trending
    await user.click(screen.getByRole('tab', { name: 'Trending' }));
    await waitFor(() => {
      expect(api.listFeed).toHaveBeenCalledWith('trending', expect.any(Object));
    });

    // Switch back to For You - should use cache, not re-fetch
    const callCountBefore = (api.listFeed as ReturnType<typeof vi.fn>).mock.calls.length;
    await user.click(screen.getByRole('tab', { name: 'For You' }));

    // The listFeed call count should NOT increase for for_you since it's cached
    await waitFor(() => {
      const forYouCalls = (api.listFeed as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c: unknown[]) => c[0] === 'for_you',
      );
      // Should only have the initial call, not a second one
      expect(forYouCalls.length).toBe(1);
    });
  });

  /* ---- Empty feed state ---- */

  it('shows "Nothing here yet" for empty feed', async () => {
    const emptyApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={emptyApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
    });
  });

  /* ---- Loading skeletons ---- */

  it('displays skeleton loader cards during initial load', () => {
    const slowApi = createMockApi({
      listFeed: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<FeedView api={slowApi} currentUser={currentUser} />);
    const skeletons = document.querySelectorAll('.feed-skeleton');
    expect(skeletons.length).toBe(6);
  });

  it('skeleton cards have aria-hidden for accessibility', () => {
    const slowApi = createMockApi({
      listFeed: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<FeedView api={slowApi} currentUser={currentUser} />);
    const skeletons = document.querySelectorAll('.feed-skeleton');
    skeletons.forEach((skeleton) => {
      expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    });
  });

  /* ---- Error state ---- */

  it('shows error banner when feed API fails', async () => {
    const errApi = createMockApi({
      listFeed: vi.fn().mockRejectedValue(new Error('Server error 500')),
    });
    render(<FeedView api={errApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Server error 500')).toBeInTheDocument();
    });
  });

  it('hides error banner when switching tabs after error', async () => {
    const errApi = createMockApi({
      listFeed: vi
        .fn()
        .mockRejectedValueOnce(new Error('First load failed'))
        .mockResolvedValue({
          items: [makeFeedItem()],
          page_info: { next_cursor: null, has_more: false },
        }),
    });
    render(<FeedView api={errApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('First load failed')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('tab', { name: 'Trending' }));

    await waitFor(() => {
      expect(screen.queryByText('First load failed')).not.toBeInTheDocument();
    });
  });

  /* ---- Load more / infinite scroll ---- */

  it('shows "Load more" button when has_more is true', async () => {
    const pagedApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem()],
        page_info: { next_cursor: 'cursor-2', has_more: true },
      }),
    });
    render(<FeedView api={pagedApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  it('does not show "Load more" when has_more is false', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('loads more items when Load more button is clicked', async () => {
    const pagedApi = createMockApi({
      listFeed: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeFeedItem({ id: 'feed-1', title: 'First Agent' })],
          page_info: { next_cursor: 'cursor-2', has_more: true },
        })
        .mockResolvedValueOnce({
          items: [makeFeedItem({ id: 'feed-3', title: 'Third Agent' })],
          page_info: { next_cursor: null, has_more: false },
        }),
    });
    render(<FeedView api={pagedApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('First Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.getByText('Third Agent')).toBeInTheDocument();
    });
    // Both items should still be visible (merged)
    expect(screen.getByText('First Agent')).toBeInTheDocument();
  });

  it('shows "Loading..." on Load more button while fetching', async () => {
    const pagedApi = createMockApi({
      listFeed: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeFeedItem()],
          page_info: { next_cursor: 'cursor-2', has_more: true },
        })
        .mockReturnValueOnce(new Promise(() => {})),
    });
    render(<FeedView api={pagedApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('disables Load more button while loading more', async () => {
    const pagedApi = createMockApi({
      listFeed: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeFeedItem()],
          page_info: { next_cursor: 'cursor-2', has_more: true },
        })
        .mockReturnValueOnce(new Promise(() => {})),
    });
    render(<FeedView api={pagedApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Load more'));

    await waitFor(() => {
      const btn = screen.getByText('Loading...').closest('button');
      expect(btn).toBeDisabled();
    });
  });

  /* ---- Feed item card rendering ---- */

  it('renders creator initials when no avatar', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      // "Bob Builder" -> initials "BB"
      expect(screen.getAllByText('BB').length).toBeGreaterThan(0);
    });
  });

  it('renders creator name in card', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Bob Builder')).toBeInTheDocument();
      expect(screen.getByText('Carol')).toBeInTheDocument();
    });
  });

  it('renders type icon as placeholder when no thumbnail', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      // The TypeIcon renders an SVG with the first letter of the type
      const typeIcons = document.querySelectorAll('.feed-card-thumb-placeholder');
      expect(typeIcons.length).toBeGreaterThan(0);
    });
  });

  it('renders thumbnail image when provided', async () => {
    const thumbApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ thumbnail_url: 'https://example.com/thumb.jpg' })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={thumbApi} currentUser={currentUser} />);
    await waitFor(() => {
      const img = screen.getByAltText('Cool AI Agent');
      expect(img).toHaveAttribute('src', 'https://example.com/thumb.jpg');
    });
  });

  /* ---- Detail panel ---- */

  it('shows detail panel when a feed item is selected', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      // Detail panel should show stats using class-based selectors
      const statsLabels = document.querySelectorAll('.feed-detail-stat-label');
      const labels = Array.from(statsLabels).map((el) => el.textContent);
      expect(labels).toContain('Views');
      expect(labels).toContain('Quality');
      expect(labels).toContain('Trending');
    });
  });

  it('shows quality score in detail panel', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      expect(screen.getByText('8.5')).toBeInTheDocument();
    });
  });

  it('shows type badge in detail panel', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      const badge = document.querySelector('.feed-type-badge');
      expect(badge).toBeInTheDocument();
      expect(badge?.textContent).toBe('agent');
    });
  });

  it('shows share button in detail panel', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      // Share is the 3rd action button
      const shareBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(3)');
      expect(shareBtn).not.toBeNull();
      expect(shareBtn!.textContent).toContain('Share');
    });
  });

  it('clears selected item when switching tabs', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Select an item
    await user.click(screen.getByText('Cool AI Agent'));
    await waitFor(() => {
      expect(screen.getByText('Views')).toBeInTheDocument();
    });

    // Switch tabs should clear selection
    await user.click(screen.getByRole('tab', { name: 'Trending' }));
    await waitFor(() => {
      expect(screen.getByText('Select an item to view details')).toBeInTheDocument();
    });
  });

  /* ---- Feed item without title ---- */

  it('renders fallback title when item has no title', async () => {
    const noTitleApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ id: 'feed-no-title', title: null })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={noTitleApi} currentUser={currentUser} />);
    await waitFor(() => {
      // Fallback: `${item.type} · ${item.id.slice(0, 8)}` = "agent · feed-no-"
      const titleEl = document.querySelector('.feed-card-title');
      expect(titleEl).not.toBeNull();
      expect(titleEl!.textContent).toContain('feed-no-');
    });
  });

  /* ---- Creator fallback ---- */

  it('shows "Unknown" when creator data is missing', async () => {
    const noCreatorApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ creator: undefined })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={noCreatorApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    });
  });

  it('shows username when display_name is null', async () => {
    const usernameOnlyApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [
          makeFeedItem({
            creator: { id: 'user-x', username: 'xenomorph', display_name: null, avatar_url: null },
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={usernameOnlyApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('xenomorph').length).toBeGreaterThan(0);
    });
  });

  /* ---- Like button in detail panel ---- */

  it('shows "Like" text when not liked in detail panel', async () => {
    const singleApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ liked_by_me: false })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={singleApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      // Like is the 1st action button in detail panel
      const likeBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(1)');
      expect(likeBtn).not.toBeNull();
      expect(likeBtn!.textContent).toContain('Like');
      expect(likeBtn!.textContent).not.toContain('Liked');
    });
  });

  it('shows "Liked" text when already liked in detail panel', async () => {
    const likedApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem({ liked_by_me: true })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<FeedView api={likedApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Cool AI Agent'));

    await waitFor(() => {
      // Like is the 1st action button in detail panel
      const likeBtn = document.querySelector('.feed-detail-actions .feed-action-btn:nth-child(1)');
      expect(likeBtn).not.toBeNull();
      expect(likeBtn!.textContent).toContain('Liked');
    });
  });

  /* ---- Duplicate prevention ---- */

  it('deduplicates feed items with the same id when loading more', async () => {
    const dupeApi = createMockApi({
      listFeed: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeFeedItem({ id: 'feed-1', title: 'Agent Alpha' })],
          page_info: { next_cursor: 'c2', has_more: true },
        })
        .mockResolvedValueOnce({
          items: [
            makeFeedItem({ id: 'feed-1', title: 'Agent Alpha' }),
            makeFeedItem({ id: 'feed-2', title: 'Agent Beta' }),
          ],
          page_info: { next_cursor: null, has_more: false },
        }),
    });
    render(<FeedView api={dupeApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.getByText('Agent Beta')).toBeInTheDocument();
    });
    // Agent Alpha should appear only once
    expect(screen.getAllByText('Agent Alpha').length).toBe(1);
  });
});
