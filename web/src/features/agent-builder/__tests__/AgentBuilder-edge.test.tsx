import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WaiAgentsApi } from '@/lib/api/services';
import type { SessionUser } from '@/lib/state/session-store';
import type { Agent } from '@/lib/types';
import { AgentBuilderView } from '../AgentBuilderView';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    creator_id: 'user-1',
    name: 'My Test Agent',
    slug: 'my-test-agent',
    description: 'A helpful test agent',
    avatar_url: null,
    system_prompt: 'You are a helpful assistant.',
    model: 'claude-sonnet-4-6',
    execution_mode: 'raw',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
    mcp_servers: [],
    visibility: 'private',
    category: 'general',
    usage_count: 10,
    rating_sum: 0,
    rating_count: 0,
    metadata: {},
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
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
    listMyAgents: vi.fn().mockResolvedValue({
      items: [
        makeAgent(),
        makeAgent({
          id: 'agent-2',
          name: 'Code Bot',
          slug: 'code-bot',
          description: 'Writes code',
          model: 'claude-opus-4-6',
          visibility: 'public',
        }),
      ],
    }),
    createAgent: vi.fn().mockResolvedValue({
      agent: makeAgent({ id: 'agent-new', name: 'New Agent', slug: 'new-agent' }),
    }),
    updateAgent: vi.fn().mockResolvedValue({
      agent: makeAgent({ name: 'Updated Agent' }),
    }),
    deleteAgent: vi.fn().mockResolvedValue(undefined),
    listSchedules: vi.fn().mockResolvedValue({ items: [] }),
    startAgentConversation: vi.fn().mockResolvedValue({
      conversation: { id: 'conv-1' },
    }),
    sendTextMessage: vi.fn().mockResolvedValue({
      message: { id: 'msg-1' },
    }),
    listMessages: vi.fn().mockResolvedValue({
      items: [],
      page_info: { next_cursor: null, has_more: false },
    }),
    ...overrides,
  } as unknown as WaiAgentsApi;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AgentBuilder edge cases', () => {
  let api: WaiAgentsApi;

  beforeEach(() => {
    api = createMockApi();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // jsdom does not implement scrollIntoView (used by AgentTestSandbox)
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /* ---- Layout and sidebar ---- */

  it('renders the agent builder layout', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Agents')).toBeInTheDocument();
    });
  });

  it('renders agent list in sidebar', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
      expect(screen.getByText('Code Bot')).toBeInTheDocument();
    });
  });

  it('shows + New button in sidebar', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    expect(screen.getByText('+ New')).toBeInTheDocument();
  });

  it('shows loading spinner while agents load', () => {
    const slowApi = createMockApi({
      listMyAgents: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<AgentBuilderView api={slowApi} accessToken="tok" currentUser={currentUser} />);
    const spinner = document.querySelector('.loading-spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('shows error when agent loading fails', async () => {
    const errApi = createMockApi({
      listMyAgents: vi.fn().mockRejectedValue(new Error('Agent load error')),
    });
    render(<AgentBuilderView api={errApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Agent load error')).toBeInTheDocument();
    });
  });

  it('shows empty state when no agents exist', async () => {
    const emptyApi = createMockApi({
      listMyAgents: vi.fn().mockResolvedValue({ items: [] }),
    });
    render(<AgentBuilderView api={emptyApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('No agents yet. Create your first one.')).toBeInTheDocument();
    });
  });

  it('shows empty main state when no agent is selected', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Select an agent to edit, or create a new one.')).toBeInTheDocument();
    });
  });

  /* ---- Agent card rendering ---- */

  it('renders agent card with name and model', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
      expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    });
  });

  it('renders agent card with visibility badge', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('private')).toBeInTheDocument();
      expect(screen.getByText('public')).toBeInTheDocument();
    });
  });

  it('renders agent description on card', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('A helpful test agent')).toBeInTheDocument();
      expect(screen.getByText('Writes code')).toBeInTheDocument();
    });
  });

  it('renders first letter as avatar when no avatar_url', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('M').length).toBeGreaterThan(0); // "My Test Agent" -> "M"
      expect(screen.getAllByText('C').length).toBeGreaterThan(0); // "Code Bot" -> "C"
    });
  });

  /* ---- Create new agent ---- */

  it('shows create form when + New is clicked', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    // "Create Agent" appears as both the form title <h3> and the submit <button>
    expect(document.querySelector('.ab-form-title')?.textContent).toBe('Create Agent');
  });

  it('renders all form fields in create mode', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByLabelText('agent-form')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
  });

  it('renders Model Configuration fieldset', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByLabelText('model-selector')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('Execution Mode')).toBeInTheDocument();
    expect(screen.getByLabelText(/Temperature/)).toBeInTheDocument();
    expect(screen.getByLabelText('Max Tokens')).toBeInTheDocument();
  });

  it('renders System Prompt editor', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByLabelText('system-prompt-editor')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('You are a helpful assistant that...')).toBeInTheDocument();
  });

  it('renders Tool Configurator with built-in tools', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByLabelText('tool-configurator')).toBeInTheDocument();
    expect(screen.getByText('memory')).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('code_execution')).toBeInTheDocument();
    expect(screen.getByText('filesystem')).toBeInTheDocument();
  });

  it('renders Visibility selector', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByLabelText('visibility-selector')).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Unlisted')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('auto-generates slug from name', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'My Cool Agent');

    const slugInput = screen.getByLabelText('Slug') as HTMLInputElement;
    expect(slugInput.value).toBe('my-cool-agent');
  });

  it('disables Create Agent button when name is empty', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    const createBtn = screen.getByRole('button', { name: 'Create Agent' });
    expect(createBtn).toBeDisabled();
  });

  it('disables Create Agent button when system prompt is empty', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    // Fill name but not system prompt
    await user.type(screen.getByLabelText('Name'), 'Test');
    const createBtn = screen.getByRole('button', { name: 'Create Agent' });
    expect(createBtn).toBeDisabled();
  });

  it('enables Create Agent button when name and system prompt are filled', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    await user.type(screen.getByLabelText('Name'), 'Test Agent');
    await user.type(
      screen.getByPlaceholderText('You are a helpful assistant that...'),
      'Be helpful',
    );

    const createBtn = screen.getByRole('button', { name: 'Create Agent' });
    expect(createBtn).not.toBeDisabled();
  });

  it('calls api.createAgent with form data on submit', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    await user.type(screen.getByLabelText('Name'), 'Test Agent');
    await user.type(
      screen.getByPlaceholderText('You are a helpful assistant that...'),
      'Be helpful',
    );
    await user.click(screen.getByRole('button', { name: 'Create Agent' }));

    await waitFor(() => {
      expect(api.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Agent',
          slug: 'test-agent',
          system_prompt: 'Be helpful',
          model: 'claude-sonnet-4-6',
        }),
      );
    });
  });

  it('shows "Saving..." while create is pending', async () => {
    const slowApi = createMockApi({
      createAgent: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<AgentBuilderView api={slowApi} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    await user.type(screen.getByLabelText('Name'), 'Test');
    await user.type(screen.getByPlaceholderText('You are a helpful assistant that...'), 'Prompt');
    await user.click(screen.getByRole('button', { name: 'Create Agent' }));

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  it('shows error when create fails', async () => {
    const failApi = createMockApi({
      createAgent: vi.fn().mockRejectedValue(new Error('Slug already taken')),
    });
    render(<AgentBuilderView api={failApi} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    await user.type(screen.getByLabelText('Name'), 'Test');
    await user.type(screen.getByPlaceholderText('You are a helpful assistant that...'), 'Prompt');
    await user.click(screen.getByRole('button', { name: 'Create Agent' }));

    await waitFor(() => {
      expect(screen.getByText('Slug already taken')).toBeInTheDocument();
    });
  });

  /* ---- Edit existing agent ---- */

  it('shows edit form when selecting an agent', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Edit Agent')).toBeInTheDocument();
    });
  });

  it('pre-populates form with existing agent data', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.value).toBe('My Test Agent');
    });
  });

  it('shows Update Agent button in edit mode', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Update Agent')).toBeInTheDocument();
    });
  });

  it('calls api.updateAgent when update is submitted', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Update Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Update Agent'));

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith('agent-1', expect.any(Object));
    });
  });

  /* ---- Delete agent ---- */

  it('shows Delete Agent button in edit mode', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Delete Agent')).toBeInTheDocument();
    });
  });

  it('does not show Delete Agent button in create mode', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.queryByText('Delete Agent')).not.toBeInTheDocument();
  });

  it('calls api.deleteAgent after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Delete Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete Agent'));

    await waitFor(() => {
      expect(api.deleteAgent).toHaveBeenCalledWith('agent-1');
    });
  });

  it('does not delete when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Delete Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete Agent'));

    expect(api.deleteAgent).not.toHaveBeenCalled();
  });

  it('removes agent from list after successful deletion', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Delete Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete Agent'));

    await waitFor(() => {
      expect(screen.queryByLabelText('agent-card-my-test-agent')).not.toBeInTheDocument();
    });
  });

  it('shows error when delete fails', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const failApi = createMockApi({
      deleteAgent: vi.fn().mockRejectedValue(new Error('Cannot delete')),
    });
    render(<AgentBuilderView api={failApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Delete Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Delete Agent'));

    await waitFor(() => {
      expect(screen.getByText('Cannot delete')).toBeInTheDocument();
    });
  });

  /* ---- Cancel ---- */

  it('hides form when Cancel is clicked', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(document.querySelector('.ab-form-title')?.textContent).toBe('Create Agent');

    await user.click(screen.getByText('Cancel'));

    expect(screen.queryByLabelText('agent-form')).not.toBeInTheDocument();
    expect(screen.getByText('Select an agent to edit, or create a new one.')).toBeInTheDocument();
  });

  /* ---- System prompt variable insertion ---- */

  it('shows variable insert buttons in system prompt editor', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByText('User Name')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Agent Name')).toBeInTheDocument();
  });

  it('shows character count for system prompt', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByText('0 characters')).toBeInTheDocument();
  });

  /* ---- Model selector options ---- */

  it('renders all model options in the selector', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
    const options = Array.from(modelSelect.options).map((o) => o.text);
    expect(options).toContain('Claude Sonnet 4.6');
    expect(options).toContain('Claude Opus 4.6');
    expect(options).toContain('Claude Haiku 4.6');
    expect(options).toContain('GPT-4o');
    expect(options).toContain('GPT-4o Mini');
  });

  it('renders execution mode options', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    const modeSelect = screen.getByLabelText('Execution Mode') as HTMLSelectElement;
    const options = Array.from(modeSelect.options).map((o) => o.text);
    expect(options).toContain('Raw Streaming');
    expect(options).toContain('Claude Agent SDK');
    expect(options).toContain('OpenAI Agents SDK');
  });

  it('renders temperature slider with default value', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByLabelText(/Temperature: 0\.70/)).toBeInTheDocument();
  });

  /* ---- Tool toggles ---- */

  it('toggles tool on when clicking checkbox', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    const memoryCheckbox = screen
      .getByText('memory')
      .closest('label')
      ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(memoryCheckbox.checked).toBe(false);

    await user.click(memoryCheckbox);
    expect(memoryCheckbox.checked).toBe(true);
  });

  /* ---- MCP Server management ---- */

  it('shows "No MCP servers configured." by default', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByText('No MCP servers configured.')).toBeInTheDocument();
  });

  it('shows + Add Server button', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByText('+ Add Server')).toBeInTheDocument();
  });

  it('shows MCP server form when + Add Server is clicked', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));
    await user.click(screen.getByText('+ Add Server'));

    expect(screen.getByLabelText('mcp-server-form')).toBeInTheDocument();
    expect(screen.getByText('Add MCP Server')).toBeInTheDocument();
  });

  /* ---- Visibility radio buttons ---- */

  it('defaults to Private visibility', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    const privateRadio = screen
      .getByLabelText('visibility-selector')
      .querySelector('input[value="private"]') as HTMLInputElement;
    expect(privateRadio.checked).toBe(true);
  });

  it('shows visibility descriptions', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.getByText('Visible on marketplace and searchable')).toBeInTheDocument();
    expect(screen.getByText('Accessible via link, not listed')).toBeInTheDocument();
    expect(screen.getByText('Only you can access')).toBeInTheDocument();
  });

  /* ---- Test Agent button ---- */

  it('shows Test Agent button only in edit mode', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Test Agent')).toBeInTheDocument();
    });
  });

  it('does not show Test Agent button in create mode', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('+ New'));

    expect(screen.queryByText('Test Agent')).not.toBeInTheDocument();
  });

  it('shows test sandbox when Test Agent is clicked', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Test Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Test Agent'));

    await waitFor(() => {
      expect(screen.getByLabelText('agent-test-sandbox')).toBeInTheDocument();
      expect(screen.getByText('Send a message to test your agent.')).toBeInTheDocument();
    });
  });

  it('hides test sandbox when toggling Test Agent off', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    await waitFor(() => {
      expect(screen.getByText('Test Agent')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Test Agent'));
    expect(screen.getByLabelText('agent-test-sandbox')).toBeInTheDocument();

    await user.click(screen.getByText('Hide Test'));
    expect(screen.queryByLabelText('agent-test-sandbox')).not.toBeInTheDocument();
  });

  /* ---- Agent card selection styling ---- */

  it('marks selected agent card with selected class', async () => {
    render(<AgentBuilderView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('My Test Agent')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByLabelText('agent-card-my-test-agent'));

    const card = screen.getByLabelText('agent-card-my-test-agent');
    expect(card.classList.contains('selected')).toBe(true);
  });
});
