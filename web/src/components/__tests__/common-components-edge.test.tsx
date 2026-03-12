import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentCard } from '@/features/agent-builder/AgentCard';
import { MCPServerForm } from '@/features/agent-builder/MCPServerForm';
import { ModelSelector } from '@/features/agent-builder/ModelSelector';
import { SystemPromptEditor } from '@/features/agent-builder/SystemPromptEditor';
import { ToolConfigurator } from '@/features/agent-builder/ToolConfigurator';
import { VisibilitySelector } from '@/features/agent-builder/VisibilitySelector';
import { BYOKPanel } from '@/features/settings/BYOKPanel';
import { IntegrationCard } from '@/features/settings/IntegrationCard';
import type { Agent, IntegrationStatus, McpServerConfig, ToolConfig } from '@/lib/types';

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
    system_prompt: 'You are helpful.',
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
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

function makeIntegration(overrides: Partial<IntegrationStatus> = {}): IntegrationStatus {
  return {
    service: 'github',
    connected: false,
    status: 'not_connected',
    scopes: [],
    expires_at: null,
    last_used_at: null,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('Common components edge cases', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /* ==== AgentCard ==== */

  describe('AgentCard', () => {
    it('renders agent name', () => {
      render(<AgentCard agent={makeAgent()} selected={false} onSelect={vi.fn()} />);
      expect(screen.getByText('Test Agent')).toBeInTheDocument();
    });

    it('renders agent model', () => {
      render(<AgentCard agent={makeAgent()} selected={false} onSelect={vi.fn()} />);
      expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    });

    it('renders agent description', () => {
      render(<AgentCard agent={makeAgent()} selected={false} onSelect={vi.fn()} />);
      expect(screen.getByText('A test agent')).toBeInTheDocument();
    });

    it('does not render description when null', () => {
      render(
        <AgentCard agent={makeAgent({ description: null })} selected={false} onSelect={vi.fn()} />,
      );
      expect(screen.queryByText('A test agent')).not.toBeInTheDocument();
    });

    it('renders visibility badge', () => {
      render(<AgentCard agent={makeAgent()} selected={false} onSelect={vi.fn()} />);
      expect(screen.getByText('private')).toBeInTheDocument();
    });

    it('renders first letter as avatar when no avatar_url', () => {
      render(<AgentCard agent={makeAgent()} selected={false} onSelect={vi.fn()} />);
      expect(screen.getByText('T')).toBeInTheDocument();
    });

    it('renders avatar image when avatar_url is set', () => {
      render(
        <AgentCard
          agent={makeAgent({ avatar_url: 'https://example.com/avatar.png' })}
          selected={false}
          onSelect={vi.fn()}
        />,
      );
      const img = screen.getByAltText('Test Agent');
      expect(img).toHaveAttribute('src', 'https://example.com/avatar.png');
    });

    it('applies selected class when selected', () => {
      render(<AgentCard agent={makeAgent()} selected={true} onSelect={vi.fn()} />);
      const card = screen.getByLabelText('agent-card-test-agent');
      expect(card.classList.contains('selected')).toBe(true);
    });

    it('does not apply selected class when not selected', () => {
      render(<AgentCard agent={makeAgent()} selected={false} onSelect={vi.fn()} />);
      const card = screen.getByLabelText('agent-card-test-agent');
      expect(card.classList.contains('selected')).toBe(false);
    });

    it('calls onSelect when clicked', async () => {
      const onSelect = vi.fn();
      render(<AgentCard agent={makeAgent()} selected={false} onSelect={onSelect} />);
      const user = userEvent.setup();
      await user.click(screen.getByLabelText('agent-card-test-agent'));
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('has correct aria-label with agent slug', () => {
      render(
        <AgentCard
          agent={makeAgent({ slug: 'my-special-agent' })}
          selected={false}
          onSelect={vi.fn()}
        />,
      );
      expect(screen.getByLabelText('agent-card-my-special-agent')).toBeInTheDocument();
    });
  });

  /* ==== IntegrationCard ==== */

  describe('IntegrationCard', () => {
    it('renders service name formatted correctly', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ service: 'google_calendar' })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('Google Calendar')).toBeInTheDocument();
    });

    it('shows "Not Connected" status for not_connected', () => {
      render(
        <IntegrationCard
          integration={makeIntegration()}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('Not Connected')).toBeInTheDocument();
    });

    it('shows "Connected" status for active integration', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ status: 'active', connected: true })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('shows "Expired" status for expired integration', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ status: 'expired', connected: false })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('Expired')).toBeInTheDocument();
    });

    it('shows "Revoked" status for revoked integration', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ status: 'revoked', connected: false })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('Revoked')).toBeInTheDocument();
    });

    it('shows Connect button when not connected', () => {
      render(
        <IntegrationCard
          integration={makeIntegration()}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('Connect')).toBeInTheDocument();
    });

    it('shows Disconnect button when connected', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ connected: true, status: 'active' })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });

    it('calls onConnect when Connect is clicked', async () => {
      const onConnect = vi.fn();
      render(
        <IntegrationCard
          integration={makeIntegration()}
          onConnect={onConnect}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByText('Connect'));
      expect(onConnect).toHaveBeenCalledTimes(1);
    });

    it('calls onDisconnect when Disconnect is clicked', async () => {
      const onDisconnect = vi.fn();
      render(
        <IntegrationCard
          integration={makeIntegration({ connected: true, status: 'active' })}
          onConnect={vi.fn()}
          onDisconnect={onDisconnect}
          connecting={false}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByText('Disconnect'));
      expect(onDisconnect).toHaveBeenCalledTimes(1);
    });

    it('shows "Connecting..." when connecting', () => {
      render(
        <IntegrationCard
          integration={makeIntegration()}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={true}
        />,
      );
      expect(screen.getByText('Connecting...')).toBeInTheDocument();
    });

    it('disables button when connecting', () => {
      render(
        <IntegrationCard
          integration={makeIntegration()}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={true}
        />,
      );
      expect(screen.getByText('Connecting...')).toBeDisabled();
    });

    it('renders scopes tags when present', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ scopes: ['read:user', 'repo'] })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('read:user')).toBeInTheDocument();
      expect(screen.getByText('repo')).toBeInTheDocument();
    });

    it('does not render scopes section when empty', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ scopes: [] })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.queryByText('read:user')).not.toBeInTheDocument();
    });

    it('shows expiry date when connected and expires_at is set', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({
            connected: true,
            status: 'active',
            expires_at: '2026-12-31T00:00:00Z',
          })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText(/Expires:/)).toBeInTheDocument();
    });

    it('renders service icon abbreviation', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ service: 'github' })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('GH')).toBeInTheDocument();
    });

    it('renders fallback icon for unknown service', () => {
      render(
        <IntegrationCard
          integration={makeIntegration({ service: 'custom_service' })}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          connecting={false}
        />,
      );
      expect(screen.getByText('CU')).toBeInTheDocument();
    });
  });

  /* ==== BYOKPanel ==== */

  describe('BYOKPanel', () => {
    it('renders title and description', () => {
      render(<BYOKPanel service="OpenAI" onSave={vi.fn()} saved={false} />);
      expect(screen.getByText('Bring Your Own Key')).toBeInTheDocument();
      expect(screen.getByText(/Use your own API key for OpenAI/)).toBeInTheDocument();
    });

    it('renders password input with placeholder', () => {
      render(<BYOKPanel service="OpenAI" onSave={vi.fn()} saved={false} />);
      const input = screen.getByPlaceholderText('sk-... or API key for OpenAI');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('disables Save Key button when input is empty', () => {
      render(<BYOKPanel service="OpenAI" onSave={vi.fn()} saved={false} />);
      expect(screen.getByText('Save Key')).toBeDisabled();
    });

    it('enables Save Key button when input has value', async () => {
      render(<BYOKPanel service="OpenAI" onSave={vi.fn()} saved={false} />);
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText('sk-... or API key for OpenAI'), 'sk-test-key');
      expect(screen.getByText('Save Key')).not.toBeDisabled();
    });

    it('calls onSave with trimmed key when Save Key is clicked', async () => {
      const onSave = vi.fn();
      render(<BYOKPanel service="OpenAI" onSave={onSave} saved={false} />);
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText('sk-... or API key for OpenAI'), '  sk-test  ');
      await user.click(screen.getByText('Save Key'));
      expect(onSave).toHaveBeenCalledWith('sk-test');
    });

    it('clears input after saving', async () => {
      render(<BYOKPanel service="OpenAI" onSave={vi.fn()} saved={false} />);
      const user = userEvent.setup();
      const input = screen.getByPlaceholderText('sk-... or API key for OpenAI') as HTMLInputElement;
      await user.type(input, 'sk-key');
      await user.click(screen.getByText('Save Key'));
      expect(input.value).toBe('');
    });

    it('shows "Key saved" when saved is true', () => {
      render(<BYOKPanel service="OpenAI" onSave={vi.fn()} saved={true} />);
      expect(screen.getByText('Key saved')).toBeInTheDocument();
    });

    it('does not show "Key saved" when saved is false', () => {
      render(<BYOKPanel service="OpenAI" onSave={vi.fn()} saved={false} />);
      expect(screen.queryByText('Key saved')).not.toBeInTheDocument();
    });
  });

  /* ==== ModelSelector ==== */

  describe('ModelSelector', () => {
    const defaultProps = {
      model: 'claude-sonnet-4-6',
      executionMode: 'raw' as Agent['execution_mode'],
      temperature: 0.7,
      maxTokens: 4096,
      onModelChange: vi.fn(),
      onExecutionModeChange: vi.fn(),
      onTemperatureChange: vi.fn(),
      onMaxTokensChange: vi.fn(),
    };

    it('renders model selector fieldset with aria-label', () => {
      render(<ModelSelector {...defaultProps} />);
      expect(screen.getByLabelText('model-selector')).toBeInTheDocument();
    });

    it('renders temperature display with current value', () => {
      render(<ModelSelector {...defaultProps} temperature={0.85} />);
      expect(screen.getByLabelText(/Temperature: 0\.85/)).toBeInTheDocument();
    });

    it('calls onModelChange when model is changed', async () => {
      const onModelChange = vi.fn();
      render(<ModelSelector {...defaultProps} onModelChange={onModelChange} />);
      const user = userEvent.setup();
      const select = screen.getByLabelText('Model');
      await user.selectOptions(select, 'claude-opus-4-6');
      expect(onModelChange).toHaveBeenCalledWith('claude-opus-4-6');
    });

    it('calls onExecutionModeChange when mode is changed', async () => {
      const onExecutionModeChange = vi.fn();
      render(<ModelSelector {...defaultProps} onExecutionModeChange={onExecutionModeChange} />);
      const user = userEvent.setup();
      const select = screen.getByLabelText('Execution Mode');
      await user.selectOptions(select, 'claude_sdk');
      expect(onExecutionModeChange).toHaveBeenCalledWith('claude_sdk');
    });

    it('renders execution mode description hint', () => {
      render(<ModelSelector {...defaultProps} />);
      expect(
        screen.getByText('Direct LLM streaming with manual tool handling'),
      ).toBeInTheDocument();
    });

    it('renders max tokens input with current value', () => {
      render(<ModelSelector {...defaultProps} maxTokens={8192} />);
      const input = screen.getByLabelText('Max Tokens') as HTMLInputElement;
      expect(input.value).toBe('8192');
    });
  });

  /* ==== SystemPromptEditor ==== */

  describe('SystemPromptEditor', () => {
    it('renders the system prompt editor fieldset', () => {
      render(<SystemPromptEditor value="" onChange={vi.fn()} />);
      expect(screen.getByLabelText('system-prompt-editor')).toBeInTheDocument();
    });

    it('renders textarea with placeholder', () => {
      render(<SystemPromptEditor value="" onChange={vi.fn()} />);
      expect(
        screen.getByPlaceholderText('You are a helpful assistant that...'),
      ).toBeInTheDocument();
    });

    it('renders variable insert buttons', () => {
      render(<SystemPromptEditor value="" onChange={vi.fn()} />);
      expect(screen.getByText('User Name')).toBeInTheDocument();
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Time')).toBeInTheDocument();
      expect(screen.getByText('Agent Name')).toBeInTheDocument();
    });

    it('shows character count of 0 for empty value', () => {
      render(<SystemPromptEditor value="" onChange={vi.fn()} />);
      expect(screen.getByText('0 characters')).toBeInTheDocument();
    });

    it('shows correct character count for non-empty value', () => {
      render(<SystemPromptEditor value="Hello world" onChange={vi.fn()} />);
      expect(screen.getByText('11 characters')).toBeInTheDocument();
    });

    it('calls onChange when typing in textarea', async () => {
      const onChange = vi.fn();
      render(<SystemPromptEditor value="" onChange={onChange} />);
      const user = userEvent.setup();
      await user.type(screen.getByPlaceholderText('You are a helpful assistant that...'), 'A');
      expect(onChange).toHaveBeenCalledWith('A');
    });
  });

  /* ==== ToolConfigurator ==== */

  describe('ToolConfigurator', () => {
    it('renders all built-in tool names', () => {
      render(
        <ToolConfigurator
          tools={[]}
          mcpServers={[]}
          onToolsChange={vi.fn()}
          onMcpServersChange={vi.fn()}
        />,
      );
      expect(screen.getByText('memory')).toBeInTheDocument();
      expect(screen.getByText('web_search')).toBeInTheDocument();
      expect(screen.getByText('code_execution')).toBeInTheDocument();
      expect(screen.getByText('filesystem')).toBeInTheDocument();
    });

    it('renders built-in tool descriptions', () => {
      render(
        <ToolConfigurator
          tools={[]}
          mcpServers={[]}
          onToolsChange={vi.fn()}
          onMcpServersChange={vi.fn()}
        />,
      );
      expect(screen.getByText('Store and retrieve agent memories')).toBeInTheDocument();
      expect(screen.getByText('Search the web for information')).toBeInTheDocument();
    });

    it('shows checked state for enabled tools', () => {
      const tools: ToolConfig[] = [
        {
          name: 'memory',
          description: 'Store and retrieve agent memories',
          input_schema: {},
          requires_approval: false,
        },
      ];
      render(
        <ToolConfigurator
          tools={tools}
          mcpServers={[]}
          onToolsChange={vi.fn()}
          onMcpServersChange={vi.fn()}
        />,
      );
      const memoryCheckbox = screen
        .getByText('memory')
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(memoryCheckbox.checked).toBe(true);
    });

    it('calls onToolsChange when toggling a tool on', async () => {
      const onToolsChange = vi.fn();
      render(
        <ToolConfigurator
          tools={[]}
          mcpServers={[]}
          onToolsChange={onToolsChange}
          onMcpServersChange={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      const checkbox = screen
        .getByText('memory')
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as Element;
      await user.click(checkbox);
      expect(onToolsChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'memory' })]),
      );
    });

    it('calls onToolsChange to remove tool when toggling off', async () => {
      const tools: ToolConfig[] = [
        { name: 'memory', description: 'test', input_schema: {}, requires_approval: false },
      ];
      const onToolsChange = vi.fn();
      render(
        <ToolConfigurator
          tools={tools}
          mcpServers={[]}
          onToolsChange={onToolsChange}
          onMcpServersChange={vi.fn()}
        />,
      );
      const user = userEvent.setup();
      const checkbox = screen
        .getByText('memory')
        .closest('label')
        ?.querySelector('input[type="checkbox"]') as Element;
      await user.click(checkbox);
      expect(onToolsChange).toHaveBeenCalledWith([]);
    });

    it('shows "No MCP servers configured." when no servers', () => {
      render(
        <ToolConfigurator
          tools={[]}
          mcpServers={[]}
          onToolsChange={vi.fn()}
          onMcpServersChange={vi.fn()}
        />,
      );
      expect(screen.getByText('No MCP servers configured.')).toBeInTheDocument();
    });

    it('renders MCP server items when servers are present', () => {
      const servers: McpServerConfig[] = [
        { name: 'web-search', transport: 'stdio', command: 'npx' },
      ];
      render(
        <ToolConfigurator
          tools={[]}
          mcpServers={servers}
          onToolsChange={vi.fn()}
          onMcpServersChange={vi.fn()}
        />,
      );
      expect(screen.getByText('web-search')).toBeInTheDocument();
      expect(screen.getByText('stdio')).toBeInTheDocument();
    });

    it('renders Edit and Remove buttons for MCP servers', () => {
      const servers: McpServerConfig[] = [
        { name: 'test-server', transport: 'sse', url: 'https://example.com' },
      ];
      render(
        <ToolConfigurator
          tools={[]}
          mcpServers={servers}
          onToolsChange={vi.fn()}
          onMcpServersChange={vi.fn()}
        />,
      );
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });
  });

  /* ==== VisibilitySelector ==== */

  describe('VisibilitySelector', () => {
    it('renders all visibility options', () => {
      render(<VisibilitySelector value="private" onChange={vi.fn()} />);
      expect(screen.getByText('Public')).toBeInTheDocument();
      expect(screen.getByText('Unlisted')).toBeInTheDocument();
      expect(screen.getByText('Private')).toBeInTheDocument();
    });

    it('renders visibility descriptions', () => {
      render(<VisibilitySelector value="private" onChange={vi.fn()} />);
      expect(screen.getByText('Visible on marketplace and searchable')).toBeInTheDocument();
      expect(screen.getByText('Accessible via link, not listed')).toBeInTheDocument();
      expect(screen.getByText('Only you can access')).toBeInTheDocument();
    });

    it('selects the current value', () => {
      render(<VisibilitySelector value="public" onChange={vi.fn()} />);
      const publicRadio = document.querySelector('input[value="public"]') as HTMLInputElement;
      expect(publicRadio.checked).toBe(true);
    });

    it('calls onChange when selecting a different visibility', async () => {
      const onChange = vi.fn();
      render(<VisibilitySelector value="private" onChange={onChange} />);
      const user = userEvent.setup();
      const publicRadio = document.querySelector('input[value="public"]') as HTMLInputElement;
      await user.click(publicRadio);
      expect(onChange).toHaveBeenCalledWith('public');
    });
  });

  /* ==== MCPServerForm ==== */

  describe('MCPServerForm', () => {
    it('renders the MCP server form with aria-label', () => {
      render(<MCPServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByLabelText('mcp-server-form')).toBeInTheDocument();
    });

    it('shows "Add MCP Server" title for new server', () => {
      render(<MCPServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText('Add MCP Server')).toBeInTheDocument();
    });

    it('shows "Edit MCP Server" title when editing', () => {
      const initial: McpServerConfig = { name: 'test', transport: 'stdio', command: 'npx' };
      render(<MCPServerForm initial={initial} onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByText('Edit MCP Server')).toBeInTheDocument();
    });

    it('renders name input with placeholder', () => {
      render(<MCPServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByPlaceholderText('e.g. web-search')).toBeInTheDocument();
    });

    it('renders transport selector with all options', () => {
      render(<MCPServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
      const select = screen.getByLabelText('Transport') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toContain('stdio');
      expect(options).toContain('sse');
      expect(options).toContain('streamable_http');
    });

    it('shows command and args fields for stdio transport', () => {
      render(<MCPServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByPlaceholderText('e.g. npx')).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText('e.g. -y, @modelcontextprotocol/server-web-search'),
      ).toBeInTheDocument();
    });

    it('shows URL field for SSE transport', async () => {
      render(<MCPServerForm onSave={vi.fn()} onCancel={vi.fn()} />);
      const user = userEvent.setup();
      await user.selectOptions(screen.getByLabelText('Transport'), 'sse');
      expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();
    });

    it('calls onCancel when Cancel is clicked', async () => {
      const onCancel = vi.fn();
      render(<MCPServerForm onSave={vi.fn()} onCancel={onCancel} />);
      const user = userEvent.setup();
      await user.click(screen.getByText('Cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('pre-populates form when editing', () => {
      const initial: McpServerConfig = {
        name: 'my-server',
        transport: 'stdio',
        command: 'node',
        args: ['index.js'],
      };
      render(<MCPServerForm initial={initial} onSave={vi.fn()} onCancel={vi.fn()} />);
      const nameInput = screen.getByPlaceholderText('e.g. web-search') as HTMLInputElement;
      expect(nameInput.value).toBe('my-server');
      const commandInput = screen.getByPlaceholderText('e.g. npx') as HTMLInputElement;
      expect(commandInput.value).toBe('node');
    });
  });
});
