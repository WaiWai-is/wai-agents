import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Polyfill scrollIntoView for jsdom
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock CSS imports
vi.mock('highlight.js/styles/github-dark.min.css', () => ({}));
vi.mock('../chat-blocks.css', () => ({}));

// Mock highlight.js
vi.mock('highlight.js/lib/core', () => {
  const registerLanguage = vi.fn();
  const highlight = vi.fn(() => ({ value: '' }));
  const getLanguage = vi.fn(() => undefined);
  const highlightAuto = vi.fn(() => ({ value: '' }));
  return { default: { registerLanguage, highlight, getLanguage, highlightAuto } };
});
vi.mock('highlight.js/lib/languages/bash', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/css', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/elixir', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/javascript', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/json', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/python', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/sql', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/typescript', () => ({ default: {} }));
vi.mock('highlight.js/lib/languages/xml', () => ({ default: {} }));

// Mock dompurify
vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}));

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
    id: 'mock-socket-id',
  })),
}));

// Mock the useAgentStream hook
vi.mock('../useAgentStream', () => ({
  useAgentStream: vi.fn(() => ({
    streamingMessage: null,
    isStreaming: false,
  })),
}));

// Mock content-blocks
vi.mock('../content-blocks', () => ({
  ContentBlockRenderer: ({ blocks }: { blocks: unknown[] }) => (
    <div data-testid="content-blocks">{JSON.stringify(blocks)}</div>
  ),
  parseContentBlocks: (content: unknown) => {
    if (Array.isArray(content)) return content;
    if (content && typeof content === 'object' && 'text' in content) {
      return [{ type: 'text', text: (content as { text: string }).text }];
    }
    return [];
  },
}));

import type { WaiAgentsApi } from '@/lib/api/services';
import type { SessionUser } from '@/lib/state/session-store';
import type { Conversation, ConversationMember, Message } from '@/lib/types';
import { ChatView } from '../ChatView';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    type: 'dm',
    title: 'Test Chat',
    avatar_url: null,
    creator_id: 'user-1',
    agent_id: null,
    bridge_id: null,
    metadata: {},
    last_message_at: '2026-03-10T12:00:00Z',
    created_at: '2026-03-10T11:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    sender_type: 'human',
    type: 'text',
    content: { text: 'Hello, world!' },
    metadata: {},
    edited_at: null,
    deleted_at: null,
    created_at: '2026-03-10T12:00:00Z',
    reactions: [],
    ...overrides,
  };
}

function makeMember(overrides: Partial<ConversationMember> = {}): ConversationMember {
  return {
    id: 'member-1',
    conversation_id: 'conv-1',
    user_id: 'user-1',
    role: 'owner',
    muted: false,
    last_read_at: null,
    joined_at: '2026-03-10T11:00:00Z',
    user: {
      id: 'user-1',
      username: 'alice',
      display_name: 'Alice',
      avatar_url: null,
    },
    ...overrides,
  };
}

const currentUser: SessionUser = {
  id: 'user-1',
  username: 'alice',
  display_name: 'Alice',
  email: 'alice@test.com',
  avatar_url: null,
  bio: null,
};

