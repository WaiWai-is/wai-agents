import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WaiAgentsApi } from '@/lib/api/services';
import type { SessionUser } from '@/lib/state/session-store';
import type { AgentRating, MarketplaceAgent, MarketplaceCategory } from '@/lib/types';
import { MarketplaceView } from '../MarketplaceView';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeAgent(overrides: Partial<MarketplaceAgent> = {}): MarketplaceAgent {
  return {
    id: 'agent-1',
    creator_id: 'user-2',
    name: 'Code Helper',
    slug: 'code-helper',
    description: 'Helps you write better code',
    avatar_url: null,
    model: 'claude-sonnet-4-6',
    category: 'Coding & Development',
    visibility: 'public',
    usage_count: 150,
    rating_count: 12,
    average_rating: 4.2,
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

function makeRating(overrides: Partial<AgentRating> = {}): AgentRating {
  return {
    id: 'rating-1',
    user_id: 'user-3',
    rating: 5,
    review: 'Great agent!',
    created_at: '2026-03-10T12:00:00Z',
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
    listMarketplace: vi.fn().mockResolvedValue({
      items: [
        makeAgent(),
        makeAgent({
          id: 'agent-2',
          name: 'Writing Wizard',
          slug: 'writing-wizard',
          description: 'Helps with writing',
          category: 'Writing & Content',
          average_rating: 3.8,
          rating_count: 5,
          usage_count: 80,
        }),
      ],
      page_info: { next_cursor: null, has_more: false },
    }),
    searchMarketplace: vi.fn().mockResolvedValue({
      items: [makeAgent()],
      page_info: { next_cursor: null, has_more: false },
    }),
    marketplaceCategories: vi.fn().mockResolvedValue({
      categories: [
        { slug: 'coding', name: 'Coding & Development', description: 'Code tools' },
        { slug: 'writing', name: 'Writing & Content', description: 'Writing tools' },
      ] as MarketplaceCategory[],
    }),
    marketplaceAgent: vi.fn().mockResolvedValue({
      agent: makeAgent(),
      ratings: [makeRating()],
    }),
    rateAgent: vi.fn().mockResolvedValue({
      rating: { id: 'rating-new', rating: 4, review: null },
    }),
    startAgentConversation: vi.fn().mockResolvedValue({
      conversation: {
        id: 'conv-new',
        type: 'agent',
        title: null,
        agent_id: 'agent-1',
        created_at: '2026-03-10T12:00:00Z',
      },
    }),
    forkAgent: vi.fn().mockResolvedValue({ agent: { id: 'forked-1' } }),
    ...overrides,
  } as unknown as WaiAgentsApi;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('MarketplaceView edge cases', () => {
  let api: WaiAgentsApi;
  let onOpenConversation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    api = createMockApi();
    onOpenConversation = vi.fn();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /* ---- Grid rendering ---- */

  it('renders agent cards in the marketplace grid', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      // Agent names appear in both the card grid and profile panel (auto-selected first)
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Writing Wizard').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders agent descriptions in cards', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Helps you write better code')).toBeInTheDocument();
      expect(screen.getByText('Helps with writing')).toBeInTheDocument();
    });
  });

  it('renders category badges on agent cards', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Coding & Development').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Writing & Content').length).toBeGreaterThan(0);
    });
  });

  it('renders agent count in header', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('2 agents')).toBeInTheDocument();
    });
  });

  it('renders singular agent count for one agent', async () => {
    const singleApi = createMockApi({
      listMarketplace: vi.fn().mockResolvedValue({
        items: [makeAgent()],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(
      <MarketplaceView
        api={singleApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('1 agent')).toBeInTheDocument();
    });
  });

  it('shows "Loading agents..." while fetching', () => {
    const slowApi = createMockApi({
      listMarketplace: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(
      <MarketplaceView
        api={slowApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    expect(screen.getByText('Loading agents...')).toBeInTheDocument();
  });

  /* ---- Rating display ---- */

  it('renders star rating display with rating value', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('4.2').length).toBeGreaterThan(0);
    });
  });

  it('renders rating count in parentheses', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('(12)').length).toBeGreaterThan(0);
    });
  });

  it('renders usage count with chat icon', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('150').length).toBeGreaterThan(0);
    });
  });

  /* ---- Search functionality ---- */

  it('renders search input with placeholder', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    expect(screen.getByPlaceholderText('Search agents...')).toBeInTheDocument();
  });

  it('debounces search input and calls searchMarketplace', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const searchInput = screen.getByPlaceholderText('Search agents...');
    await user.type(searchInput, 'code');

    // Advance past debounce
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(api.searchMarketplace).toHaveBeenCalledWith('code', expect.any(Object));
    });
  });

  it('calls listMarketplace when search is cleared', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const searchInput = screen.getByPlaceholderText('Search agents...');
    await user.type(searchInput, 'x');
    vi.advanceTimersByTime(400);

    await waitFor(() => {
      expect(api.searchMarketplace).toHaveBeenCalled();
    });

    await user.clear(searchInput);
    vi.advanceTimersByTime(400);

    // listMarketplace should be called again when query is cleared
    await waitFor(() => {
      const calls = (api.listMarketplace as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(calls).toBeGreaterThanOrEqual(2);
    });
  });

  /* ---- Category filtering ---- */

  it('renders "All" category pill as active by default', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      const allTab = screen.getByRole('tab', { name: 'All' });
      expect(allTab.getAttribute('aria-selected')).toBe('true');
    });
  });

  it('renders category pills from API', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Coding & Development' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Writing & Content' })).toBeInTheDocument();
    });
  });

  it('filters agents when clicking a category pill', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Writing Wizard').length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('tab', { name: 'Writing & Content' }));

    await waitFor(() => {
      // "Code Helper" might still be in the profile panel if it was selected, but card should be filtered
      const cards = document.querySelectorAll('.mp-agent-card');
      expect(cards.length).toBe(1);
      expect(screen.getAllByText('Writing Wizard').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows all agents when clicking "All" after filtering', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('tab', { name: 'Writing & Content' }));
    await waitFor(() => {
      const cards = document.querySelectorAll('.mp-agent-card');
      expect(cards.length).toBe(1);
    });

    await user.click(screen.getByRole('tab', { name: 'All' }));
    await waitFor(() => {
      const cards = document.querySelectorAll('.mp-agent-card');
      expect(cards.length).toBe(2);
    });
  });

  it('uses fallback categories when API fails', async () => {
    const failCatApi = createMockApi({
      marketplaceCategories: vi.fn().mockRejectedValue(new Error('Categories unavailable')),
    });
    render(
      <MarketplaceView
        api={failCatApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Productivity' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Education' })).toBeInTheDocument();
    });
  });

  /* ---- Empty state ---- */

  it('shows empty state when no agents match', async () => {
    const emptyApi = createMockApi({
      listMarketplace: vi.fn().mockResolvedValue({
        items: [],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(
      <MarketplaceView
        api={emptyApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No agents found.')).toBeInTheDocument();
    });
  });

  it('shows category-specific empty state when filtering', async () => {
    const noMatchApi = createMockApi({
      listMarketplace: vi.fn().mockResolvedValue({
        items: [makeAgent({ category: 'Coding & Development' })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(
      <MarketplaceView
        api={noMatchApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByRole('tab', { name: 'Writing & Content' }));

    await waitFor(() => {
      expect(screen.getByText('No agents found in "Writing & Content".')).toBeInTheDocument();
    });
  });

  /* ---- Error state ---- */

  it('shows error banner when marketplace API fails', async () => {
    const errApi = createMockApi({
      listMarketplace: vi.fn().mockRejectedValue(new Error('Server error 500')),
    });
    render(
      <MarketplaceView
        api={errApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Server error 500')).toBeInTheDocument();
    });
  });

  /* ---- Load more / pagination ---- */

  it('shows "Load more" button when has_more is true', async () => {
    const pagedApi = createMockApi({
      listMarketplace: vi.fn().mockResolvedValue({
        items: [makeAgent()],
        page_info: { next_cursor: 'cursor-2', has_more: true },
      }),
    });
    render(
      <MarketplaceView
        api={pagedApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  it('does not show "Load more" when has_more is false', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
  });

  it('loads more agents when Load more is clicked', async () => {
    const pagedApi = createMockApi({
      listMarketplace: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeAgent({ id: 'agent-1', name: 'First Agent' })],
          page_info: { next_cursor: 'cursor-2', has_more: true },
        })
        .mockResolvedValueOnce({
          items: [makeAgent({ id: 'agent-3', name: 'Third Agent' })],
          page_info: { next_cursor: null, has_more: false },
        }),
    });
    render(
      <MarketplaceView
        api={pagedApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('First Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.getByText('Third Agent')).toBeInTheDocument();
    });
    expect(screen.getByText('First Agent')).toBeInTheDocument();
  });

  it('shows "Loading..." on Load more button while fetching', async () => {
    const pagedApi = createMockApi({
      listMarketplace: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeAgent()],
          page_info: { next_cursor: 'cursor-2', has_more: true },
        })
        .mockReturnValueOnce(new Promise(() => {})),
    });
    render(
      <MarketplaceView
        api={pagedApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('disables Load more button while loading', async () => {
    const pagedApi = createMockApi({
      listMarketplace: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeAgent()],
          page_info: { next_cursor: 'cursor-2', has_more: true },
        })
        .mockReturnValueOnce(new Promise(() => {})),
    });
    render(
      <MarketplaceView
        api={pagedApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
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

  it('deduplicates agents when loading more', async () => {
    const dupeApi = createMockApi({
      listMarketplace: vi
        .fn()
        .mockResolvedValueOnce({
          items: [makeAgent({ id: 'agent-1', name: 'Alpha Agent' })],
          page_info: { next_cursor: 'c2', has_more: true },
        })
        .mockResolvedValueOnce({
          items: [
            makeAgent({ id: 'agent-1', name: 'Alpha Agent' }),
            makeAgent({ id: 'agent-2', name: 'Beta Agent' }),
          ],
          page_info: { next_cursor: null, has_more: false },
        }),
    });
    render(
      <MarketplaceView
        api={dupeApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Alpha Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Load more'));

    await waitFor(() => {
      expect(screen.getByText('Beta Agent')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Alpha Agent').length).toBe(1);
  });

  /* ---- Agent card click / selection ---- */

  it('selects first agent by default after loading', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      const selectedCards = document.querySelectorAll('.mp-agent-card.selected');
      expect(selectedCards.length).toBe(1);
    });
  });

  it('shows profile panel for selected agent', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      const profilePanel = screen.getByLabelText('agent-profile-panel');
      expect(profilePanel).toBeInTheDocument();
    });
  });

  it('shows "Select an agent to view its profile" when no agent is selected', async () => {
    const emptyApi = createMockApi({
      listMarketplace: vi.fn().mockResolvedValue({
        items: [],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(
      <MarketplaceView
        api={emptyApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Select an agent to view its profile.')).toBeInTheDocument();
    });
  });

  it('switches selected agent when clicking a different card', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Writing Wizard'));

    await waitFor(() => {
      expect(api.marketplaceAgent).toHaveBeenCalledWith('writing-wizard');
    });
  });

  /* ---- Profile panel details ---- */

  it('shows agent name in profile panel header', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      const profileTitle = document.querySelector('.mp-profile-title h3');
      expect(profileTitle?.textContent).toBe('Code Helper');
    });
  });

  it('shows agent description in About section', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument();
      // Description appears in both card grid and profile panel About section
      expect(screen.getAllByText('Helps you write better code').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows model detail in profile panel', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Model')).toBeInTheDocument();
    });
  });

  it('shows visibility detail in profile panel', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Visibility')).toBeInTheDocument();
    });
  });

  it('renders initials when agent has no avatar', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      // "Code Helper" -> initials "CH"
      expect(screen.getAllByText('CH').length).toBeGreaterThan(0);
    });
  });

  it('renders avatar image when agent has avatar_url', async () => {
    const avatarApi = createMockApi({
      listMarketplace: vi.fn().mockResolvedValue({
        items: [makeAgent({ avatar_url: 'https://example.com/avatar.png' })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(
      <MarketplaceView
        api={avatarApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      const img = screen.getByAltText('Code Helper');
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.png');
    });
  });

  /* ---- Try It / Start Conversation ---- */

  it('shows "Try It" button in profile panel', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Try It')).toBeInTheDocument();
    });
  });

  it('calls startAgentConversation and onOpenConversation when Try It is clicked', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Try It')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Try It'));

    await waitFor(() => {
      expect(api.startAgentConversation).toHaveBeenCalledWith('agent-1');
      expect(onOpenConversation).toHaveBeenCalledWith('conv-new');
    });
  });

  it('shows "Starting..." while starting conversation', async () => {
    const slowApi = createMockApi({
      startAgentConversation: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(
      <MarketplaceView
        api={slowApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Try It')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Try It'));

    await waitFor(() => {
      expect(screen.getByText('Starting...')).toBeInTheDocument();
    });
  });

  it('shows error when starting conversation fails', async () => {
    const failApi = createMockApi({
      startAgentConversation: vi.fn().mockRejectedValue(new Error('Cannot start chat')),
    });
    render(
      <MarketplaceView
        api={failApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Try It')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Try It'));

    await waitFor(() => {
      expect(screen.getByText('Cannot start chat')).toBeInTheDocument();
    });
  });

  /* ---- Fork action ---- */

  it('shows Fork button in profile panel', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      // "Fork" text appears in both the button label and the SVG <title>
      expect(screen.getAllByText('Fork').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('calls forkAgent when Fork button is clicked', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('.mp-fork-btn')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(document.querySelector('.mp-fork-btn') as HTMLElement);

    await waitFor(() => {
      expect(api.forkAgent).toHaveBeenCalledWith('agent-1');
    });
  });

  it('shows success info after forking', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('.mp-fork-btn')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(document.querySelector('.mp-fork-btn') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Forked "Code Helper" to your agents')).toBeInTheDocument();
    });
  });

  it('shows "Forking..." while fork is pending', async () => {
    const slowApi = createMockApi({
      forkAgent: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(
      <MarketplaceView
        api={slowApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('.mp-fork-btn')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(document.querySelector('.mp-fork-btn') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Forking...')).toBeInTheDocument();
    });
  });

  it('shows error when fork fails', async () => {
    const failApi = createMockApi({
      forkAgent: vi.fn().mockRejectedValue(new Error('Fork denied')),
    });
    render(
      <MarketplaceView
        api={failApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('.mp-fork-btn')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(document.querySelector('.mp-fork-btn') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Fork denied')).toBeInTheDocument();
    });
  });

  /* ---- Rating submission ---- */

  it('shows "Rate this agent" section in profile panel', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Rate this agent')).toBeInTheDocument();
    });
  });

  it('disables Submit Review button when no rating is selected', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      const submitBtn = screen.getByText('Submit Review');
      expect(submitBtn).toBeDisabled();
    });
  });

  it('enables Submit Review button after selecting a star rating', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Rate this agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const star4 = screen.getByLabelText('4 stars');
    await user.click(star4);

    await waitFor(() => {
      const submitBtn = screen.getByText('Submit Review');
      expect(submitBtn).not.toBeDisabled();
    });
  });

  it('calls rateAgent on submit', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Rate this agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('4 stars'));
    await user.click(screen.getByText('Submit Review'));

    await waitFor(() => {
      expect(api.rateAgent).toHaveBeenCalledWith('agent-1', 4, undefined);
    });
  });

  it('shows review textarea with placeholder', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Write a review (optional)...')).toBeInTheDocument();
    });
  });

  it('submits rating with review text', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Rate this agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('5 stars'));
    await user.type(screen.getByPlaceholderText('Write a review (optional)...'), 'Amazing agent!');
    await user.click(screen.getByText('Submit Review'));

    await waitFor(() => {
      expect(api.rateAgent).toHaveBeenCalledWith('agent-1', 5, 'Amazing agent!');
    });
  });

  it('shows error when rating submission fails', async () => {
    const failRateApi = createMockApi({
      rateAgent: vi.fn().mockRejectedValue(new Error('Rate limit exceeded')),
    });
    render(
      <MarketplaceView
        api={failRateApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Rate this agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('3 stars'));
    await user.click(screen.getByText('Submit Review'));

    await waitFor(() => {
      expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
    });
  });

  /* ---- Recent ratings ---- */

  it('renders recent ratings list', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Recent Ratings')).toBeInTheDocument();
      expect(screen.getByText('Great agent!')).toBeInTheDocument();
    });
  });

  /* ---- Profile loading skeleton ---- */

  it('shows skeleton loading when profile is loading', async () => {
    const slowProfileApi = createMockApi({
      marketplaceAgent: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(
      <MarketplaceView
        api={slowProfileApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      const skeletons = document.querySelectorAll('.mp-profile-loading .skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  /* ---- Debounce cleanup ---- */

  it('cleans up debounce timer on unmount', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const { unmount } = render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Helper').length).toBeGreaterThanOrEqual(1);
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByPlaceholderText('Search agents...'), 'test');

    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  /* ---- Info banner auto-dismiss ---- */

  it('auto-dismisses info banner after 4 seconds', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(document.querySelector('.mp-fork-btn')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(document.querySelector('.mp-fork-btn') as HTMLElement);

    await waitFor(() => {
      expect(screen.getByText('Forked "Code Helper" to your agents')).toBeInTheDocument();
    });

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.queryByText('Forked "Code Helper" to your agents')).not.toBeInTheDocument();
    });
  });

  /* ---- Profile panel shows "No description provided." when missing ---- */

  it('shows fallback description when agent has no description', async () => {
    const noDescApi = createMockApi({
      listMarketplace: vi.fn().mockResolvedValue({
        items: [makeAgent({ description: null })],
        page_info: { next_cursor: null, has_more: false },
      }),
      marketplaceAgent: vi.fn().mockResolvedValue({
        agent: makeAgent({ description: null }),
        ratings: [],
      }),
    });
    render(
      <MarketplaceView
        api={noDescApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('No description provided.')).toBeInTheDocument();
    });
  });
});
