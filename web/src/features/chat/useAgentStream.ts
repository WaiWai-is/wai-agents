'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentStreamEvent, SocketClient } from '@/lib/ws/socket-client';
import type { ContentBlock } from './content-blocks';

export type StreamingMessage = {
  runId: string;
  agentId?: string;
  blocks: ContentBlock[];
  usage: { inputTokens: number; outputTokens: number } | null;
};

export function useAgentStream(socketClient: SocketClient, conversationId: string | null) {
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef<StreamingMessage | null>(null);

  const resetStream = useCallback(() => {
    streamRef.current = null;
    setStreamingMessage(null);
    setIsStreaming(false);
  }, []);

  useEffect(() => {
    if (!conversationId) {
      resetStream();
      return;
    }

    const unsub = socketClient.onAgentEvent((event: AgentStreamEvent) => {
      // Only process events for the current conversation
      if (event.conversationId && event.conversationId !== conversationId) {
        return;
      }

      switch (event.type) {
        case 'run_started': {
          const newStream: StreamingMessage = {
            runId: event.runId || crypto.randomUUID(),
            agentId: event.agentId,
            blocks: [],
            usage: null,
          };
          streamRef.current = newStream;
          setStreamingMessage(newStream);
          setIsStreaming(true);
          break;
        }

        case 'text_delta': {
          if (!streamRef.current) {
            // Start a new stream implicitly if we get text without run_started
            const implicitStream: StreamingMessage = {
              runId: crypto.randomUUID(),
              agentId: event.agentId,
              blocks: [],
              usage: null,
            };
            streamRef.current = implicitStream;
            setIsStreaming(true);
          }

          const text = event.text || '';
          const blocks = [...streamRef.current.blocks];
          const lastBlock = blocks[blocks.length - 1];

          if (lastBlock && lastBlock.type === 'text') {
            // Append to existing text block
            blocks[blocks.length - 1] = {
              ...lastBlock,
              text: lastBlock.text + text,
            };
          } else {
            // Create a new text block
            blocks.push({ type: 'text', text });
          }

          const updated = { ...streamRef.current, blocks };
          streamRef.current = updated;
          setStreamingMessage(updated);
          break;
        }

        case 'tool_call_start': {
          if (!streamRef.current) break;

          const blocks = [...streamRef.current.blocks];
          blocks.push({
            type: 'tool_call',
            toolName: event.toolName || 'unknown',
            toolCallId: event.toolCallId,
            input: event.toolInput,
            status: 'running' as const,
          });

          const updated = { ...streamRef.current, blocks };
          streamRef.current = updated;
          setStreamingMessage(updated);
          break;
        }

        case 'tool_call_end': {
          if (!streamRef.current) break;

          const blocks = [...streamRef.current.blocks];

          // Find the last running tool_call for this tool and mark it done
          for (let i = blocks.length - 1; i >= 0; i--) {
            const block = blocks[i];
            if (
              block.type === 'tool_call' &&
              block.status === 'running' &&
              (!event.toolCallId || block.toolCallId === event.toolCallId)
            ) {
              blocks[i] = { ...block, status: 'done' as const };
              break;
            }
          }

          // Add tool_result block
          blocks.push({
            type: 'tool_result',
            toolName: event.toolName || 'unknown',
            toolCallId: event.toolCallId,
            result: event.toolResult,
            durationMs: event.durationMs,
            isError: false,
          });

          const updated = { ...streamRef.current, blocks };
          streamRef.current = updated;
          setStreamingMessage(updated);
          break;
        }

        case 'thinking': {
          if (!streamRef.current) break;

          const blocks = [...streamRef.current.blocks];
          blocks.push({
            type: 'thinking',
            text: event.text || '',
          });

          const updated = { ...streamRef.current, blocks };
          streamRef.current = updated;
          setStreamingMessage(updated);
          break;
        }

        case 'status': {
          // Status events don't modify blocks, they're handled by the ChatView directly
          break;
        }

        case 'run_finished': {
          if (!streamRef.current) break;

          const updated = {
            ...streamRef.current,
            usage: event.usage || null,
          };
          streamRef.current = updated;
          setStreamingMessage(updated);
          setIsStreaming(false);
          break;
        }

        case 'run_error': {
          if (streamRef.current) {
            const blocks = [...streamRef.current.blocks];
            blocks.push({
              type: 'text',
              text: `Error: ${event.error || event.message || 'Agent run failed'}`,
            });
            const updated = { ...streamRef.current, blocks };
            streamRef.current = updated;
            setStreamingMessage(updated);
          }
          setIsStreaming(false);
          break;
        }
      }
    });

    return () => {
      unsub();
    };
  }, [socketClient, conversationId, resetStream]);

  return { streamingMessage, isStreaming, resetStream };
}
