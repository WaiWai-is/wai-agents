import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WaiAgentsApi } from '@/lib/api/services';
import type { Agent, AgentEvent, AgentMemory } from '@/lib/types';
import { AgentDashboardView } from '../AgentDashboardView';
import { AgentHealthIndicator } from '../AgentHealthIndicator';
import { CostBreakdown } from '../CostBreakdown';
import { MemoryViewer } from '../MemoryViewer';
import { StatsCards } from '../StatsCards';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    creator_id: 'user-1',
    name: 'Test Agent',
    slug: 'test-agent',
    description: 'A helpful test agent',
    avatar_url: null,
    system_prompt: 'You are a helpful assistant.',
    model: 'claude-sonnet-4-6',
    execution_mode: 'claude_sdk',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
    mcp_servers: [],
    visibility: 'public',
    category: 'productivity',
    usage_count: 100,
    rating_sum: 45,
    rating_count: 10,
    metadata: {},
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-10T00:00:00Z',
    ...overrides,
  };
}

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: 'evt-1',
    agent_id: 'agent-1',
    event_type: 'run',
    trigger_type: null,
    duration_ms: 1500,
    input_tokens: 100,
    output_tokens: 200,
    model: 'claude-sonnet-4-6',
    status: 'completed',
    error_code: null,
    error_message: null,
    inserted_at: '2026-03-10T10:00:00Z',
    ...overrides,
  };
}

function makeMemory(overrides: Partial<AgentMemory> = {}): AgentMemory {
  return {
    id: 'mem-1',
    agent_id: 'agent-1',
    content: 'User prefers concise responses',
    importance: 0.8,
    memory_type: 'preference',
    tags: ['communication', 'style'],
    access_count: 5,
    last_accessed_at: '2026-03-10T09:00:00Z',
    created_at: '2026-03-05T00:00:00Z',
    ...overrides,
  };
}

function createMockApi(
  options: {
    events?: AgentEvent[];
    eventsShouldReject?: boolean;
    eventsError?: string;
    eventsHasMore?: boolean;
    eventsCursor?: string | null;
    memories?: AgentMemory[];
    memoriesShouldReject?: boolean;
    memoriesError?: string;
    deleteMemoryReject?: boolean;
  } = {},
): WaiAgentsApi {
  const {
    events = [],
    eventsShouldReject = false,
    eventsError = 'API Error',
    eventsHasMore = false,
    eventsCursor = null,
    memories = [],
    memoriesShouldReject = false,
    memoriesError = 'API Error',
    deleteMemoryReject = false,
  } = options;

  return {
    listAgentEvents: vi.fn().mockImplementation(() => {
      if (eventsShouldReject) return Promise.reject(new Error(eventsError));
      return Promise.resolve({
        items: events,
        page_info: { has_more: eventsHasMore, next_cursor: eventsCursor },
      });
    }),
    listMemories: vi.fn().mockImplementation(() => {
      if (memoriesShouldReject) return Promise.reject(new Error(memoriesError));
      return Promise.resolve({ items: memories });
    }),
    deleteMemory: vi.fn().mockImplementation(() => {
      if (deleteMemoryReject) return Promise.reject(new Error('Delete failed'));
      return Promise.resolve({ success: true });
    }),
  } as unknown as WaiAgentsApi;
}

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/*  AgentDashboardView                                                 */
/* ------------------------------------------------------------------ */

