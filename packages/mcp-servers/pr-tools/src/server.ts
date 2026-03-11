import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  AddSourceInput,
  ListSourcesInput,
  RemoveSourceInput,
  UpdateSourceInput,
  CollectArticlesInput,
  SearchArticlesInput,
  GetArticleDetailsInput,
  SummarizeArticleInput,
  GetTodaySummaryInput,
  CreateProposalInput,
  ListProposalsInput,
  UpdateProposalStatusInput,
  GetProposalInput,
  AnalyzeTrendsInput,
  SuggestTopicsInput,
  GenerateBriefingInput,
  handleAddSource,
  handleListSources,
  handleRemoveSource,
  handleUpdateSource,
  handleCollectArticles,
  handleSearchArticles,
  handleGetArticleDetails,
  handleSummarizeArticle,
  handleGetTodaySummary,
  handleCreateProposal,
  handleListProposals,
  handleUpdateProposalStatus,
  handleGetProposal,
  handleAnalyzeTrends,
  handleSuggestTopics,
  handleGenerateBriefing,
} from './tools.js';

const server = new McpServer({
  name: 'waiagents-pr-tools',
  version: '0.1.0',
});

// ─── Sources ──────────────────────────────────────────────────────────────────

server.tool(
  'add_source',
  'Add an RSS/API/web source for an agent to monitor',
  AddSourceInput.shape,
  async (input) => {
    const result = await handleAddSource(input as z.infer<typeof AddSourceInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'list_sources',
  "List all sources configured for an agent",
  ListSourcesInput.shape,
  async (input) => {
    const result = await handleListSources(input as z.infer<typeof ListSourcesInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'remove_source',
  'Remove a source by ID',
  RemoveSourceInput.shape,
  async (input) => {
    const result = await handleRemoveSource(input as z.infer<typeof RemoveSourceInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'update_source',
  'Update source name, URL, or config',
  UpdateSourceInput.shape,
  async (input) => {
    const result = await handleUpdateSource(input as z.infer<typeof UpdateSourceInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

// ─── Articles ─────────────────────────────────────────────────────────────────

server.tool(
  'collect_articles',
  "Fetch and store articles from all of an agent's sources",
  CollectArticlesInput.shape,
  async (input) => {
    const result = await handleCollectArticles(input as z.infer<typeof CollectArticlesInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'search_articles',
  'Search collected articles by keyword, with optional date range',
  SearchArticlesInput.shape,
  async (input) => {
    const result = await handleSearchArticles(input as z.infer<typeof SearchArticlesInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'get_article_details',
  'Get full details of a specific article by ID',
  GetArticleDetailsInput.shape,
  async (input) => {
    const result = await handleGetArticleDetails(input as z.infer<typeof GetArticleDetailsInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'summarize_article',
  'Generate an AI summary for an article using Claude',
  SummarizeArticleInput.shape,
  async (input) => {
    const result = await handleSummarizeArticle(input as z.infer<typeof SummarizeArticleInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'get_today_summary',
  "Get today's collected articles as a digest for an agent",
  GetTodaySummaryInput.shape,
  async (input) => {
    const result = await handleGetTodaySummary(input as z.infer<typeof GetTodaySummaryInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

// ─── Proposals ────────────────────────────────────────────────────────────────

server.tool(
  'create_proposal',
  'Create a new PR strategy proposal',
  CreateProposalInput.shape,
  async (input) => {
    const result = await handleCreateProposal(input as z.infer<typeof CreateProposalInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'list_proposals',
  "List an agent's proposals, optionally filtered by status",
  ListProposalsInput.shape,
  async (input) => {
    const result = await handleListProposals(input as z.infer<typeof ListProposalsInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'update_proposal_status',
  'Approve, reject, or archive a proposal',
  UpdateProposalStatusInput.shape,
  async (input) => {
    const result = await handleUpdateProposalStatus(input as z.infer<typeof UpdateProposalStatusInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'get_proposal',
  'Get full details of a specific proposal by ID',
  GetProposalInput.shape,
  async (input) => {
    const result = await handleGetProposal(input as z.infer<typeof GetProposalInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

// ─── Strategy ─────────────────────────────────────────────────────────────────

server.tool(
  'analyze_trends',
  'Analyze keyword trends across collected articles for a given timeframe',
  AnalyzeTrendsInput.shape,
  async (input) => {
    const result = await handleAnalyzeTrends(input as z.infer<typeof AnalyzeTrendsInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'suggest_topics',
  'Use Claude to suggest PR topics based on recent collected articles',
  SuggestTopicsInput.shape,
  async (input) => {
    const result = await handleSuggestTopics(input as z.infer<typeof SuggestTopicsInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

server.tool(
  'generate_briefing',
  'Compile a structured PR briefing from articles and proposals for a given date',
  GenerateBriefingInput.shape,
  async (input) => {
    const result = await handleGenerateBriefing(input as z.infer<typeof GenerateBriefingInput>);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  },
);

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const MCP_API_KEY = process.env.MCP_API_KEY;

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'waiagents-pr-tools' }));
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

const port = Number(process.env.MCP_PR_TOOLS_PORT) || 3102;

await server.connect(transport);

httpServer.listen(port, () => {
  console.log(`waiagents-pr-tools MCP server on port ${port}`);
});