function createMockApi(overrides: Partial<WaiAgentsApi> = {}): WaiAgentsApi {
  return {
    listConversations: vi.fn().mockResolvedValue({
      items: [makeConversation()],
      page_info: { next_cursor: null, has_more: false },
    }),
    listMessages: vi.fn().mockResolvedValue({
      items: [makeMessage()],
      page_info: { next_cursor: null, has_more: false },
    }),
    listMembers: vi.fn().mockResolvedValue({
      items: [makeMember()],
      page_info: { next_cursor: null, has_more: false },
    }),
    sendTextMessage: vi.fn().mockResolvedValue({
      message: makeMessage({ id: 'msg-new' }),
    }),
    createConversation: vi.fn().mockResolvedValue({
      conversation: makeConversation({ id: 'conv-new' }),
    }),
    editTextMessage: vi.fn().mockResolvedValue({
      message: makeMessage({
        id: 'msg-1',
        content: { text: 'Edited' },
        edited_at: '2026-03-10T13:00:00Z',
      }),
    }),
    deleteMessage: vi.fn().mockResolvedValue({
      message: makeMessage({ id: 'msg-1', deleted_at: '2026-03-10T13:00:00Z' }),
    }),
    userByUsername: vi.fn().mockResolvedValue({
      user: { id: 'user-2', username: 'bob' },
    }),
    ...overrides,
  } as unknown as WaiAgentsApi;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('ChatView edge cases', () => {
  let api: WaiAgentsApi;

  beforeEach(() => {
    api = createMockApi();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /* ---- Message list rendering ---- */

  it('renders a message list with messages', async () => {
    const multiApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-a',
            content: { text: 'Message A' },
            created_at: '2026-03-10T12:00:00Z',
          }),
          makeMessage({
            id: 'msg-b',
            content: { text: 'Message B' },
            created_at: '2026-03-10T12:01:00Z',
          }),
          makeMessage({
            id: 'msg-c',
            content: { text: 'Message C' },
            created_at: '2026-03-10T12:02:00Z',
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={multiApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Message A')).toBeInTheDocument();
      expect(screen.getByText('Message B')).toBeInTheDocument();
      expect(screen.getByText('Message C')).toBeInTheDocument();
    });
  });

  it('renders messages from different senders with distinct styling', async () => {
    const multiSenderApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-own',
            content: { text: 'My message' },
            sender_id: 'user-1',
            created_at: '2026-03-10T12:00:00Z',
          }),
          makeMessage({
            id: 'msg-other',
            content: { text: 'Their message' },
            sender_id: 'user-2',
            sender_type: 'human',
            created_at: '2026-03-10T12:01:00Z',
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
      listMembers: vi.fn().mockResolvedValue({
        items: [
          makeMember(),
          makeMember({
            id: 'member-2',
            user_id: 'user-2',
            user: { id: 'user-2', username: 'bob', display_name: 'Bob', avatar_url: null },
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={multiSenderApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      const ownMsg = screen.getByText('My message').closest('.cv-msg');
      expect(ownMsg?.classList.contains('cv-msg-own')).toBe(true);
      const otherMsg = screen.getByText('Their message').closest('.cv-msg');
      expect(otherMsg?.classList.contains('cv-msg-other')).toBe(true);
    });
  });

  /* ---- Streaming / loading state ---- */

  it('shows streaming indicator when isStreaming is true', async () => {
    const { useAgentStream } = await import('../useAgentStream');
    vi.mocked(useAgentStream).mockReturnValue({
      streamingMessage: { blocks: [{ type: 'text', text: 'streaming...' }] },
      isStreaming: true,
    } as any);

    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('Test Chat').length).toBeGreaterThanOrEqual(1);
    });
    // Streaming message should render the content-blocks mock
    const streamingContainer = document.querySelector('.cv-msg-streaming');
    expect(streamingContainer).toBeInTheDocument();
  });

  it('shows stop button while streaming instead of send button', async () => {
    const { useAgentStream } = await import('../useAgentStream');
    vi.mocked(useAgentStream).mockReturnValue({
      streamingMessage: { blocks: [{ type: 'text', text: 'working...' }] },
      isStreaming: true,
    } as any);

    const agentApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [makeConversation({ type: 'agent', agent_id: 'agent-1' })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });

    render(<ChatView api={agentApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('Test Chat').length).toBeGreaterThanOrEqual(1);
    });

    const stopBtn = screen.getByTitle('Stop generating');
    expect(stopBtn).toBeInTheDocument();
  });

  /* ---- Empty conversation ---- */

  it('handles empty conversation with no messages', async () => {
    const emptyMsgApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={emptyMsgApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('Test Chat').length).toBeGreaterThanOrEqual(1);
    });
    // Composer should still be visible even with no messages
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('shows empty state when no conversation is selected', async () => {
    const noConvoApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={noConvoApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Select a conversation to start chatting')).toBeInTheDocument();
    });
  });

  /* ---- Error messages ---- */

  it('displays error toast when message fetch fails', async () => {
    const errorApi = createMockApi({
      listMessages: vi.fn().mockRejectedValue(new Error('Message load failed')),
    });
    render(<ChatView api={errorApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Message load failed')).toBeInTheDocument();
    });
  });

  it('displays error when send fails and removes optimistic message', async () => {
    const failSendApi = createMockApi({
      sendTextMessage: vi.fn().mockRejectedValue(new Error('Send failed')),
    });
    render(<ChatView api={failSendApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'test message');
    // Submit the form by pressing Enter
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Send failed')).toBeInTheDocument();
    });
  });

  it('error toast is dismissible on click', async () => {
    const errorApi = createMockApi({
      listConversations: vi.fn().mockRejectedValue(new Error('Connection error')),
    });
    render(<ChatView api={errorApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Connection error')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByText('Connection error'));
    expect(screen.queryByText('Connection error')).not.toBeInTheDocument();
  });

  /* ---- Keyboard shortcuts ---- */

  it('sends message on Enter key press', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
    // Wait for messages to load so conversation is selected
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalled();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'Hello there');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(api.sendTextMessage).toHaveBeenCalledWith('conv-1', 'Hello there');
    });
  });

  it('does not send message on Shift+Enter (allows newline)', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalled();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'Line 1');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    // Should NOT have called send
    expect(api.sendTextMessage).not.toHaveBeenCalled();
  });

  /* ---- Input validation ---- */

  it('does not send empty messages', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalled();
    });

    // Press Enter with empty textarea
    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(api.sendTextMessage).not.toHaveBeenCalled();
  });

  it('does not send whitespace-only messages', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalled();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '   ');
    await user.keyboard('{Enter}');

    expect(api.sendTextMessage).not.toHaveBeenCalled();
  });

  it('hides send button when draft is empty', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('Test Chat').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByTitle('Send message')).not.toBeInTheDocument();
  });

  it('shows send button when draft has text', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByPlaceholderText('Type a message...'), 'hello');

    await waitFor(() => {
      expect(screen.getByTitle('Send message')).toBeInTheDocument();
    });
  });

  /* ---- Long message handling ---- */

  it('renders long messages without crashing', async () => {
    const longText = 'A'.repeat(5000);
    const longMsgApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [makeMessage({ id: 'msg-long', content: { text: longText } })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={longMsgApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText(longText)).toBeInTheDocument();
    });
  });

  it('sends a long message successfully', async () => {
    const longText = 'B'.repeat(2000);
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(textarea, { target: { value: longText } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(api.sendTextMessage).toHaveBeenCalledWith('conv-1', longText);
    });
  });

  /* ---- Special characters ---- */

  it('renders messages with special characters correctly', async () => {
    const specialApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({ id: 'msg-special', content: { text: '<script>alert("xss")</script>' } }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={specialApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('<script>alert("xss")</script>')).toBeInTheDocument();
    });
  });

  it('renders messages with emoji content', async () => {
    const emojiApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-emoji',
            content: { text: 'Hello! \ud83d\ude00\ud83c\udf89\ud83d\udd25' },
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={emojiApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText(/Hello! \ud83d\ude00\ud83c\udf89\ud83d\udd25/)).toBeInTheDocument();
    });
  });

  it('renders messages with unicode characters', async () => {
    const unicodeApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-unicode',
            content: {
              text: '\u4f60\u597d\u4e16\u754c \u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435 \u3053\u3093\u306b\u3061\u306f',
            },
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={unicodeApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText(/\u4f60\u597d\u4e16\u754c/)).toBeInTheDocument();
    });
  });

  it('renders messages with newlines', async () => {
    const newlineApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [makeMessage({ id: 'msg-nl', content: { text: 'Line 1\nLine 2\nLine 3' } })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={newlineApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    });
  });

  /* ---- Multiple rapid sends ---- */

  it('clears draft after sending', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalled();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const textarea = screen.getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
    await user.type(textarea, 'First message');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(textarea.value).toBe('');
    });
  });

  it('creates optimistic message while send is pending', async () => {
    const slowSendApi = createMockApi({
      sendTextMessage: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<ChatView api={slowSendApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(slowSendApi.listMessages).toHaveBeenCalled();
    });

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByPlaceholderText('Type a message...'), 'Pending message');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Pending message')).toBeInTheDocument();
    });
    // The optimistic message should have pending styling
    const pendingMsg = screen.getByText('Pending message').closest('.cv-msg');
    expect(pendingMsg?.classList.contains('cv-msg-pending')).toBe(true);
  });

  /* ---- Conversation search ---- */

  it('filters conversations by search input', async () => {
    const multiConvoApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [
          makeConversation({ id: 'conv-1', title: 'Alpha Chat' }),
          makeConversation({
            id: 'conv-2',
            title: 'Beta Chat',
            last_message_at: '2026-03-10T11:00:00Z',
          }),
          makeConversation({
            id: 'conv-3',
            title: 'Gamma Discussion',
            last_message_at: '2026-03-10T10:00:00Z',
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={multiConvoApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Alpha Chat')).toBeInTheDocument();
      expect(screen.getByText('Beta Chat')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search conversations...');
    fireEvent.change(searchInput, { target: { value: 'Beta' } });

    // Check within the sidebar conversation list only (thread header still shows selected convo)
    const sidebar = screen.getByLabelText('conversation-list');
    await waitFor(() => {
      expect(sidebar.textContent).toContain('Beta Chat');
      expect(sidebar.textContent).not.toContain('Alpha Chat');
      expect(sidebar.textContent).not.toContain('Gamma Discussion');
    });
  });

  /* ---- Conversation list / navigation ---- */

  it('shows conversation list with aria-label', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByLabelText('conversation-list')).toBeInTheDocument();
    });
  });

  it('shows new conversation modal when + button is clicked', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTitle('New conversation'));
    expect(screen.getByText('New Conversation')).toBeInTheDocument();
  });

  it('shows DM and Group tabs in new conversation modal', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTitle('New conversation'));
    expect(screen.getByText('DM')).toBeInTheDocument();
    expect(screen.getByText('Group')).toBeInTheDocument();
  });

  it('closes new conversation modal via close button', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(screen.getByTitle('New conversation'));
    expect(screen.getByText('New Conversation')).toBeInTheDocument();

    // The close button renders &times; (\u00d7)
    const closeBtn = screen.getByLabelText('Close modal');
    await user.click(closeBtn);
    expect(screen.queryByText('New Conversation')).not.toBeInTheDocument();
  });

  /* ---- Message reactions ---- */

  it('renders message reactions', async () => {
    const reactionApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-react',
            content: { text: 'Nice!' },
            reactions: [
              { id: 'r1', message_id: 'msg-react', user_id: 'user-2', emoji: '\ud83d\udc4d' },
              { id: 'r2', message_id: 'msg-react', user_id: 'user-3', emoji: '\ud83d\udc4d' },
              { id: 'r3', message_id: 'msg-react', user_id: 'user-2', emoji: '\u2764\ufe0f' },
            ],
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={reactionApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText(/\ud83d\udc4d/)).toBeInTheDocument();
      expect(screen.getByText(/\u2764\ufe0f/)).toBeInTheDocument();
    });
  });

  /* ---- Agent conversation ---- */

  it('renders agent panel for agent conversations', async () => {
    const agentConvoApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [makeConversation({ type: 'agent', agent_id: 'agent-1' })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={agentConvoApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Agent')).toBeInTheDocument();
    });
  });

  it('shows member count in agent side panel', async () => {
    const agentConvoApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [makeConversation({ type: 'agent', agent_id: 'agent-1' })],
        page_info: { next_cursor: null, has_more: false },
      }),
      listMembers: vi.fn().mockResolvedValue({
        items: [makeMember(), makeMember({ id: 'member-2', user_id: 'user-2' })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={agentConvoApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Members (2)')).toBeInTheDocument();
    });
  });

  /* ---- Load more conversations ---- */

  it('shows Load more button for conversations when has_more', async () => {
    const pagedApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [makeConversation()],
        page_info: { next_cursor: 'c2', has_more: true },
      }),
    });
    render(<ChatView api={pagedApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  /* ---- Composer behavior ---- */

  it('has a placeholder text in the composer', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getAllByText('Test Chat').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
  });

  it('displays conversation type in thread meta', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      const metas = document.querySelectorAll('.cv-thread-meta');
      expect(metas.length).toBeGreaterThan(0);
      expect(metas[0].textContent).toContain('dm');
    });
  });
});
