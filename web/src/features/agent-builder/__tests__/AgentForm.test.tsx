import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock sub-components
vi.mock('../ModelSelector', () => ({
  ModelSelector: (props: {
    model: string;
    executionMode: string;
    temperature: number;
    maxTokens: number;
    onModelChange: (v: string) => void;
    onExecutionModeChange: (v: string) => void;
    onTemperatureChange: (v: number) => void;
    onMaxTokensChange: (v: number) => void;
  }) => (
    <fieldset data-testid="model-selector" aria-label="model-selector">
      <select
        data-testid="model-select"
        value={props.model}
        onChange={(e) => props.onModelChange(e.target.value)}
      >
        <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
        <option value="claude-opus-4-6">Claude Opus 4.6</option>
        <option value="gpt-4o">GPT-4o</option>
      </select>
      <select
        data-testid="execution-mode-select"
        value={props.executionMode}
        onChange={(e) => props.onExecutionModeChange(e.target.value)}
      >
        <option value="raw">Raw</option>
        <option value="claude_sdk">Claude SDK</option>
        <option value="openai_sdk">OpenAI SDK</option>
      </select>
    </fieldset>
  ),
}));

vi.mock('../SystemPromptEditor', () => ({
  SystemPromptEditor: (props: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="system-prompt-editor"
      aria-label="system-prompt-editor"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      placeholder="You are a helpful assistant..."
    />
  ),
}));

vi.mock('../ToolConfigurator', () => ({
  ToolConfigurator: () => (
    <section data-testid="tool-configurator" aria-label="tool-configurator" />
  ),
}));

vi.mock('../VisibilitySelector', () => ({
  VisibilitySelector: (props: { value: string; onChange: (v: string) => void }) => (
    <fieldset data-testid="visibility-selector" aria-label="visibility-selector">
      <select
        data-testid="visibility-select"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="private">Private</option>
        <option value="public">Public</option>
        <option value="unlisted">Unlisted</option>
      </select>
    </fieldset>
  ),
}));

vi.mock('../ScheduleManager', () => ({
  ScheduleManager: () => <section data-testid="schedule-manager" aria-label="schedule-manager" />,
}));

vi.mock('../AgentTestSandbox', () => ({
  AgentTestSandbox: () => (
    <section data-testid="agent-test-sandbox" aria-label="agent-test-sandbox" />
  ),
}));

import type { WaiAgentsApi } from '@/lib/api/services';
import type { Agent } from '@/lib/types';
import { AgentForm } from '../AgentForm';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    creator_id: 'user-1',
    name: 'Test Agent',
    slug: 'test-agent',
    description: 'A test agent',
    avatar_url: null,
    system_prompt: 'You are a test agent.',
    model: 'claude-sonnet-4-6',
    execution_mode: 'raw',
    temperature: 0.7,
    max_tokens: 4096,
    tools: [],
    mcp_servers: [],
    visibility: 'private',
    category: 'general',
    usage_count: 0,
    rating_sum: 0,
    rating_count: 0,
    metadata: {},
    created_at: '2026-03-10T11:00:00Z',
    updated_at: '2026-03-10T11:00:00Z',
    ...overrides,
  };
}

