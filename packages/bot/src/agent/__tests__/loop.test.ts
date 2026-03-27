import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted to create the mock fn before vi.mock runs
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

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

import { runAgent } from "../loop.js";

function makeTextResponse(text: string, tokens = { input: 100, output: 50 }) {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: tokens.input, output_tokens: tokens.output },
  };
}

function makeToolUseResponse(tools: Array<{ name: string; id: string; input: Record<string, unknown> }>, tokens = { input: 100, output: 50 }) {
  return {
    content: tools.map((t) => ({
      type: "tool_use",
      id: t.id,
      name: t.name,
      input: t.input,
    })),
    stop_reason: "tool_use",
    usage: { input_tokens: tokens.input, output_tokens: tokens.output },
  };
}

describe("runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns text response from Claude", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("Hello! I'm Wai."));

    const result = await runAgent({
      message: "Hi",
      userId: "123",
    });

    expect(result.response).toBe("Hello! I'm Wai.");
    expect(result.intent).toBeDefined();
    expect(result.modelUsed).toBeDefined();
  });

  it("tracks token usage", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("Test", { input: 200, output: 100 }));

    const result = await runAgent({
      message: "Test",
      userId: "123",
    });

    expect(result.inputTokens).toBe(200);
    expect(result.outputTokens).toBe(100);
  });

  it("handles tool use and continues loop", async () => {
    // First call: Claude wants to use search_messages tool
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([{
        name: "search_messages",
        id: "tool_1",
        input: { query: "pricing discussion" },
      }]),
    );
    // Second call: Claude responds with text
    mockCreate.mockResolvedValueOnce(makeTextResponse("Found results about pricing."));

    const result = await runAgent({
      message: "What did we discuss about pricing?",
      userId: "123",
    });

    expect(result.response).toBe("Found results about pricing.");
    expect(result.toolCalls).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("handles multiple tool calls in one turn", async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([
        { name: "search_messages", id: "tool_1", input: { query: "budget" } },
        { name: "extract_entities", id: "tool_2", input: { text: "budget info" } },
      ]),
    );
    mockCreate.mockResolvedValueOnce(makeTextResponse("Here's what I found."));

    const result = await runAgent({
      message: "Extract budget info",
      userId: "123",
    });

    expect(result.toolCalls).toBe(2);
    expect(result.response).toBe("Here's what I found.");
  });

  it("handles track_commitment tool", async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([{
        name: "track_commitment",
        id: "tool_1",
        input: { who: "Alex", what: "send report", direction: "they_promised" },
      }]),
    );
    mockCreate.mockResolvedValueOnce(makeTextResponse("Tracked Alex's promise."));

    const result = await runAgent({
      message: "Alex promised to send the report",
      userId: "123",
    });

    expect(result.toolCalls).toBe(1);
  });

  it("includes voice transcript in message", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("I heard your voice message."));

    await runAgent({
      message: "",
      userId: "123",
      voiceTranscript: "Hello this is a voice message",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const lastMessage = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMessage.content).toContain("[Voice transcript]");
    expect(lastMessage.content).toContain("Hello this is a voice message");
  });

  it("includes conversation history", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("Based on our conversation..."));

    await runAgent({
      message: "Continue our discussion",
      userId: "123",
      conversationHistory: [
        { role: "user", content: "Previous question" },
        { role: "assistant", content: "Previous answer" },
      ],
    });

    const callArgs = mockCreate.mock.calls[0][0];
    // History + current message
    expect(callArgs.messages.length).toBe(3);
    expect(callArgs.messages[0].content).toBe("Previous question");
    expect(callArgs.messages[1].content).toBe("Previous answer");
  });

  it("truncates conversation history to last 20 messages", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("OK"));

    const longHistory = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}`,
    }));

    await runAgent({
      message: "Latest",
      userId: "123",
      conversationHistory: longHistory,
    });

    const callArgs = mockCreate.mock.calls[0][0];
    // 20 history + 1 current = 21
    expect(callArgs.messages.length).toBe(21);
  });

  it("reaches max turns limit", async () => {
    // All responses are tool_use, forcing loop to max out
    for (let i = 0; i < 10; i++) {
      mockCreate.mockResolvedValueOnce(
        makeToolUseResponse([{
          name: "search_messages",
          id: `tool_${i}`,
          input: { query: `search ${i}` },
        }]),
      );
    }

    const result = await runAgent({
      message: "complex query",
      userId: "123",
    });

    expect(result.response).toContain("turn limit");
    expect(result.toolCalls).toBe(10);
  });

  it("handles empty text response gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    const result = await runAgent({
      message: "test",
      userId: "123",
    });

    expect(result.response).toBe("I processed your request.");
  });

  it("passes system prompt to Claude", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("Hello Mik!"));

    await runAgent({
      message: "Hi",
      userId: "123",
      userName: "Mik",
      userLanguage: "en",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toBeDefined();
    expect(callArgs.system).toContain("[Identity]");
  });

  it("passes tools to Claude", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("OK"));

    await runAgent({
      message: "search for something",
      userId: "123",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools.length).toBe(3);
    expect(callArgs.tools.map((t: { name: string }) => t.name)).toEqual([
      "search_messages",
      "track_commitment",
      "extract_entities",
    ]);
  });

  it("accumulates tokens across multiple turns", async () => {
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse(
        [{ name: "search_messages", id: "t1", input: { query: "test" } }],
        { input: 100, output: 50 },
      ),
    );
    mockCreate.mockResolvedValueOnce(makeTextResponse("Done", { input: 150, output: 80 }));

    const result = await runAgent({
      message: "search test",
      userId: "123",
    });

    expect(result.inputTokens).toBe(250); // 100 + 150
    expect(result.outputTokens).toBe(130); // 50 + 80
  });

  it("classifies intent from message", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("Search results..."));

    const result = await runAgent({
      message: "What did Alex say about pricing?",
      userId: "123",
    });

    expect(result.intent).toBe("search");
  });

  it("combines voice transcript with user text", async () => {
    mockCreate.mockResolvedValueOnce(makeTextResponse("OK"));

    await runAgent({
      message: "Extra context",
      userId: "123",
      voiceTranscript: "Voice text here",
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const lastMsg = callArgs.messages[callArgs.messages.length - 1];
    expect(lastMsg.content).toContain("Voice text here");
    expect(lastMsg.content).toContain("Extra context");
  });

  // Error handling tests
  it("throws on API error (rate limit)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("rate_limit_exceeded"));

    await expect(runAgent({
      message: "test",
      userId: "123",
    })).rejects.toThrow("rate_limit_exceeded");
  });

  it("throws on API error (auth failure)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("authentication_error"));

    await expect(runAgent({
      message: "test",
      userId: "123",
    })).rejects.toThrow("authentication_error");
  });

  it("throws on API error (network timeout)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(runAgent({
      message: "test",
      userId: "123",
    })).rejects.toThrow("ECONNREFUSED");
  });

  it("throws on API error mid-loop (after tool use)", async () => {
    // First call succeeds with tool use
    mockCreate.mockResolvedValueOnce(
      makeToolUseResponse([{
        name: "search_messages",
        id: "tool_1",
        input: { query: "test" },
      }]),
    );
    // Second call fails
    mockCreate.mockRejectedValueOnce(new Error("internal_server_error"));

    await expect(runAgent({
      message: "search test",
      userId: "123",
    })).rejects.toThrow("internal_server_error");
  });
});
