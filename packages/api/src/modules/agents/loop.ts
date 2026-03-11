import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db, sql } from '../../db/connection.js';
import { agents } from '../../db/schema/agents.js';
import { messages } from '../../db/schema/conversations.js';
import { emitAgentEvent, emitMessage } from '../../ws/emitter.js';
import { approvalGate } from './approval-gate.js';
import { callLLM } from './llm/index.js';
import { McpManager } from './mcp-manager.js';
import type { CallerContext } from './soul.js';
import { assembleSoulPrompt } from './soul.js';
import { TraceRecorder } from './trace-recorder.js';

export interface AgentLoopConfig {
  agentId: string;
  conversationId: string;
  userId: string;
  message: string;
  abortSignal?: AbortSignal;
  a2aDepth?: number;
  callerContext?: CallerContext;
  triggerType?: string;
}

export interface AgentLoopResult {
  response: string;
  usage: { input_tokens: number; output_tokens: number };
}

const MAX_TURNS = 25;

export async function runAgentLoop(config: AgentLoopConfig): Promise<AgentLoopResult> {
  const { agentId, conversationId, userId, message, abortSignal, callerContext } = config;
  const runId = randomUUID();
  const triggerType = config.triggerType ?? 'manual';

  // 1. Load agent config from DB
  const agentRows = await db.select().from(agents).where(eq(agents.id, agentId));
  if (agentRows.length === 0) {
    throw new Error(`Agent ${agentId} not found`);
  }
  const agent = agentRows[0];
  const modelName = agent.model ?? 'claude-sonnet-4-6';

  // 2. Assemble system prompt with SOUL blocks
  const systemPrompt = await assembleSoulPrompt(agentId, userId, callerContext);

  // 3. Connect MCP servers and discover tools
  const mcpManager = new McpManager();
  const mcpServers = (agent.mcpServers as Array<{ url: string; name: string }>) ?? [];
  await mcpManager.connect(mcpServers);
  const tools = mcpManager.getTools();

  // 3b. Build set of tools that require human approval
  const agentToolConfigs =
    (agent.tools as Array<{ name: string; requires_approval?: boolean }>) ?? [];
  const approvalRequired = new Set<string>(
    agentToolConfigs.filter((t) => t.requires_approval).map((t) => t.name),
  );

  // 4. Load recent conversation history (last 20 messages, excluding current)
  const history = await db
    .select({
      senderType: messages.senderType,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(20);

  // Build messages array (oldest first)
  const chatMessages: Array<{ role: string; content: string }> = [];
  for (const msg of history.reverse()) {
    const role = msg.senderType === 'human' ? 'user' : 'assistant';
    const raw = msg.content;
    let text: string;
    if (typeof raw === 'string') {
      text = raw;
    } else if (Array.isArray(raw)) {
      text = (raw as Array<{ type: string; text?: string }>).map((b) => b.text ?? '').join('');
    } else {
      text = JSON.stringify(raw);
    }
    chatMessages.push({ role, content: text });
  }
  // Append the new user message
  chatMessages.push({ role: 'user', content: message });

  // 5. Emit run_started and start trace
  emitAgentEvent(conversationId, { type: 'run_started', run_id: runId, agent_id: agentId });

  const recorder = new TraceRecorder();
  let traceId: string | null = null;
  try {
    traceId = await recorder.startTrace(
      agentId,
      userId,
      conversationId,
      modelName,
      triggerType,
      runId,
    );
  } catch {
    // Trace recording is best-effort; do not block the loop
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let fullResponse = '';

  try {
    // 6. Agentic loop
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (abortSignal?.aborted) break;

      // Trace: start LLM span
      let llmSpanId: string | null = null;
      const llmStart = Date.now();
      if (traceId) {
        try {
          llmSpanId = await recorder.addSpan(traceId, 'llm_call', modelName, { turn });
        } catch {
          // best-effort
        }
      }

      const llmResponse = await callLLM({
        model: modelName,
        systemPrompt,
        messages: chatMessages,
        tools,
        maxTokens: agent.maxTokens ?? 4096,
        temperature: agent.temperature ?? 0.7,
        onTextDelta: (text) => {
          emitAgentEvent(conversationId, { type: 'text_delta', text });
          fullResponse += text;
        },
        onThinking: (summary) => {
          emitAgentEvent(conversationId, { type: 'thinking', summary });
          // Trace: record thinking span
          if (traceId) {
            const thinkStart = Date.now();
            recorder
              .addSpan(traceId, 'thinking', 'thinking', { summary })
              .then((spanId) => recorder.endSpan(spanId, 'ok', null, null, Date.now() - thinkStart))
              .catch(() => {});
          }
        },
        abortSignal,
      });

      // Trace: end LLM span
      if (llmSpanId) {
        try {
          await recorder.endSpan(
            llmSpanId,
            'ok',
            { stop_reason: llmResponse.stopReason },
            llmResponse.usage,
            Date.now() - llmStart,
          );
        } catch {
          // best-effort
        }
      }

      totalInputTokens += llmResponse.usage.input_tokens;
      totalOutputTokens += llmResponse.usage.output_tokens;

      // No tool calls means the agent is done
      if (llmResponse.toolCalls.length === 0) break;

      // Process tool calls
      for (const toolCall of llmResponse.toolCalls) {
        // Approval gate: check if this tool requires human approval
        if (approvalRequired.has(toolCall.name)) {
          // Auto-block if denied too many times (prevents infinite denial loops)
          if (approvalGate.isDeniedTooManyTimes(conversationId, toolCall.name)) {
            chatMessages.push({
              role: 'assistant',
              content: `[Tool: ${toolCall.name}] ${JSON.stringify(toolCall.input)}`,
            });
            chatMessages.push({
              role: 'user',
              content: `[Tool Blocked: ${toolCall.name}] This tool has been denied multiple times. It is now blocked for the rest of this conversation. Use a different approach.`,
            });
            continue;
          }

          if (!approvalGate.isApproved(conversationId, toolCall.name)) {
            // Trace: record approval span
            let approvalSpanId: string | null = null;
            const approvalStart = Date.now();
            if (traceId) {
              try {
                approvalSpanId = await recorder.addSpan(
                  traceId,
                  'approval',
                  toolCall.name,
                  toolCall.input,
                );
              } catch {
                // best-effort
              }
            }

            const decision = await approvalGate.requestApproval(
              conversationId,
              toolCall.name,
              toolCall.input,
              abortSignal,
            );

            if (approvalSpanId) {
              try {
                await recorder.endSpan(
                  approvalSpanId,
                  decision.approved ? 'ok' : 'denied',
                  { approved: decision.approved },
                  null,
                  Date.now() - approvalStart,
                );
              } catch {
                // best-effort
              }
            }

            if (!decision.approved) {
              // Feed denial back to LLM so it can adapt
              chatMessages.push({
                role: 'assistant',
                content: `[Tool: ${toolCall.name}] ${JSON.stringify(toolCall.input)}`,
              });
              chatMessages.push({
                role: 'user',
                content: `[Tool Denied: ${toolCall.name}] The user denied this tool call. Do not retry this tool without a different approach.`,
              });
              continue;
            }
          }
        }

        const callId = randomUUID();
        emitAgentEvent(conversationId, {
          type: 'tool_call_start',
          name: toolCall.name,
          call_id: callId,
        });

        // Trace: start tool span
        let toolSpanId: string | null = null;
        if (traceId) {
          try {
            toolSpanId = await recorder.addSpan(
              traceId,
              'tool_call',
              toolCall.name,
              toolCall.input,
            );
          } catch {
            // best-effort
          }
        }

        const startTime = Date.now();
        const result = await mcpManager.executeTool(toolCall.name, toolCall.input);
        const duration_ms = Date.now() - startTime;

        // Trace: end tool span
        if (toolSpanId) {
          try {
            await recorder.endSpan(toolSpanId, 'ok', result, null, duration_ms);
          } catch {
            // best-effort
          }
        }

        emitAgentEvent(conversationId, {
          type: 'tool_call_end',
          name: toolCall.name,
          call_id: callId,
          result: JSON.stringify(result),
          duration_ms,
        });

        // Feed tool use + result back into messages for next turn
        chatMessages.push({
          role: 'assistant',
          content: `[Tool: ${toolCall.name}] ${JSON.stringify(toolCall.input)}`,
        });
        chatMessages.push({
          role: 'user',
          content: `[Tool Result: ${toolCall.name}] ${JSON.stringify(result)}`,
        });
      }
    }

    // 7. Save agent response as a message in the conversation
    const messageId = randomUUID();
    const now = new Date().toISOString();
    const contentJson = JSON.stringify([{ type: 'text', text: fullResponse }]);
    await sql`
      INSERT INTO messages (id, conversation_id, sender_id, sender_type, type, content, metadata, created_at)
      VALUES (${messageId}, ${conversationId}, ${agentId}, 'agent', 'text', ${contentJson}::jsonb, '{}', ${now})
    `;

    // Update conversation last_message_at
    await sql`
      UPDATE conversations SET last_message_at = ${now}, updated_at = NOW()
      WHERE id = ${conversationId}
    `;

    emitMessage(conversationId, {
      id: messageId,
      conversation_id: conversationId,
      sender_id: agentId,
      sender_type: 'agent',
      type: 'text',
      content: [{ type: 'text', text: fullResponse }],
      metadata: {},
      edited_at: null,
      deleted_at: null,
      created_at: now,
    });

    // 8. Track usage in agent_usage_logs
    const usageModel = agent.model ?? 'claude-sonnet-4-6';
    await sql`
      INSERT INTO agent_usage_logs (id, user_id, agent_id, model, input_tokens, output_tokens, inserted_at)
      VALUES (${randomUUID()}, ${userId}, ${agentId}, ${usageModel}, ${totalInputTokens}, ${totalOutputTokens}, ${now})
    `;

    // 9. Emit run_finished and end trace
    emitAgentEvent(conversationId, {
      type: 'run_finished',
      usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
    });

    if (traceId) {
      try {
        await recorder.endTrace(traceId, 'completed');
      } catch {
        // best-effort
      }
    }

    return {
      response: fullResponse,
      usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
    };
  } catch (error) {
    emitAgentEvent(conversationId, {
      type: 'run_error',
      error: (error as Error).message,
    });

    if (traceId) {
      try {
        await recorder.endTrace(traceId, 'failed', (error as Error).message);
      } catch {
        // best-effort
      }
    }

    throw error;
  } finally {
    // Clean up any pending approval requests and session cache for this conversation
    approvalGate.cancelPending(conversationId);
    approvalGate.clearSession(conversationId);
    await mcpManager.disconnect();
  }
}