describe('AgentDashboardView', () => {
  it('renders agent name in the header', async () => {
    const api = createMockApi({ events: [] });
    render(<AgentDashboardView api={api} agent={makeAgent({ name: 'My Super Agent' })} />);
    expect(screen.getByText('My Super Agent')).toBeInTheDocument();
  });

  it('renders Overview, Events, and Memories tabs', () => {
    const api = createMockApi();
    render(<AgentDashboardView api={api} agent={makeAgent()} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Memories')).toBeInTheDocument();
  });

  it('shows Overview tab as active by default', () => {
    const api = createMockApi();
    render(<AgentDashboardView api={api} agent={makeAgent()} />);
    const overviewBtn = screen.getByText('Overview');
    expect(overviewBtn.classList.contains('active')).toBe(true);
  });

  it('switches to Events tab on click', async () => {
    const events = [makeEvent()];
    const api = createMockApi({ events });
    render(<AgentDashboardView api={api} agent={makeAgent()} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Events'));

    await waitFor(() => {
      expect(api.listAgentEvents).toHaveBeenCalled();
    });
  });

  it('switches to Memories tab on click', async () => {
    const api = createMockApi({ memories: [makeMemory()] });
    render(<AgentDashboardView api={api} agent={makeAgent()} />);

    const user = userEvent.setup();
    await user.click(screen.getByText('Memories'));

    await waitFor(() => {
      expect(api.listMemories).toHaveBeenCalled();
    });
  });

  it('renders health indicator with idle status when no events', () => {
    const api = createMockApi();
    render(<AgentDashboardView api={api} agent={makeAgent()} />);
    expect(screen.getByLabelText('agent-health')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  AgentHealthIndicator                                               */
/* ------------------------------------------------------------------ */

describe('AgentHealthIndicator', () => {
  it('renders idle status with correct label', () => {
    render(<AgentHealthIndicator status="idle" />);
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByLabelText('agent-health').classList.contains('ad-health-idle')).toBe(true);
  });

  it('renders running status with correct label', () => {
    render(<AgentHealthIndicator status="running" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByLabelText('agent-health').classList.contains('ad-health-running')).toBe(
      true,
    );
  });

  it('renders error status with correct label', () => {
    render(<AgentHealthIndicator status="error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByLabelText('agent-health').classList.contains('ad-health-error')).toBe(true);
  });

  it('has agent-health aria-label', () => {
    render(<AgentHealthIndicator status="idle" />);
    expect(screen.getByLabelText('agent-health')).toBeInTheDocument();
  });

  it('renders the status dot element', () => {
    render(<AgentHealthIndicator status="running" />);
    const dot = document.querySelector('.ad-health-dot');
    expect(dot).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  StatsCards                                                         */
/* ------------------------------------------------------------------ */

describe('StatsCards', () => {
  it('renders all four stat cards', () => {
    const events = [makeEvent()];
    render(<StatsCards events={events} />);
    expect(screen.getByText('Total Executions')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.getByText('Avg Latency')).toBeInTheDocument();
  });

  it('shows correct execution count', () => {
    const events = [makeEvent({ id: 'e1' }), makeEvent({ id: 'e2' }), makeEvent({ id: 'e3' })];
    render(<StatsCards events={events} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calculates success rate correctly', () => {
    const events = [
      makeEvent({ id: 'e1', status: 'completed' }),
      makeEvent({ id: 'e2', status: 'completed' }),
      makeEvent({ id: 'e3', status: 'failed' }),
      makeEvent({ id: 'e4', status: 'completed' }),
    ];
    render(<StatsCards events={events} />);
    // 3 completed out of 4 = 75%
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows 0% success rate when no events', () => {
    render(<StatsCards events={[]} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('calculates total tokens correctly', () => {
    const events = [
      makeEvent({ id: 'e1', input_tokens: 100, output_tokens: 200 }),
      makeEvent({ id: 'e2', input_tokens: 150, output_tokens: 300 }),
    ];
    render(<StatsCards events={events} />);
    // Total: (100+200) + (150+300) = 750
    expect(screen.getByText('750')).toBeInTheDocument();
  });

  it('handles null tokens gracefully', () => {
    const events = [makeEvent({ id: 'e1', input_tokens: null, output_tokens: null })];
    render(<StatsCards events={events} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('calculates average latency correctly', () => {
    const events = [
      makeEvent({ id: 'e1', duration_ms: 1000 }),
      makeEvent({ id: 'e2', duration_ms: 2000 }),
      makeEvent({ id: 'e3', duration_ms: 3000 }),
    ];
    render(<StatsCards events={events} />);
    // Avg: (1000+2000+3000)/3 = 2000ms
    expect(screen.getByText('2,000ms')).toBeInTheDocument();
  });

  it('shows 0ms latency when no events have duration', () => {
    const events = [makeEvent({ id: 'e1', duration_ms: null })];
    render(<StatsCards events={events} />);
    expect(screen.getByText('0ms')).toBeInTheDocument();
  });

  it('shows 100% success rate when all events are completed', () => {
    const events = [
      makeEvent({ id: 'e1', status: 'completed' }),
      makeEvent({ id: 'e2', status: 'completed' }),
    ];
    render(<StatsCards events={events} />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('shows 0 executions with empty events array', () => {
    render(<StatsCards events={[]} />);
    // "0" for total executions and "0" for tokens
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  CostBreakdown                                                      */
/* ------------------------------------------------------------------ */

describe('CostBreakdown', () => {
  it('renders empty state when no events', () => {
    render(<CostBreakdown events={[]} />);
    expect(screen.getByText('No token usage data yet.')).toBeInTheDocument();
  });

  it('renders model name in cost breakdown', () => {
    const events = [makeEvent({ model: 'gpt-4o' })];
    render(<CostBreakdown events={events} />);
    expect(screen.getAllByText('gpt-4o').length).toBeGreaterThanOrEqual(1);
  });

  it('renders cost table with correct headers', () => {
    const events = [makeEvent()];
    render(<CostBreakdown events={events} />);
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Executions')).toBeInTheDocument();
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Output')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('groups events by model', () => {
    const events = [
      makeEvent({ id: 'e1', model: 'gpt-4o', input_tokens: 100, output_tokens: 200 }),
      makeEvent({ id: 'e2', model: 'gpt-4o', input_tokens: 150, output_tokens: 250 }),
      makeEvent({ id: 'e3', model: 'claude-sonnet', input_tokens: 50, output_tokens: 100 }),
    ];
    render(<CostBreakdown events={events} />);
    // gpt-4o should appear
    expect(screen.getAllByText('gpt-4o').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('claude-sonnet').length).toBeGreaterThanOrEqual(1);
  });

  it('sorts models by total tokens descending', () => {
    const events = [
      makeEvent({ id: 'e1', model: 'small-model', input_tokens: 10, output_tokens: 20 }),
      makeEvent({ id: 'e2', model: 'big-model', input_tokens: 1000, output_tokens: 2000 }),
    ];
    render(<CostBreakdown events={events} />);
    const rows = document.querySelectorAll('.ad-cost-bar-row');
    // big-model should come first
    expect(rows[0].textContent).toContain('big-model');
    expect(rows[1].textContent).toContain('small-model');
  });

  it('handles events with null model as "unknown"', () => {
    const events = [makeEvent({ model: null })];
    render(<CostBreakdown events={events} />);
    expect(screen.getAllByText('unknown').length).toBeGreaterThanOrEqual(1);
  });

  it('shows execution count per model in table', () => {
    const events = [
      makeEvent({ id: 'e1', model: 'gpt-4o' }),
      makeEvent({ id: 'e2', model: 'gpt-4o' }),
    ];
    render(<CostBreakdown events={events} />);
    // The execution count for gpt-4o should be 2
    const rows = document.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('2');
  });
});

/* ------------------------------------------------------------------ */
/*  MemoryViewer                                                       */
/* ------------------------------------------------------------------ */

describe('MemoryViewer', () => {
  it('renders memory cards after loading', async () => {
    const api = createMockApi({ memories: [makeMemory({ content: 'User likes TypeScript' })] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('User likes TypeScript')).toBeInTheDocument();
    });
  });

  it('shows empty state when no memories', async () => {
    const api = createMockApi({ memories: [] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('No memories stored yet.')).toBeInTheDocument();
    });
  });

  it('shows error when memory load fails', async () => {
    const api = createMockApi({ memoriesShouldReject: true, memoriesError: 'Memory load failed' });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('Memory load failed')).toBeInTheDocument();
    });
  });

  it('renders memory type badge', async () => {
    const api = createMockApi({ memories: [makeMemory({ memory_type: 'observation' })] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('observation')).toBeInTheDocument();
    });
  });

  it('renders memory importance score', async () => {
    const api = createMockApi({ memories: [makeMemory({ importance: 0.9 })] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('0.9')).toBeInTheDocument();
    });
  });

  it('renders memory access count', async () => {
    const api = createMockApi({ memories: [makeMemory({ access_count: 12 })] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('12x')).toBeInTheDocument();
    });
  });

  it('renders memory tags', async () => {
    const api = createMockApi({ memories: [makeMemory({ tags: ['important', 'work'] })] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('important')).toBeInTheDocument();
      expect(screen.getByText('work')).toBeInTheDocument();
    });
  });

  it('does not render tags section when tags array is empty', async () => {
    const api = createMockApi({ memories: [makeMemory({ tags: [] })] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('User prefers concise responses')).toBeInTheDocument();
    });
    expect(document.querySelector('.ad-memory-tags')).not.toBeInTheDocument();
  });

  it('deletes memory when Delete button is clicked', async () => {
    const api = createMockApi({ memories: [makeMemory({ id: 'mem-del' })] });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('User prefers concise responses')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(api.deleteMemory).toHaveBeenCalledWith('agent-1', 'mem-del');
    });
    // Memory should be removed from list
    expect(screen.queryByText('User prefers concise responses')).not.toBeInTheDocument();
  });

  it('shows error when memory delete fails', async () => {
    const api = createMockApi({
      memories: [makeMemory()],
      deleteMemoryReject: true,
    });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('User prefers concise responses')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText('Delete'));

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument();
    });
    // Memory should still be in the list
    expect(screen.getByText('User prefers concise responses')).toBeInTheDocument();
  });

  it('renders multiple memories', async () => {
    const api = createMockApi({
      memories: [
        makeMemory({ id: 'mem-1', content: 'First memory' }),
        makeMemory({ id: 'mem-2', content: 'Second memory', memory_type: 'fact' }),
        makeMemory({ id: 'mem-3', content: 'Third memory', memory_type: 'reflection' }),
      ],
    });
    render(<MemoryViewer api={api} agentId="agent-1" />);
    await waitFor(() => {
      expect(screen.getByText('First memory')).toBeInTheDocument();
      expect(screen.getByText('Second memory')).toBeInTheDocument();
      expect(screen.getByText('Third memory')).toBeInTheDocument();
    });
  });

  it('shows loading spinner while loading', () => {
    const api = {
      listMemories: vi.fn().mockReturnValue(new Promise(() => {})),
    } as unknown as WaiAgentsApi;
    render(<MemoryViewer api={api} agentId="agent-1" />);
    expect(document.querySelector('.loading-spinner')).toBeInTheDocument();
  });
});
