import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentDashboardView } from '@/features/agent-dashboard/AgentDashboardView';
import { ApiError } from '@/lib/api';
import type { WaiAgentsApi } from '@/lib/api/services';
import type { Agent, AgentEvent, AgentMemory } from '@/lib/types';
import {
  asTextContent,
  createIdempotencyKey,
  getErrorMessage,
  toIsoLocal,
  toSessionUser,
} from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Tests: utility functions (used like hooks across the codebase)     */
/* ------------------------------------------------------------------ */

describe('Utility function edge cases', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /* ==== toSessionUser ==== */

  describe('toSessionUser', () => {
    it('extracts correct fields from a full user object', () => {
      const result = toSessionUser({
        id: 'user-1',
        username: 'alice',
        display_name: 'Alice',
        email: 'alice@test.com',
        avatar_url: 'https://example.com/avatar.png',
        bio: 'Hello',
      });
      expect(result).toEqual({
        id: 'user-1',
        username: 'alice',
        display_name: 'Alice',
        email: 'alice@test.com',
        avatar_url: 'https://example.com/avatar.png',
        bio: 'Hello',
      });
    });

    it('handles null display_name', () => {
      const result = toSessionUser({
        id: 'user-1',
        username: 'alice',
        display_name: null,
        avatar_url: null,
        bio: null,
      });
      expect(result.display_name).toBeNull();
    });

    it('handles missing email', () => {
      const result = toSessionUser({
        id: 'user-1',
        username: 'alice',
        display_name: null,
        avatar_url: null,
        bio: null,
      });
      expect(result.email).toBeUndefined();
    });
  });

  /* ==== getErrorMessage ==== */

  describe('getErrorMessage', () => {
    it('extracts message from Error instance', () => {
      expect(getErrorMessage(new Error('Something failed'))).toBe('Something failed');
    });

    it('returns fallback for null', () => {
      expect(getErrorMessage(null)).toBe('Request failed');
    });

    it('returns fallback for undefined', () => {
      expect(getErrorMessage(undefined)).toBe('Request failed');
    });

    it('returns custom fallback when provided', () => {
      expect(getErrorMessage(null, 'Custom error')).toBe('Custom error');
    });

    it('extracts reason from object with reason field', () => {
      expect(getErrorMessage({ reason: 'Rate limited' })).toBe('Rate limited');
    });

    it('returns fallback for empty Error message', () => {
      expect(getErrorMessage(new Error(''))).toBe('Request failed');
    });

    it('handles ApiError instances', () => {
      const err = new ApiError('Not authorized', { status: 401 });
      expect(getErrorMessage(err)).toBe('Not authorized');
    });
  });

  /* ==== createIdempotencyKey ==== */

  describe('createIdempotencyKey', () => {
    it('returns a non-empty string', () => {
      const key = createIdempotencyKey();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });

    it('returns unique keys on consecutive calls', () => {
      const key1 = createIdempotencyKey();
      const key2 = createIdempotencyKey();
      expect(key1).not.toBe(key2);
    });
  });

  /* ==== asTextContent ==== */

  describe('asTextContent', () => {
    it('returns empty string for null', () => {
      expect(asTextContent(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(asTextContent(undefined)).toBe('');
    });

    it('returns string directly for string input', () => {
      expect(asTextContent('Hello world')).toBe('Hello world');
    });

    it('extracts text from object with text field', () => {
      expect(asTextContent({ text: 'Hello' })).toBe('Hello');
    });

    it('returns empty string for object without text field', () => {
      expect(asTextContent({ content: 'test' })).toBe('');
    });

    it('joins text from array of text blocks', () => {
      const blocks = [
        { type: 'text', text: 'Line 1' },
        { type: 'text', text: 'Line 2' },
      ];
      expect(asTextContent(blocks)).toBe('Line 1\nLine 2');
    });

    it('handles array of strings', () => {
      expect(asTextContent(['Hello', 'World'])).toBe('Hello\nWorld');
    });

    it('skips blocks without text', () => {
      const blocks = [
        { type: 'text', text: 'Keep' },
        { type: 'image', url: 'https://example.com' },
      ];
      expect(asTextContent(blocks)).toBe('Keep');
    });

    it('returns empty string for empty array', () => {
      expect(asTextContent([])).toBe('');
    });
  });

  /* ==== toIsoLocal ==== */

  describe('toIsoLocal', () => {
    it('returns empty string for null', () => {
      expect(toIsoLocal(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(toIsoLocal(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(toIsoLocal('not-a-date')).toBe('');
    });

    it('returns locale string for valid ISO date', () => {
      const result = toIsoLocal('2026-03-10T12:00:00Z');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns empty string for empty string input', () => {
      expect(toIsoLocal('')).toBe('');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Tests: AgentDashboardView (component with hook-like data patterns) */
/* ------------------------------------------------------------------ */

describe('AgentDashboardView edge cases', () => {
  let api: WaiAgentsApi;

  function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
    return {
      id: 'event-1',
      agent_id: 'agent-1',
      event_type: 'execution',
      trigger_type: 'manual',
      duration_ms: 1500,
      input_tokens: 100,
      output_tokens: 200,
      model: 'claude-sonnet-4-6',
      status: 'completed',
      error_code: null,
      error_message: null,
      inserted_at: '2026-03-10T12:00:00Z',
      ...overrides,
    };
  }

  function makeMemory(overrides: Partial<AgentMemory> = {}): AgentMemory {
    return {
      id: 'mem-1',
      agent_id: 'agent-1',
      user_id: 'user-1',
      content: 'The user prefers TypeScript',
      importance: 0.8,
      memory_type: 'fact',
      access_count: 5,
      last_accessed_at: '2026-03-10T12:00:00Z',
      embedding_key: null,
      source_conversation_id: null,
      source_message_id: null,
      expires_at: null,
      metadata: {},
      created_at: '2026-03-10T11:00:00Z',
      updated_at: '2026-03-10T11:00:00Z',
      ...overrides,
    };
  }

  const testAgent: Agent = {
    id: 'agent-1',
    creator_id: 'user-1',
    name: 'Test Agent',
    slug: 'test-agent',
    description: 'A test agent',
    avatar_url: null,
    system_prompt: 'You are helpful.',
    model: 'claude-sonnet-4-6',
    execution_mode: 'raw',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
    mcp_servers: [],
    visibility: 'private',
    category: 'general',
    usage_count: 42,
    rating_sum: 20,
    rating_count: 5,
    metadata: {},
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
  };

  beforeEach(() => {
    api = {
      listAgentEvents: vi.fn().mockResolvedValue({
        items: [makeEvent()],
        page_info: { next_cursor: null, has_more: false },
      }),
      listMemories: vi.fn().mockResolvedValue({
        items: [makeMemory()],
        page_info: { next_cursor: null, has_more: false },
      }),
      deleteMemory: vi.fn().mockResolvedValue(undefined),
    } as unknown as WaiAgentsApi;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the dashboard layout with agent name', () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });

  it('renders Overview, Events, and Memories tabs', () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Memories')).toBeInTheDocument();
  });

  it('shows Overview tab as active by default', () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const overviewBtn = screen.getByText('Overview');
    expect(overviewBtn.classList.contains('active')).toBe(true);
  });

  it('shows health indicator as Idle when no events loaded yet', () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    expect(screen.getByLabelText('agent-health')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('renders StatsCards in overview tab', () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    expect(screen.getByText('Total Executions')).toBeInTheDocument();
    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Tokens')).toBeInTheDocument();
    expect(screen.getByText('Avg Latency')).toBeInTheDocument();
  });

  it('shows stats with zero values when no events are loaded', () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    // Multiple stat cards show "0" (executions, tokens, latency)
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0%')).toBeInTheDocument(); // Success Rate
  });

  it('switches to Events tab when clicked', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Events'));

    expect(screen.getByText('Events').classList.contains('active')).toBe(true);
    expect(screen.getByText('Overview').classList.contains('active')).toBe(false);
  });

  it('renders event list after switching to Events tab', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Events'));

    await waitFor(() => {
      expect(screen.getByText('completed')).toBeInTheDocument();
      expect(screen.getByText('execution')).toBeInTheDocument();
    });
  });

  it('calls listAgentEvents with correct agent ID on Events tab', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Events'));

    await waitFor(() => {
      expect(api.listAgentEvents).toHaveBeenCalledWith('agent-1', expect.any(Object));
    });
  });

  it('shows empty events state when no events exist', async () => {
    (api.listAgentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      page_info: { next_cursor: null, has_more: false },
    });
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Events'));

    await waitFor(() => {
      expect(screen.getByText('No execution events yet.')).toBeInTheDocument();
    });
  });

  it('renders failed event status in Events tab', async () => {
    (api.listAgentEvents as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [makeEvent({ status: 'failed', error_message: 'Timeout' })],
      page_info: { next_cursor: null, has_more: false },
    });
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Events'));

    await waitFor(() => {
      expect(screen.getByText('failed')).toBeInTheDocument();
    });
  });

  it('switches to Memories tab when clicked', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Memories'));

    expect(screen.getByText('Memories').classList.contains('active')).toBe(true);
  });

  it('renders memory content in Memories tab', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Memories'));

    await waitFor(() => {
      expect(screen.getByText('The user prefers TypeScript')).toBeInTheDocument();
    });
  });

  it('renders memory type badge', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Memories'));

    await waitFor(() => {
      expect(screen.getByText('fact')).toBeInTheDocument();
    });
  });

  it('renders memory content', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Memories'));

    await waitFor(() => {
      expect(screen.getByText('The user prefers TypeScript')).toBeInTheDocument();
    });
  });

  it('shows empty memories state when no memories exist', async () => {
    (api.listMemories as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      page_info: { next_cursor: null, has_more: false },
    });
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Memories'));

    await waitFor(() => {
      expect(screen.getByText('No memories stored yet.')).toBeInTheDocument();
    });
  });

  it('calls listMemories with correct agent ID on Memories tab', async () => {
    render(<AgentDashboardView api={api} agent={testAgent} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Memories'));

    await waitFor(() => {
      expect(api.listMemories).toHaveBeenCalledWith('agent-1');
    });
  });
});
