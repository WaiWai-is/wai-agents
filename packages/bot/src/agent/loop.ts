/**
 * Agent Loop — the execution engine powered by Claude Agent SDK.
 *
 * Uses @anthropic-ai/claude-agent-sdk with custom MCP tools
 * for search, commitment tracking, and entity extraction.
 */

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { log, captureError, type AgentResult } from "@wai/core";
import { classifyIntent, getModelForIntent } from "./router.js";
import { buildSoulPrompt } from "./soul.js";

// Custom MCP tools for Wai
const searchMessages = tool(
  "search_messages",
  "Search user's Telegram message history by semantic meaning.",
  { query: z.string().describe("Natural language search query") },
  async ({ query: searchQuery }) => {
    log.info({ service: "tool", action: "search_messages", query: searchQuery });
    // TODO: implement pgvector semantic search
    return {
      content: [{ type: "text" as const, text: `[Search results for: ${searchQuery}] (search implementation pending)` }],
    };
  },
);

const trackCommitment = tool(
  "track_commitment",
  "Track a promise or commitment detected in conversation.",
  {
    who: z.string().describe("Person who made the promise"),
    what: z.string().describe("What was promised"),
    deadline: z.string().optional().describe("When it should be done"),
    direction: z.enum(["i_promised", "they_promised"]).describe("Direction of the commitment"),
  },
  async ({ who, what, direction }) => {
    log.info({ service: "tool", action: "track_commitment", who, what, direction });
    // TODO: save to commitments table
    const dirText = direction === "i_promised" ? "you promised" : "promised";
    return {
      content: [{ type: "text" as const, text: `✅ Tracked: ${who} ${dirText} to ${what}` }],
    };
  },
);

const extractEntities = tool(
  "extract_entities",
  "Extract people, topics, decisions, amounts from text.",
  { text: z.string().describe("Text to extract entities from") },
  async ({ text }) => {
    log.info({ service: "tool", action: "extract_entities", textLength: text.length });
    // Use the pattern-based extractor
    const { extractEntities: extract, formatEntities } = await import("./entities.js");
    const entities = extract(text);
    return {
      content: [{ type: "text" as const, text: entities.length > 0 ? formatEntities(entities) : "No entities detected." }],
    };
  },
);

// Create in-process MCP server with Wai tools
const waiToolsServer = createSdkMcpServer({
  name: "wai-tools",
  tools: [searchMessages, trackCommitment, extractEntities],
});

export async function runAgent(opts: {
  message: string;
  userId: string;
  userName?: string;
  userLanguage?: string;
  hasVoice?: boolean;
  voiceTranscript?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<AgentResult> {
  log.info({ service: "agent", action: "run-start", userId: opts.userId, messageLength: opts.message.length });

  // 1. Classify intent
  const intent = classifyIntent(opts.message, opts.hasVoice);
  const model = getModelForIntent(intent);
  log.debug({ service: "agent", action: "classified", intent, model });

  // 2. Build soul prompt
  const systemPrompt = buildSoulPrompt({
    userName: opts.userName,
    userLanguage: opts.userLanguage,
  });

  // 3. Build prompt with conversation context
  let prompt = "";

  // Include conversation history as context
  if (opts.conversationHistory && opts.conversationHistory.length > 0) {
    const historyText = opts.conversationHistory
      .slice(-20)
      .map((msg) => `${msg.role === "user" ? "User" : "Wai"}: ${msg.content}`)
      .join("\n\n");
    prompt += `Previous conversation:\n${historyText}\n\n---\n\n`;
  }

  // Add current message
  if (opts.voiceTranscript) {
    prompt += opts.message
      ? `[Voice transcript]: ${opts.voiceTranscript}\n\nUser's text: ${opts.message}`
      : `[Voice transcript]: ${opts.voiceTranscript}`;
  } else {
    prompt += opts.message;
  }

  // 4. Run via Agent SDK
  let result = "";

  try {
    for await (const message of query({
      prompt,
      options: {
        systemPrompt,
        model,
        maxTurns: 10,
        tools: [],
        mcpServers: { "wai-tools": waiToolsServer },
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if ("result" in message) {
        result = message.result;
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error({ service: "agent", action: "sdk-error", userId: opts.userId, error: errMsg });
    captureError(error instanceof Error ? error : new Error(errMsg), { userId: opts.userId, intent });
    throw error;
  }

  log.info({ service: "agent", action: "run-complete", userId: opts.userId, intent, responseLength: result.length });

  return {
    response: result || "I processed your request.",
    intent,
    modelUsed: model,
    inputTokens: 0, // Agent SDK doesn't expose token counts directly
    outputTokens: 0,
    toolCalls: 0,
  };
}
