import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  WebSearchInput,
  FetchPageInput,
  SummarizeUrlInput,
  handleWebSearch,
  handleFetchPage,
  handleSummarizeUrl,
} from './tools.js';

const server = new McpServer({
  name: 'waiagents-web-search',
  version: '0.1.0',
});

server.tool(
  'web_search',
  'Search the web using Anthropic native web search. Returns titles, URLs, and snippets.',
  WebSearchInput.shape,
  async (input) => {
    const result = await handleWebSearch(input as z.infer<typeof WebSearchInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'fetch_page',
  'Fetch and extract text content from a URL, stripping HTML tags.',
  FetchPageInput.shape,
  async (input) => {
    const result = await handleFetchPage(input as z.infer<typeof FetchPageInput>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  },
);

server.tool(
  'summarize_url',
  'Fetch a URL and summarize its content using Claude. Optionally focus on a specific aspect.',
  SummarizeUrlInput.shape,
  async (input) => {
    const result = await handleSummarizeUrl(input as z.infer<typeof SummarizeUrlInput>);
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
    res.end(JSON.stringify({ status: 'ok', server: 'waiagents-web-search' }));
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

const port = Number(process.env.MCP_WEB_SEARCH_PORT) || 3101;

await server.connect(transport);

httpServer.listen(port, () => {
  console.log(`waiagents-web-search MCP server on port ${port}`);
});
