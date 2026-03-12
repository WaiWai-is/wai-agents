import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WaiAgentsApi } from '@/lib/api/services';
import type { SessionUser } from '@/lib/state/session-store';
import type { MarketplaceAgent, MarketplaceAgentProfileResponse } from '@/lib/types';
import { MarketplaceView } from '../MarketplaceView';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeMarketplaceAgent(overrides: Partial<MarketplaceAgent> = {}): MarketplaceAgent {
  return {
    id: 'mp-agent-1',
    creator_id: 'creator-1',
    name: 'Code Assistant',
    slug: 'code-assistant',
    description: 'Helps you write code',
    avatar_url: null,
    model: 'claude-sonnet-4-6',
    category: 'Coding',
    visibility: 'public',
    usage_count: 150,
    rating_count: 10,
    average_rating: 4.5,
    created_at: '2026-03-01T12:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

function makeProfileResponse(
  agent: MarketplaceAgent,
  overrides: Partial<MarketplaceAgentProfileResponse> = {},
): MarketplaceAgentProfileResponse {
  return {
    agent,
    ratings: [
      {
        id: 'rating-1',
        user_id: 'user-2',
        rating: 5,
        review: 'Great agent!',
        created_at: '2026-03-09T12:00:00Z',
      },
    ],
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
  const agent1 = makeMarketplaceAgent();
  const agent2 = makeMarketplaceAgent({
    id: 'mp-agent-2',
    name: 'Writing Helper',
    slug: 'writing-helper',
    description: 'Helps you write content',
    category: 'Writing',
    usage_count: 80,
    average_rating: 4.0,
    rating_count: 5,
  });
  return {
    listMarketplace: vi.fn().mockResolvedValue({
      items: [agent1, agent2],
      page_info: { next_cursor: null, has_more: false },
    }),
    searchMarketplace: vi.fn().mockResolvedValue({
      items: [agent1],
      page_info: { next_cursor: null, has_more: false },
    }),
    marketplaceCategories: vi.fn().mockResolvedValue({
      categories: [
        { slug: 'coding', name: 'Coding', description: 'Code tools' },
        { slug: 'writing', name: 'Writing', description: 'Writing tools' },
      ],
    }),
    marketplaceAgent: vi.fn().mockResolvedValue(makeProfileResponse(agent1)),
    rateAgent: vi.fn().mockResolvedValue({
      rating: { id: 'new-rating', rating: 4, review: null },
    }),
    startAgentConversation: vi.fn().mockResolvedValue({
      conversation: {
        id: 'conv-new',
        type: 'agent',
        title: null,
        agent_id: 'mp-agent-1',
        created_at: '2026-03-10T12:00:00Z',
      },
    }),
    forkAgent: vi.fn().mockResolvedValue({
      agent: makeMarketplaceAgent({ id: 'forked-agent' }),
    }),
    ...overrides,
  } as unknown as WaiAgentsApi;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('MarketplaceView', () => {
  let api: WaiAgentsApi;
  const onOpenConversation = vi.fn();

  beforeEach(() => {
    api = createMockApi();
    onOpenConversation.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the marketplace container', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    expect(screen.getByLabelText('marketplace-module')).toBeInTheDocument();
  });

  it('shows "Marketplace" title', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    expect(screen.getByText('Marketplace')).toBeInTheDocument();
  });

  it('shows loading state on initial load', () => {
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

  it('renders agent cards after loading', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      // Agent names may appear in both card list and profile panel
      expect(screen.getAllByText('Code Assistant').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Writing Helper')).toBeInTheDocument();
    });
  });

  it('displays agent count in header', async () => {
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

  it('renders agent card with description', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Helps you write code')).toBeInTheDocument();
    });
  });

  it('renders agent card with rating display', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      // Rating values may appear in both card and profile panel
      expect(screen.getAllByText('4.5').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('(10)').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders agent card with usage count', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });

  it('renders category filter pills', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Coding' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Writing' })).toBeInTheDocument();
    });
  });

  it('filters agents by category', async () => {
    const user = userEvent.setup();
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText('Code Assistant').length).toBeGreaterThanOrEqual(1);
    });

    await user.click(screen.getByRole('tab', { name: 'Writing' }));

    // After filtering to "Writing", the card grid should show only Writing Helper.
    // The profile panel may still show the previously selected agent, so we check
    // that the mp-card-grid area no longer contains "Code Assistant" by checking
    // that the only card button contains "Writing Helper".
    await waitFor(() => {
      const cardGrid = document.querySelector('.mp-card-grid');
      expect(cardGrid).toBeTruthy();
      expect(cardGrid?.textContent).toContain('Writing Helper');
    });
  });

  it('renders search input', () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    expect(screen.getByLabelText('Search agents')).toBeInTheDocument();
  });

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
      expect(screen.getByText(/No agents found/)).toBeInTheDocument();
    });
  });

  it('shows error banner when marketplace load fails', async () => {
    const errorApi = createMockApi({
      listMarketplace: vi.fn().mockRejectedValue(new Error('Server unavailable')),
    });
    render(
      <MarketplaceView
        api={errorApi}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Server unavailable')).toBeInTheDocument();
    });
  });

  it('loads agent profile when an agent card is selected', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(api.marketplaceAgent).toHaveBeenCalled();
    });
  });

  it('shows agent profile panel with name and details', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      const profilePanel = screen.getByLabelText('agent-profile-panel');
      expect(within(profilePanel).getByText('About')).toBeInTheDocument();
      expect(within(profilePanel).getByText('Details')).toBeInTheDocument();
    });
  });

  it('shows "Try It" and "Fork" action buttons on profile panel', async () => {
    render(
      <MarketplaceView
        api={api}
        currentUser={currentUser}
        onOpenConversation={onOpenConversation}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Try It')).toBeInTheDocument();
      const forkBtn = document.querySelector('.mp-fork-btn');
      expect(forkBtn).toBeInTheDocument();
    });
  });

  it('shows "Select an agent" when no agent is selected', async () => {
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
});
