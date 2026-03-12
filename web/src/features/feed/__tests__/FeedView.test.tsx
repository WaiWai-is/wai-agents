import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
      display_name: 'Bob',
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

describe('FeedView', () => {
  let api: WaiAgentsApi;

  beforeEach(() => {
    api = createMockApi();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the feed module container', () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    expect(screen.getByLabelText('feed-module')).toBeInTheDocument();
  });

  it('renders tab buttons for all feed types', () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    expect(screen.getByRole('tab', { name: 'For You' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Trending' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Following' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'New' })).toBeInTheDocument();
  });

  it('shows loading skeletons on initial load', () => {
    const slowApi = createMockApi({
      listFeed: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<FeedView api={slowApi} currentUser={currentUser} />);
    // Skeleton cards have aria-hidden="true"
    const skeletons = document.querySelectorAll('.feed-skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders feed items after loading', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
      expect(screen.getByText('Writing Assistant')).toBeInTheDocument();
    });
  });

  it('displays feed item descriptions', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('An amazing agent for coding')).toBeInTheDocument();
    });
  });

  it('displays creator name', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
  });

  it('switches tabs when clicked', async () => {
    const user = userEvent.setup();
    render(<FeedView api={api} currentUser={currentUser} />);

    await waitFor(() => {
      expect(screen.getByText('Cool AI Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('tab', { name: 'Trending' }));

    await waitFor(() => {
      expect(api.listFeed).toHaveBeenCalledWith('trending', expect.any(Object));
    });
  });

  it('calls correct API for each tab kind', async () => {
    const user = userEvent.setup();
    render(<FeedView api={api} currentUser={currentUser} />);

    await waitFor(() => {
      expect(api.listFeed).toHaveBeenCalledWith('for_you', expect.any(Object));
    });

    await user.click(screen.getByRole('tab', { name: 'Following' }));
    await waitFor(() => {
      expect(api.listFeed).toHaveBeenCalledWith('following', expect.any(Object));
    });

    await user.click(screen.getByRole('tab', { name: 'New' }));
    await waitFor(() => {
      expect(api.listFeed).toHaveBeenCalledWith('new', expect.any(Object));
    });
  });

  it('shows empty state when feed has no items', async () => {
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

  it('shows error banner when feed load fails', async () => {
    const errorApi = createMockApi({
      listFeed: vi.fn().mockRejectedValue(new Error('Failed to load feed')),
    });
    render(<FeedView api={errorApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load feed')).toBeInTheDocument();
    });
  });

  it('shows "Load more" button when there are more items', async () => {
    const moreApi = createMockApi({
      listFeed: vi.fn().mockResolvedValue({
        items: [makeFeedItem()],
        page_info: { next_cursor: 'cursor-1', has_more: true },
      }),
    });
    render(<FeedView api={moreApi} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  it('shows detail panel placeholder when no item is selected', async () => {
    render(<FeedView api={api} currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Select an item to view details')).toBeInTheDocument();
    });
  });
});
