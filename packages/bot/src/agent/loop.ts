/**
 * Agent Loop — the execution engine.
 *
 * Takes a user message, classifies intent, builds soul prompt,
 * calls Claude with tools, handles tool execution, returns response.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config, log, captureError, type AgentResult, type Intent } from "@wai/core";
import { classifyIntent, getModelForIntent } from "./router.js";
import { buildSoulPrompt } from "./soul.js";

const MAX_TURNS = 10;

const client = new Anthropic({ apiKey: config.anthropicApiKey });

// Tool definitions for Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_messages",
    description: "Search user's Telegram message history by semantic meaning.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "track_commitment",
    description: "Track a promise or commitment detected in conversation.",
    input_schema: {
      type: "object" as const,
      properties: {
        who: { type: "string", description: "Person who made the promise" },
        what: { type: "string", description: "What was promised" },
        deadline: { type: "string", description: "When it should be done" },
        direction: { type: "string", enum: ["i_promised", "they_promised"] },
      },
      required: ["who", "what", "direction"],
    },
  },
  {
    name: "extract_entities",
    description: "Extract people, topics, decisions, amounts from text.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Text to extract entities from" },
      },
      required: ["text"],
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "search_messages":
        return `[Search results for: ${input.query}] (search implementation pending)`;
      case "track_commitment":
        return `✅ Tracked: ${input.who} ${input.direction === "i_promised" ? "you promised" : "promised"} to ${input.what}`;
      case "extract_entities":
        return `[Entities extracted from text] (extraction implementation pending)`;
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (error) {
    return `Error executing ${name}: ${error}`;
  }
}

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

  // 3. Build message history
  const messages: Anthropic.MessageParam[] = [];
  for (const msg of opts.conversationHistory?.slice(-20) ?? []) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current message
  let userContent = opts.message;
  if (opts.voiceTranscript) {
    userContent = opts.message
      ? `[Voice transcript]: ${opts.voiceTranscript}\n\nUser's text: ${opts.message}`
      : `[Voice transcript]: ${opts.voiceTranscript}`;
  }
  messages.push({ role: "user", content: userContent });

  // 4. Agent loop with tool calling
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let toolCallCount = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        tools: TOOLS,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error({ service: "agent", action: "api-error", userId: opts.userId, error: errMsg, turn });
      captureError(error instanceof Error ? error : new Error(errMsg), { userId: opts.userId, intent, turn: String(turn) });
      throw error;
    }

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolCallCount++;
          log.info({ service: "agent", action: "tool-call", tool: block.name, turn, userId: opts.userId });
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // Extract text response
    const textParts: string[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        textParts.push(block.text);
      }
    }

    log.info({
      service: "agent", action: "run-complete", userId: opts.userId,
      intent, inputTokens: totalInputTokens, outputTokens: totalOutputTokens,
      toolCalls: toolCallCount, turns: turn + 1,
    });

    return {
      response: textParts.join("\n") || "I processed your request.",
      intent,
      modelUsed: model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolCalls: toolCallCount,
    };
  }

  log.warn({ service: "agent", action: "max-turns", userId: opts.userId, toolCalls: toolCallCount });

  return {
    response: "I've been working on this but reached my turn limit.",
    intent,
    modelUsed: model,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    toolCalls: toolCallCount,
  };
}
