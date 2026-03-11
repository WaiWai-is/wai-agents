'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WaiAgentsApi } from '@/lib/api/services';
import { asTextContent } from '@/lib/utils';

type Props = {
  api: WaiAgentsApi;
  agentId: string;
  accessToken: string;
};

type SandboxMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
};

export function AgentTestSandbox({ api, agentId }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SandboxMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  // Reset cancelled flag on mount; set on unmount to abort polling loops
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages triggers scroll on new message arrival
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;
    const res = await api.startAgentConversation(agentId);
    const id = res.conversation.id;
    setConversationId(id);
    return id;
  }, [api, agentId, conversationId]);

  const waitForAgentReply = useCallback(
    async (nextConversationId: string, sentMessageId: string): Promise<SandboxMessage | null> => {
      const startedAt = Date.now();

      while (Date.now() - startedAt < 30_000) {
        if (cancelledRef.current) return null;

        const response = await api.listMessages(nextConversationId, { limit: 20 });

        if (cancelledRef.current) return null;

        const reply = [...response.items]
          .reverse()
          .find(
            (message) =>
              message.id !== sentMessageId &&
              !message.deleted_at &&
              (message.sender_type === 'agent' || message.sender_type === 'system'),
          );

        if (reply) {
          return {
            id: reply.id,
            role: 'agent',
            text: asTextContent(reply.content) || '(no response)',
          };
        }

        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }

      return null;
    },
    [api],
  );

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    setInput('');

    const userMsg: SandboxMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const convId = await ensureConversation();
      const res = await api.sendTextMessage(convId, text);
      const agentMsg = await waitForAgentReply(convId, res.message.id);

      if (agentMsg) {
        setMessages((prev) => [...prev, agentMsg]);
      } else {
        setError('Timed out waiting for the agent reply.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  return (
    <fieldset className="ab-fieldset ab-sandbox" aria-label="agent-test-sandbox">
      <legend className="ab-legend">Test Sandbox</legend>

      <div className="ab-sandbox-messages">
        {messages.length === 0 && (
          <p className="ab-empty-hint">Send a message to test your agent.</p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`ab-sandbox-msg ab-sandbox-msg-${msg.role}`}>
            <span className="ab-sandbox-msg-role">{msg.role === 'user' ? 'You' : 'Agent'}</span>
            <p className="ab-sandbox-msg-text">{msg.text}</p>
          </div>
        ))}
        {sending && (
          <div className="ab-sandbox-msg ab-sandbox-msg-agent">
            <span className="ab-sandbox-msg-role">Agent</span>
            <div className="loading-spinner" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="ab-sandbox-input">
        <input
          className="ab-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type a test message..."
          disabled={sending}
        />
        <button
          type="button"
          className="ab-btn ab-btn-primary"
          disabled={sending || !input.trim()}
          onClick={() => void handleSend()}
        >
          Send
        </button>
      </div>
    </fieldset>
  );
}
