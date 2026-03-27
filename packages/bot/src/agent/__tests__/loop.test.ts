import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock for the Agent SDK query function
const { mockQueryMessages } = vi.hoisted(() => ({
  mockQueryMessages: [] as Array<{ result?: string; type?: string }>,
}));

// Mock the Agent SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn().mockImplementation(() => {
    // Return an async generator from mockQueryMessages
    return (async function* () {
      for (const msg of mockQueryMessages) {
        yield msg;
      }
    })();
  }),
  tool: vi.fn().mockImplementation((name: string, desc: string, schema: unknown, handler: unknown) => ({
    name,
    description: desc,
    inputSchema: schema,
    handler,
  })),
  createSdkMcpServer: vi.fn().mockReturnValue({
    type: "sdk",
    name: "wai-tools",
    instance: {},
  }),
}));

// Mock @wai/core
vi.mock("@wai/core", () => ({
  config: { anthropicApiKey: "test-key" },
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  captureError: vi.fn(),
}));

// Mock zod — chain-friendly (must be hoisted)
vi.mock("zod", () => {
  const createChainable = (): Record<string, unknown> =>
    new Proxy({} as Record<string, unknown>, {
      get: () => (..._args: unknown[]) => createChainable(),
    });
  return {
    z: new Proxy({} as Record<string, unknown>, {
      get: () => (..._args: unknown[]) => createChainable(),
    }),
  };
});

import { runAgent } from "../loop.js";
import { query as mockQuery } from "@anthropic-ai/claude-agent-sdk";

describe("runAgent (Agent SDK)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryMessages.length = 0;
  });

  it("returns text result from Agent SDK", async () => {
    mockQueryMessages.push({ result: "Hello! I'm Wai." });

    const result = await runAgent({
      message: "Hi",
      userId: "123",
    });

    expect(result.response).toBe("Hello! I'm Wai.");
    expect(result.intent).toBeDefined();
    expect(result.modelUsed).toBeDefined();
  });

  it("classifies intent from message", async () => {
    mockQueryMessages.push({ result: "Search results..." });

    const result = await runAgent({
      message: "What did Alex say about pricing?",
      userId: "123",
    });

    expect(result.intent).toBe("search");
  });

  it("passes systemPrompt and model to query", async () => {
    mockQueryMessages.push({ result: "OK" });

    await runAgent({
      message: "Hi",
      userId: "123",
      userName: "Mik",
      userLanguage: "en",
    });

    expect(mockQuery).toHaveBeenCalledOnce();
    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.options.systemPrompt).toContain("[Identity]");
    expect(callArgs.options.model).toBeDefined();
  });

  it("includes conversation history in prompt", async () => {
    mockQueryMessages.push({ result: "Based on our conversation..." });

    await runAgent({
      message: "Continue our discussion",
      userId: "123",
      conversationHistory: [
        { role: "user", content: "Previous question" },
        { role: "assistant", content: "Previous answer" },
      ],
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.prompt).toContain("Previous question");
    expect(callArgs.prompt).toContain("Previous answer");
    expect(callArgs.prompt).toContain("Continue our discussion");
  });

  it("includes voice transcript in prompt", async () => {
    mockQueryMessages.push({ result: "I heard your voice." });

    await runAgent({
      message: "",
      userId: "123",
      voiceTranscript: "Hello this is a voice message",
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.prompt).toContain("[Voice transcript]");
    expect(callArgs.prompt).toContain("Hello this is a voice message");
  });

  it("combines voice transcript with user text", async () => {
    mockQueryMessages.push({ result: "OK" });

    await runAgent({
      message: "Extra context",
      userId: "123",
      voiceTranscript: "Voice text here",
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.prompt).toContain("Voice text here");
    expect(callArgs.prompt).toContain("Extra context");
  });

  it("handles empty result gracefully", async () => {
    // No messages yielded by query
    const result = await runAgent({
      message: "test",
      userId: "123",
    });

    expect(result.response).toBe("I processed your request.");
  });

  it("configures MCP server with wai-tools", async () => {
    mockQueryMessages.push({ result: "Done" });

    await runAgent({
      message: "test",
      userId: "123",
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.options.mcpServers).toHaveProperty("wai-tools");
  });

  it("sets maxTurns to 10", async () => {
    mockQueryMessages.push({ result: "Done" });

    await runAgent({
      message: "test",
      userId: "123",
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.options.maxTurns).toBe(10);
  });

  it("bypasses permissions", async () => {
    mockQueryMessages.push({ result: "Done" });

    await runAgent({
      message: "test",
      userId: "123",
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    expect(callArgs.options.allowDangerouslySkipPermissions).toBe(true);
  });

  it("disables built-in tools", async () => {
    mockQueryMessages.push({ result: "Done" });

    await runAgent({
      message: "test",
      userId: "123",
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.options.tools).toEqual([]);
  });

  // Error handling
  it("throws on Agent SDK error", async () => {
    (mockQuery as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      return (async function* () {
        throw new Error("agent_sdk_error");
      })();
    });

    await expect(runAgent({
      message: "test",
      userId: "123",
    })).rejects.toThrow("agent_sdk_error");
  });

  it("throws on network error", async () => {
    (mockQuery as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      return (async function* () {
        throw new Error("ECONNREFUSED");
      })();
    });

    await expect(runAgent({
      message: "test",
      userId: "123",
    })).rejects.toThrow("ECONNREFUSED");
  });

  it("truncates conversation history to last 20", async () => {
    mockQueryMessages.push({ result: "OK" });

    const longHistory = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}`,
    }));

    await runAgent({
      message: "Latest",
      userId: "123",
      conversationHistory: longHistory,
    });

    const callArgs = (mockQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Should contain messages from index 10-29 (last 20), not 0-9
    expect(callArgs.prompt).not.toContain("Message 0");
    expect(callArgs.prompt).toContain("Message 29");
  });

  it("skips non-result messages", async () => {
    mockQueryMessages.push({ type: "system" });
    mockQueryMessages.push({ type: "progress" });
    mockQueryMessages.push({ result: "Final answer" });

    const result = await runAgent({
      message: "test",
      userId: "123",
    });

    expect(result.response).toBe("Final answer");
  });
});
