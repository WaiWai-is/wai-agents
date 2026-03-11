'use client';

import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import elixir from 'highlight.js/lib/languages/elixir';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { WaiAgentsApi } from '@/lib/api';
import type { SessionUser } from '@/lib/state/session-store';
import type {
  AgentChannelStatus,
  Conversation,
  ConversationMember,
  Message,
  ToolApprovalRequest,
} from '@/lib/types';
import { asTextContent, getErrorMessage } from '@/lib/utils';
import type { AgentStreamEvent } from '@/lib/ws/socket-client';
import { SocketClient } from '@/lib/ws/socket-client';
import { ContentBlockRenderer, parseContentBlocks } from './content-blocks';
import { useAgentStream } from './useAgentStream';
import 'highlight.js/styles/github-dark.min.css';
import './chat-blocks.css';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('elixir', elixir);

/* ================================================================
   Types
   ================================================================ */

type ChatViewProps = {
  api: WaiAgentsApi;
  accessToken: string;
  currentUser: SessionUser;
  focusConversationId?: string | null;
  onConversationFocused?: (conversationId: string) => void;
};

type LocalAgentEvent = {
  kind: string;
  payload: Record<string, unknown>;
  at: string;
};

type TypingState = Record<string, boolean>;

type NewConvoTab = 'dm' | 'group';

type ApprovalScope = 'allow_once' | 'allow_session' | 'allow_always';

/* ================================================================
   Constants
   ================================================================ */

const GROUPING_WINDOW_MS = 2 * 60_000;

/* ================================================================
   ChatView
   ================================================================ */

