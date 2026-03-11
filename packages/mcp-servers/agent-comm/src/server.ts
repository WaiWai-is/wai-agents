import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  SendToAgentInput,
  CreateAgentConversationInput,
  ReadConversationInput,
  ListAgentConversationsInput,
  GetAgentInfoInput,
  DiscoverAgentsInput,
  handleSendToAgent,
  handleCreateAgentConversation,
  handleReadConversation,
  handleListAgentConversations,
  handleGetAgentInfo,
  handleDiscoverAgents,
} from './tools.js';

const server = new McpServer({
  name: 'waiagents-agent-comm',
  version: '0.1.0',
});

server.tool(
  'send_to_agent',
  'Send a message to another agent and receive a response. Supports agent-to-agent communication with recursion depth limit of 3.',
  SendToAgentInput.shape,
  async (input) => {
    const result = await handleSendToAgent(input as z.infer<typeof SendToAgentInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'create_agent_conversation',
  'Create a conversation for agent-to-agent communication with multiple agents as participants.',
  CreateAgentConversationInput.shape,
  async (input) => {
    const result = await handleCreateAgentConversation(
      input as z.infer<typeof CreateAgentConversationInput>,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'read_conversation',
  'Read messages from a conversation, ordered by most recent first.',
  ReadConversationInput.shape,
  async (input) => {
    const result = await handleReadConversation(input as z.infer<typeof ReadConversationInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'list_agent_conversations',
  'List all conversations that an agent participates in.',
  ListAgentConversationsInput.shape,
  async (input) => {
    const result = await handleListAgentConversations(
      input as z.infer<typeof ListAgentConversationsInput>,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'get_agent_info',
  'Get details about another agent including name, description, model, and available tools.',
  GetAgentInfoInput.shape,
  async (input) => {
    const result = await handleGetAgentInfo(input as z.infer<typeof GetAgentInfoInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'discover_agents',
  'Search and discover available agents by capability, category, or keyword. Returns Agent Cards with capabilities and ratings.',
  DiscoverAgentsInput.shape,
  async (input) => {
    const result = await handleDiscoverAgents(input as z.infer<typeof DiscoverAgentsInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const MCP_API_KEY = process.env.MCP_API_KEY;

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // stateless mode
});

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'waiagents-agent-comm' }));
    return;
  }

  if (
    req.url === '/mcp' &&
    (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE')
  ) {
    if (MCP_API_KEY) {
      const authHeader = (req.headers['authorization'] || req.headers['x-api-key']) as string | undefined;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      if (token !== MCP_API_KEY) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }
    await transport.handleRequest(req, res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const port = Number(process.env.MCP_AGENT_COMM_PORT) || 3103;

await server.connect(transport);

httpServer.listen(port, () => {
  console.log(`waiagents-agent-comm MCP server on port ${port}`);
});
