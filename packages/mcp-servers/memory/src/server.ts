import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  SaveMemoryInput,
  SearchMemoriesInput,
  ForgetMemoryInput,
  UpdateMemoryInput,
  GetMemoriesInput,
  handleSaveMemory,
  handleSearchMemories,
  handleForgetMemory,
  handleUpdateMemory,
  handleGetMemories,
} from './tools.js';

const server = new McpServer({
  name: 'waiagents-memory',
  version: '0.1.0',
});

server.tool(
  'save_memory',
  'Save a new memory with semantic embedding for an agent-user pair',
  SaveMemoryInput.shape,
  async (input) => {
    const result = await handleSaveMemory(input as z.infer<typeof SaveMemoryInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'search_memories',
  'Semantic search for memories using pgvector cosine similarity',
  SearchMemoriesInput.shape,
  async (input) => {
    const result = await handleSearchMemories(input as z.infer<typeof SearchMemoriesInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'forget_memory',
  'Delete a specific memory by ID',
  ForgetMemoryInput.shape,
  async (input) => {
    const result = await handleForgetMemory(input as z.infer<typeof ForgetMemoryInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'update_memory',
  'Update the content and/or importance of an existing memory',
  UpdateMemoryInput.shape,
  async (input) => {
    const result = await handleUpdateMemory(input as z.infer<typeof UpdateMemoryInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'get_memories',
  'List memories for an agent-user pair, optionally filtered by type',
  GetMemoriesInput.shape,
  async (input) => {
    const result = await handleGetMemories(input as z.infer<typeof GetMemoriesInput>);
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
    res.end(JSON.stringify({ status: 'ok', server: 'waiagents-memory' }));
    return;
  }

  if (req.url === '/mcp' && (req.method === 'POST' || req.method === 'GET' || req.method === 'DELETE')) {
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

const port = Number(process.env.MCP_MEMORY_PORT) || 3100;

await server.connect(transport);

httpServer.listen(port, () => {
  console.log(`waiagents-memory MCP server on port ${port}`);
});