export function ChatView({
  api,
  accessToken,
  currentUser,
  focusConversationId,
  onConversationFocused,
}: ChatViewProps) {
  const wsClient = useMemo(() => new SocketClient(), []);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  /* -- Conversation state ---------------------------------------- */
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationCursor, setConversationCursor] = useState<string | null>(null);
  const [conversationHasMore, setConversationHasMore] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  /* -- Message state --------------------------------------------- */
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [messageHasMore, setMessageHasMore] = useState(false);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingState>({});

  /* -- Composer state -------------------------------------------- */
  const [draft, setDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');

  /* -- Agent state ------------------------------------------------ */
  const [_agentEvents, setAgentEvents] = useState<LocalAgentEvent[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ToolApprovalRequest[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentChannelStatus | null>(null);
  const [toolLog, setToolLog] = useState<LocalAgentEvent[]>([]);
  const [toolLogExpanded, setToolLogExpanded] = useState(false);

  /* -- New conversation state ------------------------------------ */
  const [showNewConvoModal, setShowNewConvoModal] = useState(false);
  const [newConvoTab, setNewConvoTab] = useState<NewConvoTab>('dm');
  const [newDmUsername, setNewDmUsername] = useState('');
  const [newGroupTitle, setNewGroupTitle] = useState('');

  /* -- UI state -------------------------------------------------- */
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /* -- Deduplication set ----------------------------------------- */
  const seenMessageIds = useRef(new Set<string>());

  /* -- AG-UI Streaming ------------------------------------------- */
  const { streamingMessage, isStreaming } = useAgentStream(wsClient, selectedConversationId);

  /* -- Derived --------------------------------------------------- */
  const selectedConversation = useMemo(
    () => conversations.find((c) => c.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      const u = m.user;
      map.set(m.user_id, u?.display_name || u?.username || m.user_id.slice(0, 8));
    });
    map.set(currentUser.id, currentUser.display_name || currentUser.username);
    return map;
  }, [members, currentUser.display_name, currentUser.id, currentUser.username]);

  const filteredConversations = useMemo(() => {
    if (!searchFilter.trim()) return conversations;
    const q = searchFilter.toLowerCase();
    return conversations.filter((c) => {
      const title = c.title || '';
      return title.toLowerCase().includes(q);
    });
  }, [conversations, searchFilter]);

  /* ================================================================
     Data fetching
     ================================================================ */

  const fetchConversations = useCallback(
    async (cursor?: string | null) => {
      setLoadingConversations(true);
      setError(null);
      try {
        const res = await api.listConversations({ limit: 20, cursor: cursor ?? undefined });
        setConversations((prev) => mergeConversations(prev, res.items, Boolean(cursor)));
        setConversationCursor(res.page_info.next_cursor);
        setConversationHasMore(res.page_info.has_more);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoadingConversations(false);
      }
    },
    [api],
  );

  const fetchMessages = useCallback(
    async (conversationId: string, cursor?: string | null) => {
      setLoadingMessages(true);
      setError(null);
      try {
        const res = await api.listMessages(conversationId, {
          limit: 30,
          cursor: cursor ?? undefined,
        });
        const ascending = [...res.items].reverse();
        ascending.forEach((m) => seenMessageIds.current.add(m.id));
        setMessages((prev) => {
          if (!cursor) return mergeMessages([], ascending);
          return mergeMessages(ascending, prev);
        });
        setMessageCursor(res.page_info.next_cursor);
        setMessageHasMore(res.page_info.has_more);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoadingMessages(false);
      }
    },
    [api],
  );

  const fetchMembers = useCallback(
    async (conversationId: string) => {
      try {
        const res = await api.listMembers(conversationId, { limit: 100 });
        setMembers(res.items);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    },
    [api],
  );

  /* ================================================================
     WebSocket lifecycle (Socket.IO)
     ================================================================ */

  useEffect(() => {
    wsClient.connect(accessToken);
    setWsConnected(true);

    const unsubMessage = wsClient.onMessage((payload: Record<string, unknown>) => {
      const msg = extractMessageFromEvent(payload);
      if (!msg) return;
      if (seenMessageIds.current.has(msg.id)) return;
      seenMessageIds.current.add(msg.id);
      setMessages((prev) => mergeMessages(prev, [msg]));
      setConversations((prev) => bumpConversation(prev, msg.conversation_id));
    });

    const unsubUpdated = wsClient.onMessageUpdated((payload: Record<string, unknown>) => {
      const msg = extractMessageFromEvent(payload);
      if (!msg) return;
      setMessages((prev) => replaceMessage(prev, msg));
    });

    const unsubDeleted = wsClient.onMessageDeleted((payload: Record<string, unknown>) => {
      const msg = extractMessageFromEvent(payload);
      if (!msg) return;
      setMessages((prev) => replaceMessage(prev, msg));
    });

    const unsubTyping = wsClient.onTyping((data) => {
      if (data.userId === currentUser.id) return;
      setTypingUsers((prev) => ({ ...prev, [data.userId]: data.isTyping }));
    });

    const unsubPresence = wsClient.onPresence(() => {
      // Presence updates handled silently
    });

    // Agent events for status, approvals, and tool log
    const unsubAgentEvent = wsClient.onAgentEvent((event: AgentStreamEvent) => {
      const localEvent: LocalAgentEvent = {
        kind: event.type,
        payload: event as unknown as Record<string, unknown>,
        at: new Date().toISOString(),
      };
      setAgentEvents((prev) => [localEvent, ...prev].slice(0, 80));

      if (event.type === 'status' && event.message) {
        setAgentStatus({ message: event.message });
      }

      if (event.type === 'tool_call_start' || event.type === 'tool_call_end') {
        setToolLog((prev) => [localEvent, ...prev].slice(0, 40));
      }

      if (event.type === 'run_finished' || event.type === 'run_error') {
        setAgentStatus(null);
      }
    });

    return () => {
      unsubMessage();
      unsubUpdated();
      unsubDeleted();
      unsubTyping();
      unsubPresence();
      unsubAgentEvent();
      wsClient.disconnect();
      setWsConnected(false);
    };
  }, [accessToken, currentUser.id, wsClient]);

  /* -- Load conversations on mount ------------------------------- */
  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  /* -- Focus conversation from external -------------------------- */
  useEffect(() => {
    if (!focusConversationId) return;
    setSelectedConversationId(focusConversationId);
    setMobileShowThread(true);
  }, [focusConversationId]);

  /* -- Auto-select first conversation ---------------------------- */
  useEffect(() => {
    if (selectedConversationId) return;
    if (conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  /* -- On conversation select: fetch messages & members ---------- */
  useEffect(() => {
    if (!selectedConversationId) return;
    onConversationFocused?.(selectedConversationId);

    setMessages([]);
    seenMessageIds.current.clear();
    setTypingUsers({});
    setAgentEvents([]);
    setApprovalRequests([]);
    setAgentStatus(null);
    setToolLog([]);

    void fetchMessages(selectedConversationId);
    void fetchMembers(selectedConversationId);
  }, [fetchMembers, fetchMessages, onConversationFocused, selectedConversationId]);

  /* -- Join/leave conversation rooms ------------------------------ */
  useEffect(() => {
    if (!selectedConversationId) return;

    wsClient.joinConversation(selectedConversationId);
    if (selectedConversation?.type === 'agent') {
      wsClient.joinAgent(selectedConversationId);
    }

    return () => {
      wsClient.leaveConversation(selectedConversationId);
      if (selectedConversation?.type === 'agent') {
        wsClient.leaveAgent(selectedConversationId);
      }
    };
  }, [selectedConversation?.type, selectedConversationId, wsClient]);

  /* -- Read receipts --------------------------------------------- */
  useEffect(() => {
    if (!selectedConversationId || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    wsClient.emitRead(selectedConversationId, latest.id);
  }, [messages, selectedConversationId, wsClient]);

  /* -- Auto-scroll ----------------------------------------------- */
  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (isNearBottom) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  /* -- Scroll detection ------------------------------------------ */
  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;
    const onScroll = () => {
      const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollButton(gap > 200);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  /* ================================================================
     Actions
     ================================================================ */

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!selectedConversationId) return;
      if (isTyping) {
        wsClient.emitTyping(selectedConversationId);
      } else {
        wsClient.emitStopTyping(selectedConversationId);
      }
    },
    [selectedConversationId, wsClient],
  );

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!selectedConversationId) return;
    sendTyping(value.trim().length > 0);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2_000);
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedConversationId) return;
    const text = draft.trim();
    if (!text) return;

    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: selectedConversationId,
      sender_id: currentUser.id,
      sender_type: 'human',
      type: 'text',
      content: { text },
      metadata: {},
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      reactions: [],
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    sendTyping(false);
    setPendingSend(true);
    setError(null);

    try {
      const res = await api.sendTextMessage(selectedConversationId, text);
      seenMessageIds.current.add(res.message.id);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return mergeMessages(withoutTemp, [res.message]);
      });
      setConversations((prev) => bumpConversation(prev, selectedConversationId));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError(getErrorMessage(err));
    } finally {
      setPendingSend(false);
    }
  };

  const onComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(e as unknown as FormEvent);
    }
  };

  const updateMessage = async (message: Message) => {
    if (!selectedConversationId) return;
    const nextText = editingDraft.trim();
    if (!nextText) return;
    try {
      const res = await api.editTextMessage(selectedConversationId, message.id, nextText);
      setMessages((prev) => replaceMessage(prev, res.message));
      setEditingMessageId(null);
      setEditingDraft('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const removeMessage = async (message: Message) => {
    if (!selectedConversationId) return;
    try {
      const res = await api.deleteMessage(selectedConversationId, message.id);
      const deleted =
        res && typeof res === 'object' && 'message' in res
          ? (res as { message?: Message }).message
          : undefined;
      if (deleted) {
        setMessages((prev) => replaceMessage(prev, deleted));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === message.id ? { ...m, deleted_at: new Date().toISOString() } : m,
          ),
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const loadOlderMessages = async () => {
    if (!selectedConversationId || !messageHasMore || loadingMessages) return;
    await fetchMessages(selectedConversationId, messageCursor);
  };

  const createDm = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const username = newDmUsername.trim();
    if (!username) return;
    try {
      const userRes = await api.userByUsername(username);
      const convoRes = await api.createConversation({ type: 'dm', member_id: userRes.user.id });
      setConversations((prev) => mergeConversations(prev, [convoRes.conversation], false));
      setSelectedConversationId(convoRes.conversation.id);
      setNewDmUsername('');
      setShowNewConvoModal(false);
      setMobileShowThread(true);
      setInfo(`Opened DM with @${username}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const createGroup = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const title = newGroupTitle.trim();
    if (!title) return;
    try {
      const res = await api.createConversation({ type: 'group', title });
      setConversations((prev) => mergeConversations(prev, [res.conversation], false));
      setSelectedConversationId(res.conversation.id);
      setNewGroupTitle('');
      setShowNewConvoModal(false);
      setMobileShowThread(true);
      setInfo(`Created group "${title}"`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const sendApprovalDecision = async (
    requestId: string,
    decision: 'approve' | 'deny',
    scope: ApprovalScope = 'allow_once',
  ) => {
    if (!selectedConversation || selectedConversation.type !== 'agent') return;
    wsClient.emitApprovalDecision(selectedConversation.id, requestId, decision, scope);
    setApprovalRequests((prev) => prev.filter((r) => r.request_id !== requestId));
  };

  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const selectConversation = (id: string) => {
    setSelectedConversationId(id);
    setMobileShowThread(true);
  };

  /* ================================================================
     Typing indicator names
     ================================================================ */

  const typingNames = Object.entries(typingUsers)
    .filter(([, v]) => v)
    .map(([uid]) => memberNameById.get(uid) || uid.slice(0, 8));

  /* ================================================================
     Message grouping
     ================================================================ */

  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);

  /* ================================================================
     Render
     ================================================================ */

  return (
    <>
      <style>{chatStyles}</style>

      <section className="cv-layout" aria-label="chat-module">
        {/* -- Sidebar -------------------------------------------- */}
        <aside className={`cv-sidebar ${mobileShowThread ? 'cv-hide-mobile' : ''}`}>
          <div className="cv-sidebar-header">
            <h2 className="cv-sidebar-title">Chats</h2>
            <button
              type="button"
              className="cv-btn-new"
              onClick={() => setShowNewConvoModal(true)}
              title="New conversation"
            >
              +
            </button>
          </div>

          <input
            className="cv-search"
            type="text"
            placeholder="Search conversations..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
          />

          <ul className="cv-convo-list" aria-label="conversation-list">
            {loadingConversations && filteredConversations.length === 0 && (
              <li className="cv-convo-empty">Loading...</li>
            )}
            {!loadingConversations && filteredConversations.length === 0 && (
              <li className="cv-convo-empty">No conversations</li>
            )}
            {filteredConversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cv-convo-item ${c.id === selectedConversationId ? 'cv-convo-active' : ''}`}
                  onClick={() => selectConversation(c.id)}
                >
                  <div className="cv-avatar-circle">{getInitials(c.title || c.type)}</div>
                  <div className="cv-convo-text">
                    <span className="cv-convo-title">
                      {c.title || `${c.type.charAt(0).toUpperCase() + c.type.slice(1)} Chat`}
                    </span>
                    <span className="cv-convo-preview">
                      {c.type === 'agent' ? 'Agent conversation' : c.type}
                    </span>
                  </div>
                  <span className="cv-convo-time">
                    {c.last_message_at ? formatRelativeTime(c.last_message_at) : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {conversationHasMore && (
            <button
              type="button"
              className="cv-btn-load-more"
              onClick={() => void fetchConversations(conversationCursor)}
              disabled={loadingConversations}
            >
              {loadingConversations ? 'Loading...' : 'Load more'}
            </button>
          )}
        </aside>

        {/* -- Thread ---------------------------------------------- */}
        <div className={`cv-thread ${!mobileShowThread ? 'cv-hide-mobile' : ''}`}>
          {selectedConversation ? (
            <>
              {/* Thread header */}
              <header className="cv-thread-header">
                <button
                  type="button"
                  className="cv-back-btn cv-show-mobile-only"
                  onClick={() => setMobileShowThread(false)}
                >
                  &larr;
                </button>
                <div className="cv-thread-header-info">
                  <h3 className="cv-thread-title">
                    {selectedConversation.title ||
                      `${selectedConversation.type.charAt(0).toUpperCase() + selectedConversation.type.slice(1)} Chat`}
                  </h3>
                  <span className="cv-thread-meta">
                    {selectedConversation.type}
                    {selectedConversation.type === 'agent' && agentStatus && (
                      <>
                        {' '}
                        &middot;{' '}
                        <span className="cv-agent-status-inline">
                          <span className="cv-pulse-dot" />
                          {agentStatus.message}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              </header>

              {/* Connection banner */}
              {!wsConnected && <div className="cv-conn-banner">Reconnecting to server...</div>}

              {/* Messages */}
              <div className="cv-messages" ref={messageListRef}>
                {messageHasMore && (
                  <button
                    type="button"
                    className="cv-btn-load-more cv-load-older"
                    onClick={() => void loadOlderMessages()}
                    disabled={loadingMessages}
                  >
                    {loadingMessages ? 'Loading...' : 'Load older messages'}
                  </button>
                )}

                {groupedMessages.map((group) => (
                  <div key={group.key} className="cv-msg-group">
                    {group.dateSeparator && (
                      <div className="cv-date-sep">
                        <span>{group.dateSeparator}</span>
                      </div>
                    )}
                    {group.messages.map((msg, idx) => {
                      const senderId = typeof msg.sender_id === 'string' ? msg.sender_id : null;
                      const isOwn = senderId === currentUser.id;
                      const isFirst = idx === 0;
                      const isEditing = editingMessageId === msg.id;
                      const isSystem = msg.sender_type === 'system' || msg.type === 'system';
                      const isTemp = msg.id.startsWith('temp-');
                      const displayName = senderId
                        ? memberNameById.get(senderId) || senderId.slice(0, 8)
                        : 'System';

                      // Parse content blocks
                      const contentBlocks = parseContentBlocks(msg.content);
                      const hasRichBlocks =
                        contentBlocks.length > 0 &&
                        contentBlocks.some((b) => b.type !== 'text' || contentBlocks.length > 1);
                      const legacyText = asTextContent(msg.content);

                      if (isSystem) {
                        return (
                          <div key={msg.id} className="cv-msg-system">
                            <em>{legacyText || 'System message'}</em>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={msg.id}
                          className={`cv-msg ${isOwn ? 'cv-msg-own' : 'cv-msg-other'} ${isTemp ? 'cv-msg-pending' : ''}`}
                          data-message-id={msg.id}
                        >
                          {!isOwn && isFirst && (
                            <div className="cv-msg-avatar">
                              <div className="cv-avatar-circle cv-avatar-sm">
                                {getInitials(displayName)}
                              </div>
                            </div>
                          )}
                          {!isOwn && !isFirst && <div className="cv-msg-avatar-spacer" />}
                          <div className="cv-msg-content-wrap">
                            {isFirst && !isOwn && (
                              <span className="cv-msg-sender">{displayName}</span>
                            )}
                            {msg.deleted_at ? (
                              <div className="cv-msg-bubble cv-msg-deleted">
                                <em>Message deleted</em>
                              </div>
                            ) : isEditing ? (
                              <form
                                className="cv-edit-form"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  void updateMessage(msg);
                                }}
                              >
                                <textarea
                                  className="cv-edit-input"
                                  value={editingDraft}
                                  onChange={(e) => setEditingDraft(e.target.value)}
                                  rows={2}
                                />
                                <div className="cv-edit-actions">
                                  <button type="submit" className="cv-btn-sm cv-btn-accent">
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="cv-btn-sm"
                                    onClick={() => {
                                      setEditingMessageId(null);
                                      setEditingDraft('');
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </form>
                            ) : hasRichBlocks ? (
                              <div
                                className={`cv-msg-bubble ${isOwn ? 'cv-bubble-sent' : 'cv-bubble-received'}`}
                              >
                                <ContentBlockRenderer blocks={contentBlocks} />
                                {msg.edited_at && <span className="cv-msg-edited">(edited)</span>}
                              </div>
                            ) : (
                              <div
                                className={`cv-msg-bubble ${isOwn ? 'cv-bubble-sent' : 'cv-bubble-received'}`}
                              >
                                <MessageContent text={legacyText} content={msg.content} />
                                {msg.edited_at && <span className="cv-msg-edited">(edited)</span>}
                              </div>
                            )}

                            {/* Reactions */}
                            {msg.reactions && msg.reactions.length > 0 && (
                              <div className="cv-reactions">
                                {aggregateReactions(msg.reactions).map(([emoji, count]) => (
                                  <span key={emoji} className="cv-reaction-pill">
                                    {emoji} {count > 1 ? count : ''}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Timestamp on last in group */}
                            {idx === group.messages.length - 1 && (
                              <span className="cv-msg-time">
                                {formatMessageTime(msg.created_at)}
                              </span>
                            )}

                            {/* Hover actions for own messages */}
                            {isOwn && !msg.deleted_at && !isEditing && !isTemp && (
                              <div className="cv-msg-actions">
                                <button
                                  type="button"
                                  className="cv-btn-icon"
                                  title="Edit"
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditingDraft(legacyText);
                                  }}
                                >
                                  &#9998;
                                </button>
                                <button
                                  type="button"
                                  className="cv-btn-icon"
                                  title="Delete"
                                  onClick={() => void removeMessage(msg)}
                                >
                                  &times;
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {/* Agent streaming message (AG-UI) */}
                {isStreaming && streamingMessage && streamingMessage.blocks.length > 0 && (
                  <div className="cv-msg cv-msg-other cv-msg-streaming">
                    <div className="cv-msg-avatar">
                      <div className="cv-avatar-circle cv-avatar-sm cv-avatar-agent">AI</div>
                    </div>
                    <div className="cv-msg-content-wrap">
                      <div className="cv-msg-bubble cv-bubble-received">
                        <ContentBlockRenderer blocks={streamingMessage.blocks} />
                        <span className="cb-streaming-indicator">
                          <span className="cb-streaming-dot" />
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Typing indicator */}
                {typingNames.length > 0 && (
                  <div className="cv-msg cv-msg-other cv-typing-indicator">
                    <div className="cv-msg-avatar">
                      <div className="cv-avatar-circle cv-avatar-sm">
                        {getInitials(typingNames[0])}
                      </div>
                    </div>
                    <div className="cv-msg-content-wrap">
                      <div className="cv-msg-bubble cv-bubble-received cv-typing-bubble">
                        <span className="cv-dot" />
                        <span className="cv-dot cv-dot-2" />
                        <span className="cv-dot cv-dot-3" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messageEndRef} />
              </div>

              {/* Scroll to bottom button */}
              {showScrollButton && (
                <button
                  type="button"
                  className="cv-scroll-bottom"
                  onClick={scrollToBottom}
                  title="Scroll to bottom"
                >
                  &darr;
                </button>
              )}

              {/* Approval requests (agent) */}
              {approvalRequests.length > 0 && (
                <div className="cv-approvals">
                  {approvalRequests.map((req) => {
                    let formattedArgs: string;
                    try {
                      formattedArgs = JSON.stringify(JSON.parse(req.args_preview), null, 2);
                    } catch {
                      formattedArgs = req.args_preview;
                    }
                    let highlightedArgs: string;
                    try {
                      highlightedArgs = hljs.highlight(formattedArgs, { language: 'json' }).value;
                    } catch {
                      highlightedArgs = formattedArgs
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    }
                    return (
                      <div key={req.request_id} className="cv-approval-card">
                        <div className="cv-approval-header">
                          <span className="cv-approval-icon">&#9888;</span>
                          <div className="cv-approval-title">
                            <strong>{req.tool}</strong>
                            <span className="cv-approval-label">requests approval</span>
                          </div>
                        </div>
                        {req.scopes.length > 0 && (
                          <div className="cv-approval-scopes">
                            {req.scopes.map((scope) => (
                              <span key={scope} className="cv-approval-scope-tag">
                                {scope}
                              </span>
                            ))}
                          </div>
                        )}
                        <pre className="cv-approval-args">
                          <code dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightedArgs) }} />
                        </pre>
                        <div className="cv-approval-actions">
                          <button
                            type="button"
                            className="cv-btn-sm cv-btn-accent"
                            onClick={() =>
                              void sendApprovalDecision(req.request_id, 'approve', 'allow_once')
                            }
                          >
                            Allow Once
                          </button>
                          <button
                            type="button"
                            className="cv-btn-sm cv-btn-accent"
                            onClick={() =>
                              void sendApprovalDecision(req.request_id, 'approve', 'allow_session')
                            }
                          >
                            Allow for Session
                          </button>
                          <button
                            type="button"
                            className="cv-btn-sm cv-btn-accent"
                            onClick={() =>
                              void sendApprovalDecision(req.request_id, 'approve', 'allow_always')
                            }
                          >
                            Always Allow
                          </button>
                          <button
                            type="button"
                            className="cv-btn-sm cv-btn-deny"
                            onClick={() => void sendApprovalDecision(req.request_id, 'deny')}
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Composer */}
              <form className="cv-composer" onSubmit={sendMessage}>
                <textarea
                  className="cv-composer-input"
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  style={{
                    height: 'auto',
                    minHeight: '40px',
                    maxHeight: `${8 * 1.5 * 14 + 16}px`,
                  }}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = `${Math.min(el.scrollHeight, 8 * 1.5 * 14 + 16)}px`;
                    }
                  }}
                />
                {isStreaming ? (
                  <button
                    type="button"
                    className="cv-btn-send cv-btn-stop"
                    title="Stop generating"
                    onClick={() => {
                      if (selectedConversation?.type === 'agent') {
                        wsClient.emitStopAgent(selectedConversation.id);
                      }
                    }}
                  >
                    <span className="cv-stop-icon" />
                  </button>
                ) : (
                  draft.trim() && (
                    <button
                      type="submit"
                      className="cv-btn-send"
                      disabled={pendingSend}
                      title="Send message"
                    >
                      <span className="cv-send-arrow">&uarr;</span>
                    </button>
                  )
                )}
              </form>
            </>
          ) : (
            <div className="cv-empty-state">
              <p>Select a conversation to start chatting</p>
            </div>
          )}
        </div>

        {/* -- Side panel (agent tools) ------------------------------ */}
        {selectedConversation?.type === 'agent' && (
          <aside className="cv-sidepanel cv-hide-mobile">
            <div className="cv-sidepanel-header">
              <h3>Agent</h3>
              {agentStatus && (
                <div className="cv-agent-status">
                  <span className="cv-pulse-dot" />
                  <span>{agentStatus.message}</span>
                </div>
              )}
            </div>

            {/* Tool execution log */}
            {toolLog.length > 0 && (
              <div className="cv-tool-log">
                <button
                  type="button"
                  className="cv-tool-log-toggle"
                  onClick={() => setToolLogExpanded(!toolLogExpanded)}
                >
                  Tool Log ({toolLog.length}) {toolLogExpanded ? '\u25B2' : '\u25BC'}
                </button>
                {toolLogExpanded && (
                  <ul className="cv-tool-log-list">
                    {toolLog.map((evt, i) => {
                      const toolName =
                        typeof evt.payload.toolName === 'string' ? evt.payload.toolName : evt.kind;
                      const isMemory =
                        toolName === 'memory' ||
                        toolName === 'memory_save' ||
                        toolName === 'memory_retrieve';
                      return (
                        <li key={`${evt.kind}-${evt.at}-${i}`} className="cv-tool-log-item">
                          <div className="cv-tool-log-header">
                            <span
                              className={`cv-tool-status-icon ${evt.kind === 'tool_call_end' ? 'cv-tool-done' : 'cv-tool-running'}`}
                            >
                              {evt.kind === 'tool_call_end' ? '\u2713' : '\u25CF'}
                            </span>
                            <strong>{toolName}</strong>
                            {isMemory && (
                              <span className="cv-memory-badge">
                                {evt.kind === 'tool_call_start' ? 'saving' : 'recalled'}
                              </span>
                            )}
                            {typeof evt.payload.durationMs === 'number' && (
                              <span className="cv-tool-duration">{evt.payload.durationMs}ms</span>
                            )}
                          </div>
                          <pre className="cv-tool-log-detail">
                            {JSON.stringify(evt.payload, null, 2).slice(0, 500)}
                          </pre>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* Members */}
            <div className="cv-members-section">
              <h4>Members ({members.length})</h4>
              <ul className="cv-members-list">
                {members.map((m) => (
                  <li key={m.id} className="cv-member-item">
                    <div className="cv-avatar-circle cv-avatar-xs">
                      {getInitials(m.user?.display_name || m.user?.username || '?')}
                    </div>
                    <span>{m.user?.display_name || m.user?.username || m.user_id.slice(0, 8)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </section>

      {/* New conversation modal */}
      {showNewConvoModal && (
        <div className="cv-modal-overlay">
          <button
            type="button"
            className="cv-modal-overlay-dismiss"
            aria-label="Close modal"
            onClick={() => setShowNewConvoModal(false)}
          />
          <div className="cv-modal" role="dialog" aria-modal="true">
            <div className="cv-modal-header">
              <h3>New Conversation</h3>
              <button
                type="button"
                className="cv-btn-icon"
                onClick={() => setShowNewConvoModal(false)}
              >
                &times;
              </button>
            </div>
            <div className="cv-modal-tabs">
              <button
                type="button"
                className={`cv-modal-tab ${newConvoTab === 'dm' ? 'cv-tab-active' : ''}`}
                onClick={() => setNewConvoTab('dm')}
              >
                DM
              </button>
              <button
                type="button"
                className={`cv-modal-tab ${newConvoTab === 'group' ? 'cv-tab-active' : ''}`}
                onClick={() => setNewConvoTab('group')}
              >
                Group
              </button>
            </div>
            {newConvoTab === 'dm' ? (
              <form className="cv-modal-form" onSubmit={createDm}>
                <input
                  type="text"
                  placeholder="Enter username..."
                  value={newDmUsername}
                  onChange={(e) => setNewDmUsername(e.target.value)}
                />
                <button type="submit" className="cv-btn-accent cv-btn-full">
                  Open DM
                </button>
              </form>
            ) : (
              <form className="cv-modal-form" onSubmit={createGroup}>
                <input
                  type="text"
                  placeholder="Group title..."
                  value={newGroupTitle}
                  onChange={(e) => setNewGroupTitle(e.target.value)}
                />
                <button type="submit" className="cv-btn-accent cv-btn-full">
                  Create Group
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Banners */}
      {info && (
        <button type="button" className="cv-toast cv-toast-info" onClick={() => setInfo(null)}>
          {info}
        </button>
      )}
      {error && (
        <button type="button" className="cv-toast cv-toast-error" onClick={() => setError(null)}>
          {error}
        </button>
      )}
    </>
  );
}

/* ================================================================
   MessageContent — renders text, code blocks, etc. (legacy)
   ================================================================ */

function MessageContent({ text, content }: { text: string; content: Record<string, unknown> }) {
  if (!text) {
    return <span className="cv-msg-empty">{JSON.stringify(content)}</span>;
  }

  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3);
          const newlineIdx = inner.indexOf('\n');
          const lang = newlineIdx > -1 ? inner.slice(0, newlineIdx).trim() : '';
          const code = newlineIdx > -1 ? inner.slice(newlineIdx + 1) : inner;
          let highlighted: string;
          try {
            highlighted =
              lang && hljs.getLanguage(lang)
                ? hljs.highlight(code, { language: lang }).value
                : hljs.highlightAuto(code).value;
          } catch {
            highlighted = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          }
          return (
            <div key={i} className="cv-code-block">
              <div className="cv-code-header">
                <span>{lang || 'code'}</span>
                <button
                  type="button"
                  className="cv-btn-copy"
                  onClick={() => void navigator.clipboard.writeText(code)}
                >
                  Copy
                </button>
              </div>
              <pre>
                <code dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlighted) }} />
              </pre>
            </div>
          );
        }
        return part ? (
          <span key={i} className="cv-msg-text">
            {part}
          </span>
        ) : null;
      })}
    </>
  );
}

/* ================================================================
   Helpers — message grouping
   ================================================================ */

type MessageGroup = {
  key: string;
  dateSeparator: string | null;
  messages: Message[];
};

function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let lastDateLabel = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const dateLabel = formatDateSeparator(msg.created_at);
    const showDate = dateLabel !== lastDateLabel;
    lastDateLabel = dateLabel;

    const prevMsg = i > 0 ? messages[i - 1] : null;
    const canGroup =
      prevMsg &&
      prevMsg.sender_id === msg.sender_id &&
      !showDate &&
      new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime() <
        GROUPING_WINDOW_MS;

    if (canGroup && groups.length > 0) {
      groups[groups.length - 1].messages.push(msg);
    } else {
      groups.push({
        key: msg.id,
        dateSeparator: showDate ? dateLabel : null,
        messages: [msg],
      });
    }
  }

  return groups;
}

/* ================================================================
   Helpers — data manipulation
   ================================================================ */

function mergeConversations(
  prev: Conversation[],
  incoming: Conversation[],
  append: boolean,
): Conversation[] {
  const byId = new Map<string, Conversation>();
  if (!append) {
    incoming.forEach((c) => byId.set(c.id, c));
    prev.forEach((c) => {
      if (!byId.has(c.id)) byId.set(c.id, c);
    });
  } else {
    prev.forEach((c) => byId.set(c.id, c));
    incoming.forEach((c) => byId.set(c.id, c));
  }
  return [...byId.values()].sort(compareConversationRecency);
}

function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  prev.forEach((m) => byId.set(m.id, m));
  incoming.forEach((m) => {
    const existing = byId.get(m.id);
    byId.set(m.id, existing ? { ...existing, ...m } : m);
  });
  return [...byId.values()].sort(compareMessageChronological);
}

function replaceMessage(prev: Message[], next: Message): Message[] {
  const replaced = prev.map((m) => (m.id === next.id ? { ...m, ...next } : m));
  if (replaced.some((m) => m.id === next.id)) return replaced;
  return mergeMessages(prev, [next]);
}

function bumpConversation(prev: Conversation[], conversationId: string): Conversation[] {
  return [
    ...prev.map((c) =>
      c.id === conversationId ? { ...c, last_message_at: new Date().toISOString() } : c,
    ),
  ].sort(compareConversationRecency);
}

function compareMessageChronological(a: Message, b: Message): number {
  const l = new Date(a.created_at).getTime();
  const r = new Date(b.created_at).getTime();
  return l === r ? a.id.localeCompare(b.id) : l - r;
}

function compareConversationRecency(a: Conversation, b: Conversation): number {
  const l = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
  const r = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
  return l === r ? (a.created_at < b.created_at ? 1 : -1) : r - l;
}

/* ================================================================
   Helpers — formatting
   ================================================================ */

function formatDateSeparator(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDay.getTime();

  if (diff === 0) return 'Today';
  if (diff === 86400000) return 'Yesterday';

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function aggregateReactions(reactions: Array<{ emoji: string }>): Array<[string, number]> {
  const counts = new Map<string, number>();
  reactions.forEach((r) => counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1));
  return [...counts.entries()];
}

function extractMessageFromEvent(payload: unknown): Message | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Record<string, unknown>;
  const maybeMessage =
    candidate.message && typeof candidate.message === 'object'
      ? (candidate.message as Record<string, unknown>)
      : candidate;
  if (typeof maybeMessage.id !== 'string' || typeof maybeMessage.conversation_id !== 'string')
    return null;
  return maybeMessage as unknown as Message;
}

/* ================================================================
   Styles (CSS-in-JS using CSS variables from design tokens)
   ================================================================ */

const chatStyles = `
/* Layout */
.cv-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  height: calc(100vh - 160px);
  min-height: 400px;
  gap: 0;
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-bg-primary);
}

.cv-layout:has(.cv-sidepanel) {
  grid-template-columns: 320px minmax(0, 1fr) 280px;
}

/* Sidebar */
.cv-sidebar {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border-primary);
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.cv-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-4) var(--space-2);
}

.cv-sidebar-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
}

.cv-btn-new {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-primary);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: var(--text-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.cv-btn-new:hover {
  background: var(--color-accent-subtle);
  border-color: var(--color-accent-primary);
  color: var(--color-accent-primary);
}

.cv-search {
  margin: 0 var(--space-3) var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: var(--text-sm);
  outline: none;
  width: auto;
}

.cv-search:focus {
  border-color: var(--color-accent-primary);
}

/* Conversation list */
.cv-convo-list {
  flex: 1;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0 var(--space-2);
}

.cv-convo-empty {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--text-sm);
}

.cv-convo-item {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-2);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  cursor: pointer;
  width: 100%;
  text-align: left;
  transition: background var(--duration-fast) var(--ease-default);
}

.cv-convo-item:hover {
  background: var(--color-bg-tertiary);
}

.cv-convo-active {
  background: var(--color-accent-subtle);
}

.cv-convo-active:hover {
  background: var(--color-accent-subtle);
}

/* Avatar */
.cv-avatar-circle {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: var(--color-accent-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  flex-shrink: 0;
  letter-spacing: 0.03em;
}

.cv-avatar-sm {
  width: 28px;
  height: 28px;
  font-size: 10px;
}

.cv-avatar-xs {
  width: 24px;
  height: 24px;
  font-size: 9px;
}

.cv-avatar-agent {
  background: var(--color-success);
}

.cv-convo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cv-convo-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cv-convo-preview {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cv-convo-time {
  font-size: 11px;
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.cv-btn-load-more {
  display: block;
  width: calc(100% - var(--space-4));
  margin: var(--space-2) auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  text-align: center;
}

.cv-btn-load-more:hover {
  background: var(--color-bg-tertiary);
}

/* Thread */
.cv-thread {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-primary);
  position: relative;
}

.cv-thread-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border-secondary);
  min-height: 56px;
}

.cv-thread-header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cv-thread-title {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.cv-thread-meta {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
}

.cv-agent-status-inline {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.cv-conn-banner {
  padding: var(--space-2) var(--space-4);
  background: var(--color-warning);
  color: #fff;
  font-size: var(--text-xs);
  text-align: center;
}

/* Messages */
.cv-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.cv-load-older {
  align-self: center;
  width: auto;
  margin-bottom: var(--space-3);
}

.cv-msg-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-0-5);
}

.cv-date-sep {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-4) 0 var(--space-2);
}

.cv-date-sep::before,
.cv-date-sep::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--color-border-secondary);
}

.cv-date-sep span {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  font-weight: var(--weight-medium);
  white-space: nowrap;
}

/* Message row */
.cv-msg {
  display: flex;
  gap: var(--space-2);
  max-width: 75%;
  position: relative;
}

.cv-msg-own {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.cv-msg-other {
  align-self: flex-start;
}

.cv-msg-pending {
  opacity: 0.6;
}

.cv-msg-streaming {
  opacity: 1;
}

.cv-msg-system {
  align-self: center;
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-3);
}

.cv-msg-avatar {
  flex-shrink: 0;
  padding-top: 2px;
}

.cv-msg-avatar-spacer {
  width: 28px;
  flex-shrink: 0;
}

.cv-msg-content-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cv-msg-sender {
  font-size: 11px;
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
  margin-left: var(--space-2);
}

/* Bubbles */
.cv-msg-bubble {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-xl);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  word-break: break-word;
  white-space: pre-wrap;
}

.cv-bubble-sent {
  background: var(--color-bg-message-sent);
  color: var(--color-text-primary);
  border-bottom-right-radius: var(--radius-sm);
}

.cv-bubble-received {
  background: var(--color-bg-message-received);
  border: 1px solid var(--color-border-secondary);
  color: var(--color-text-primary);
  border-bottom-left-radius: var(--radius-sm);
}

.cv-msg-deleted {
  background: transparent;
  border: 1px dashed var(--color-border-primary);
  color: var(--color-text-tertiary);
}

.cv-msg-edited {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-left: var(--space-1);
}

.cv-msg-text {
  white-space: pre-wrap;
}

.cv-msg-empty {
  color: var(--color-text-tertiary);
  font-size: var(--text-xs);
}

.cv-msg-time {
  font-size: 10px;
  color: var(--color-text-tertiary);
  margin-left: var(--space-2);
  margin-top: 2px;
}

.cv-msg-own .cv-msg-time {
  text-align: right;
  margin-right: var(--space-2);
  margin-left: 0;
}

/* Message actions (hover) */
.cv-msg-actions {
  display: none;
  gap: var(--space-1);
  margin-top: 2px;
}

.cv-msg:hover .cv-msg-actions {
  display: flex;
}

.cv-msg-own .cv-msg-actions {
  justify-content: flex-end;
}

.cv-btn-icon {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  padding: 0;
  line-height: 1;
}

.cv-btn-icon:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border-primary);
}

/* Reactions */
.cv-reactions {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  margin-left: var(--space-2);
}

.cv-reaction-pill {
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-full);
  padding: 1px 6px;
  font-size: 12px;
  background: var(--color-bg-secondary);
  cursor: default;
}

/* Code blocks */
.cv-code-block {
  margin: var(--space-2) 0;
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.cv-code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-tertiary);
  font-size: 11px;
  color: var(--color-text-secondary);
}

.cv-btn-copy {
  border: none;
  background: transparent;
  color: var(--color-accent-primary);
  cursor: pointer;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.cv-btn-copy:hover {
  background: var(--color-accent-subtle);
}

.cv-code-block pre {
  margin: 0;
  padding: var(--space-3);
  background: var(--color-bg-tertiary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  overflow-x: auto;
  border-radius: 0;
}

.cv-code-block code {
  font-family: var(--font-mono);
}

/* Typing indicator */
.cv-typing-indicator {
  margin-top: var(--space-1);
}

.cv-typing-bubble {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: var(--space-2) var(--space-3);
  min-width: 48px;
}

.cv-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-text-tertiary);
  animation: cv-bounce 1.4s infinite ease-in-out both;
}

.cv-dot-2 { animation-delay: 0.16s; }
.cv-dot-3 { animation-delay: 0.32s; }

@keyframes cv-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Cursor blink for agent streaming */
.cv-cursor-blink {
  animation: cv-blink 1s step-end infinite;
  color: var(--color-accent-primary);
  font-weight: var(--weight-bold);
}

@keyframes cv-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Pulse dot */
.cv-pulse-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-success);
  animation: cv-pulse 2s infinite;
}

@keyframes cv-pulse {
  0% { box-shadow: 0 0 0 0 rgba(45, 125, 70, 0.6); }
  70% { box-shadow: 0 0 0 6px rgba(45, 125, 70, 0); }
  100% { box-shadow: 0 0 0 0 rgba(45, 125, 70, 0); }
}

/* Scroll-to-bottom */
.cv-scroll-bottom {
  position: absolute;
  bottom: 80px;
  right: var(--space-4);
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border-primary);
  background: var(--color-bg-elevated);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-lg);
  padding: 0;
  z-index: 5;
}

.cv-scroll-bottom:hover {
  background: var(--color-accent-subtle);
  border-color: var(--color-accent-primary);
}

/* Approval cards */
.cv-approvals {
  padding: var(--space-2) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border-top: 1px solid var(--color-border-secondary);
}

.cv-approval-card {
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--color-bg-secondary);
}

.cv-approval-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  font-size: var(--text-sm);
}

.cv-approval-icon {
  color: var(--color-warning);
  font-size: var(--text-lg);
}

.cv-approval-label {
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
}

.cv-approval-args {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
  max-height: 100px;
  overflow-y: auto;
}

.cv-approval-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.cv-approval-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cv-approval-scopes {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  margin-bottom: var(--space-2);
}

.cv-approval-scope-tag {
  font-size: var(--text-xs);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--color-accent-subtle);
  color: var(--color-accent-primary);
  font-weight: 500;
}

.cv-memory-badge {
  font-size: var(--text-xs);
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: rgba(110, 86, 207, 0.1);
  color: var(--color-accent-primary);
  font-weight: 500;
  margin-left: var(--space-2);
}

.cv-tool-duration {
  font-size: var(--text-xs);
  color: var(--color-text-tertiary);
  font-family: var(--font-mono);
  margin-left: auto;
}

/* Composer */
.cv-composer {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border-secondary);
}

.cv-composer-input {
  flex: 1;
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: var(--text-base);
  resize: none;
  outline: none;
  line-height: var(--leading-normal);
  overflow-y: auto;
  width: auto;
}

.cv-composer-input:focus {
  border-color: var(--color-accent-primary);
}

.cv-btn-send {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--color-accent-primary);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
  transition: background var(--duration-fast) var(--ease-default);
}

.cv-btn-send:hover {
  background: var(--color-accent-primary-hover);
}

.cv-btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cv-send-arrow {
  font-size: var(--text-lg);
  font-weight: var(--weight-bold);
  line-height: 1;
}

.cv-btn-stop {
  background: var(--color-error);
}

.cv-btn-stop:hover {
  background: var(--color-error);
  opacity: 0.8;
}

.cv-stop-icon {
  display: block;
  width: 12px;
  height: 12px;
  background: #fff;
  border-radius: 2px;
}

/* Edit form */
.cv-edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cv-edit-input {
  border: 1px solid var(--color-accent-primary);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  font-size: var(--text-sm);
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  resize: none;
  width: 100%;
}

.cv-edit-actions {
  display: flex;
  gap: var(--space-2);
}

/* Buttons */
.cv-btn-sm {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: var(--text-xs);
  cursor: pointer;
}

.cv-btn-sm:hover {
  background: var(--color-bg-tertiary);
}

.cv-btn-accent {
  background: var(--color-accent-primary);
  color: #fff;
  border-color: var(--color-accent-primary);
}

.cv-btn-accent:hover {
  background: var(--color-accent-primary-hover);
  border-color: var(--color-accent-primary-hover);
}

.cv-btn-deny {
  background: transparent;
  color: var(--color-error);
  border-color: var(--color-error);
}

.cv-btn-deny:hover {
  background: var(--color-error);
  color: #fff;
}

.cv-btn-full {
  width: 100%;
  padding: var(--space-3);
}

/* Side panel */
.cv-sidepanel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border-left: 1px solid var(--color-border-primary);
  background: var(--color-bg-secondary);
  overflow-y: auto;
}

.cv-sidepanel-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cv-sidepanel-header h3 {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.cv-agent-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
}

/* Tool log */
.cv-tool-log {
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.cv-tool-log-toggle {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  text-align: left;
  font-weight: var(--weight-medium);
}

.cv-tool-log-toggle:hover {
  background: var(--color-bg-input);
}

.cv-tool-log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 300px;
  overflow-y: auto;
}

.cv-tool-log-item {
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-border-secondary);
}

.cv-tool-log-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
}

.cv-tool-status-icon {
  font-size: 10px;
}

.cv-tool-done { color: var(--color-success); }
.cv-tool-running { color: var(--color-warning); }

.cv-tool-log-detail {
  font-family: var(--font-mono);
  font-size: 10px;
  margin-top: var(--space-1);
  max-height: 80px;
  overflow: hidden;
  color: var(--color-text-tertiary);
  background: transparent;
  padding: 0;
  border-radius: 0;
}

/* Members section */
.cv-members-section h4 {
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-2);
}

.cv-members-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cv-member-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-text-primary);
}

/* Empty state */
.cv-empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary);
  font-size: var(--text-base);
}

/* Modal */
.cv-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.cv-modal-overlay-dismiss {
  position: absolute;
  inset: 0;
  border: none;
  background: transparent;
  cursor: default;
}

.cv-modal {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  width: min(400px, 90vw);
  box-shadow: var(--shadow-xl);
}

.cv-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.cv-modal-header h3 {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.cv-modal-tabs {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
  border: 1px solid var(--color-border-secondary);
  border-radius: var(--radius-md);
  padding: 2px;
}

.cv-modal-tab {
  flex: 1;
  padding: var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  cursor: pointer;
}

.cv-tab-active {
  background: var(--color-accent-primary);
  color: #fff;
}

.cv-modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.cv-modal-form input {
  padding: var(--space-3);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-md);
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  font-size: var(--text-base);
}

.cv-modal-form input:focus {
  border-color: var(--color-accent-primary);
  outline: none;
}

/* Toast notifications */
.cv-toast {
  position: fixed;
  bottom: var(--space-5);
  left: 50%;
  transform: translateX(-50%);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  z-index: 200;
  cursor: pointer;
  box-shadow: var(--shadow-lg);
  animation: cv-slide-up 0.3s var(--ease-out);
}

.cv-toast-info {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-primary);
}

.cv-toast-error {
  background: var(--color-error);
  color: #fff;
  border: 1px solid var(--color-error);
}

@keyframes cv-slide-up {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Back button (mobile) */
.cv-back-btn {
  border: none;
  background: transparent;
  color: var(--color-accent-primary);
  font-size: var(--text-lg);
  cursor: pointer;
  padding: var(--space-1);
  display: none;
}

.cv-show-mobile-only {
  display: none;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .cv-layout {
    grid-template-columns: 1fr;
    height: calc(100vh - 120px);
  }

  .cv-layout:has(.cv-sidepanel) {
    grid-template-columns: 1fr;
  }

  .cv-hide-mobile {
    display: none;
  }

  .cv-show-mobile-only {
    display: block;
  }

  .cv-back-btn {
    display: flex;
  }

  .cv-sidepanel {
    display: none;
  }

  .cv-msg {
    max-width: 90%;
  }
}

@media (min-width: 769px) and (max-width: 1100px) {
  .cv-layout {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .cv-layout:has(.cv-sidepanel) {
    grid-template-columns: 280px minmax(0, 1fr) 240px;
  }
}
`;