function createMockApi(overrides: Partial<WaiAgentsApi> = {}): WaiAgentsApi {
  return {
    createAgent: vi.fn().mockResolvedValue({ agent: makeAgent() }),
    updateAgent: vi.fn().mockResolvedValue({ agent: makeAgent() }),
    listSchedules: vi.fn().mockResolvedValue({ items: [] }),
    ...overrides,
  } as unknown as WaiAgentsApi;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AgentForm', () => {
  let api: WaiAgentsApi;
  const onSaved = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    api = createMockApi();
    onSaved.mockClear();
    onCancel.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the form with "Create Agent" title in create mode', () => {
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    expect(screen.getByRole('heading', { name: 'Create Agent' })).toBeInTheDocument();
  });

  it('renders the form with "Edit Agent" title in edit mode', () => {
    render(
      <AgentForm
        api={api}
        accessToken="tok"
        agent={makeAgent()}
        onSaved={onSaved}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Edit Agent')).toBeInTheDocument();
  });

  it('renders name, slug, and description fields', () => {
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  it('pre-fills fields when editing an existing agent', () => {
    const agent = makeAgent({ name: 'My Bot', slug: 'my-bot', description: 'Best bot' });
    render(
      <AgentForm api={api} accessToken="tok" agent={agent} onSaved={onSaved} onCancel={onCancel} />,
    );
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('My Bot');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('my-bot');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Best bot');
  });

  it('auto-generates slug from name when creating a new agent', async () => {
    const user = userEvent.setup();
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'My Cool Agent');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('my-cool-agent');
  });

  it('does not auto-generate slug when editing', async () => {
    const user = userEvent.setup();
    const agent = makeAgent({ name: 'Old Name', slug: 'old-slug' });
    render(
      <AgentForm api={api} accessToken="tok" agent={agent} onSaved={onSaved} onCancel={onCancel} />,
    );
    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'New Name');
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('old-slug');
  });

  it('renders the category selector with correct categories', () => {
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    expect(screen.getByLabelText('Category')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Coding')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
  });

  it('renders model selector, system prompt editor, tool configurator, and visibility selector', () => {
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    expect(screen.getByTestId('model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('system-prompt-editor')).toBeInTheDocument();
    expect(screen.getByTestId('tool-configurator')).toBeInTheDocument();
    expect(screen.getByTestId('visibility-selector')).toBeInTheDocument();
  });

  it('disables submit button when name is empty', () => {
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    const submitButton = screen.getByRole('button', { name: 'Create Agent' });
    expect(submitButton).toBeDisabled();
  });

  it('disables submit button when system prompt is empty', async () => {
    const user = userEvent.setup();
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'My Agent');
    // System prompt is still empty
    const submitButton = screen.getByRole('button', { name: 'Create Agent' });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when name and system prompt have values', async () => {
    const user = userEvent.setup();
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    const nameInput = screen.getByLabelText('Name');
    await user.type(nameInput, 'My Agent');
    const promptEditor = screen.getByTestId('system-prompt-editor');
    await user.type(promptEditor, 'You are helpful.');
    const submitButton = screen.getByRole('button', { name: 'Create Agent' });
    expect(submitButton).not.toBeDisabled();
  });

  it('calls api.createAgent on submit in create mode', async () => {
    const user = userEvent.setup();
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);

    await user.type(screen.getByLabelText('Name'), 'New Agent');
    await user.type(screen.getByTestId('system-prompt-editor'), 'Be helpful');

    const submitButton = screen.getByRole('button', { name: 'Create Agent' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(api.createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Agent',
          slug: 'new-agent',
          system_prompt: 'Be helpful',
          model: 'claude-sonnet-4-6',
        }),
      );
    });
  });

  it('calls api.updateAgent on submit in edit mode', async () => {
    const agent = makeAgent();
    const user = userEvent.setup();
    render(
      <AgentForm api={api} accessToken="tok" agent={agent} onSaved={onSaved} onCancel={onCancel} />,
    );

    const submitButton = screen.getByText('Update Agent');
    await user.click(submitButton);

    await waitFor(() => {
      expect(api.updateAgent).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          name: 'Test Agent',
          system_prompt: 'You are a test agent.',
        }),
      );
    });
  });

  it('calls onSaved callback after successful creation', async () => {
    const user = userEvent.setup();
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);

    await user.type(screen.getByLabelText('Name'), 'New Agent');
    await user.type(screen.getByTestId('system-prompt-editor'), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Create Agent' }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-1' }));
    });
  });

  it('shows "Saving..." on submit button while saving', async () => {
    const slowApi = createMockApi({
      createAgent: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    const user = userEvent.setup();
    render(<AgentForm api={slowApi} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);

    await user.type(screen.getByLabelText('Name'), 'Slow Agent');
    await user.type(screen.getByTestId('system-prompt-editor'), 'Prompt');
    await user.click(screen.getByRole('button', { name: 'Create Agent' }));

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('shows error message when save fails', async () => {
    const errorApi = createMockApi({
      createAgent: vi.fn().mockRejectedValue(new Error('Server error')),
    });
    const user = userEvent.setup();
    render(<AgentForm api={errorApi} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);

    await user.type(screen.getByLabelText('Name'), 'Fail Agent');
    await user.type(screen.getByTestId('system-prompt-editor'), 'Prompt');
    await user.click(screen.getByRole('button', { name: 'Create Agent' }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    render(<AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />);
    await user.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows "Test Agent" button only in edit mode', () => {
    const { rerender } = render(
      <AgentForm api={api} accessToken="tok" onSaved={onSaved} onCancel={onCancel} />,
    );
    expect(screen.queryByText('Test Agent')).not.toBeInTheDocument();

    rerender(
      <AgentForm
        api={api}
        accessToken="tok"
        agent={makeAgent()}
        onSaved={onSaved}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Test Agent')).toBeInTheDocument();
  });
});
