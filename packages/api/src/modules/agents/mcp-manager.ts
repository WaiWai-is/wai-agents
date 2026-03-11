import type { McpTool } from './llm/index.js';

export interface McpServerConfig {
  url: string;
  name: string;
}

interface McpToolWithServer extends McpTool {
  serverName: string;
  serverUrl: string;
}

export class McpManager {
  private tools: McpToolWithServer[] = [];
  private servers: McpServerConfig[] = [];
  private apiKey: string | undefined = process.env.MCP_API_KEY;

  async connect(servers: McpServerConfig[]): Promise<void> {
    this.servers = servers;
    this.tools = [];

    await Promise.all(
      servers.map(async (server) => {
        const discovered = await this.discoverTools(server);
        this.tools.push(...discovered);
      })
    );
  }

  private async discoverTools(server: McpServerConfig): Promise<McpToolWithServer[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const response = await fetch(`${server.url}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });

    if (!response.ok) {
      throw new Error(
        `MCP server ${server.name} (${server.url}) returned ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      result?: {
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }>;
      };
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`MCP server ${server.name} tools/list error: ${data.error.message}`);
    }

    const rawTools = data.result?.tools ?? [];
    return rawTools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
      serverName: server.name,
      serverUrl: server.url,
    }));
  }

  getTools(): McpTool[] {
    return this.tools.map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  async executeTool(
    name: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    const tool = this.tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found in any connected MCP server`);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    const response = await fetch(`${tool.serverUrl}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name, arguments: input },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `MCP tool call to ${tool.serverUrl} failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      result?: unknown;
      error?: { message: string };
    };

    if (data.error) {
      throw new Error(`MCP tool '${name}' execution error: ${(data.error as any).message}`);
    }

    return data.result;
  }

  async disconnect(): Promise<void> {
    // HTTP-based MCP servers are stateless; nothing to close
    this.tools = [];
    this.servers = [];
  }
}
