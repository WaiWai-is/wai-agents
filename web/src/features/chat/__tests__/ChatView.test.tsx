import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  return { default: { registerLanguage, highlight, getLanguage } };
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
  useAgentStream: () => ({
    streamingMessage: null,
    isStreaming: false,
  }),
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

describe('ChatView', () => {
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

  it('renders the chat module container', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    expect(screen.getByLabelText('chat-module')).toBeInTheDocument();
  });

  it('shows sidebar title "Chats"', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    expect(screen.getByText('Chats')).toBeInTheDocument();
  });

  it('fetches conversations on mount', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(api.listConversations).toHaveBeenCalled();
    });
  });

  it('shows loading state when no conversations exist yet', () => {
    const slowApi = createMockApi({
      listConversations: vi.fn().mockReturnValue(new Promise(() => {})),
    });
    render(<ChatView api={slowApi} accessToken="tok" currentUser={currentUser} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays conversation list after load', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      // "Test Chat" appears in both sidebar and thread header
      expect(screen.getAllByText('Test Chat').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows "No conversations" when list is empty', async () => {
    const emptyApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={emptyApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('No conversations')).toBeInTheDocument();
    });
  });

  it('fetches messages when a conversation is loaded', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ limit: 30 }),
      );
    });
  });

  it('fetches members when conversation is selected', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(api.listMembers).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ limit: 100 }),
      );
    });
  });

  it('shows the thread header with conversation title', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      // Title appears in both sidebar and thread header
      const matches = screen.getAllByText('Test Chat');
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('displays message content in the thread', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Hello, world!')).toBeInTheDocument();
    });
  });

  it('renders multiple messages', async () => {
    const multiApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-1',
            content: { text: 'First message' },
            created_at: '2026-03-10T12:00:00Z',
          }),
          makeMessage({
            id: 'msg-2',
            content: { text: 'Second message' },
            created_at: '2026-03-10T12:01:00Z',
          }),
          makeMessage({
            id: 'msg-3',
            content: { text: 'Agent reply' },
            sender_id: 'agent-1',
            sender_type: 'agent',
            created_at: '2026-03-10T12:02:00Z',
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={multiApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Second message')).toBeInTheDocument();
      expect(screen.getByText('Agent reply')).toBeInTheDocument();
    });
  });

  it('renders system messages with italic style', async () => {
    const sysApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-sys',
            content: { text: 'User joined' },
            sender_type: 'system',
            type: 'system',
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={sysApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('User joined')).toBeInTheDocument();
      const em = screen.getByText('User joined').closest('em');
      expect(em).toBeInTheDocument();
    });
  });

  it('shows "Message deleted" for deleted messages', async () => {
    const deletedApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [makeMessage({ id: 'msg-del', deleted_at: '2026-03-10T12:05:00Z' })],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={deletedApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Message deleted')).toBeInTheDocument();
    });
  });

  it('shows search input for filtering conversations', () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    expect(screen.getByPlaceholderText('Search conversations...')).toBeInTheDocument();
  });

  it('shows the new conversation button', () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    expect(screen.getByTitle('New conversation')).toBeInTheDocument();
  });

  it('renders reconnection banner only when socket is not connected', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    // Wait for conversations to load (thread is rendered)
    await waitFor(() => {
      expect(screen.getAllByText('Test Chat').length).toBeGreaterThanOrEqual(1);
    });
    // The wsConnected starts false, so the banner should show
    expect(screen.getByText('Reconnecting to server...')).toBeInTheDocument();
  });

  it('displays edited indicator for edited messages', async () => {
    const editedApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [
          makeMessage({
            id: 'msg-ed',
            edited_at: '2026-03-10T12:05:00Z',
            sender_id: 'other-user',
            sender_type: 'human',
          }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(<ChatView api={editedApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('(edited)')).toBeInTheDocument();
    });
  });

  it('shows "Load older messages" button when there are more messages', async () => {
    const moreApi = createMockApi({
      listMessages: vi.fn().mockResolvedValue({
        items: [makeMessage()],
        page_info: { next_cursor: 'cursor-1', has_more: true },
      }),
    });
    render(<ChatView api={moreApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Load older messages')).toBeInTheDocument();
    });
  });

  it('shows error message when conversation fetch fails', async () => {
    const errorApi = createMockApi({
      listConversations: vi.fn().mockRejectedValue(new Error('Network timeout')),
    });
    render(<ChatView api={errorApi} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(screen.getByText('Network timeout')).toBeInTheDocument();
    });
  });

  it('auto-selects first conversation on mount', async () => {
    render(<ChatView api={api} accessToken="tok" currentUser={currentUser} />);
    await waitFor(() => {
      expect(api.listMessages).toHaveBeenCalledWith('conv-1', expect.any(Object));
    });
  });

  it('focuses a conversation via focusConversationId prop', async () => {
    const multiConvoApi = createMockApi({
      listConversations: vi.fn().mockResolvedValue({
        items: [
          makeConversation({ id: 'conv-1', title: 'Chat 1' }),
          makeConversation({ id: 'conv-2', title: 'Chat 2' }),
        ],
        page_info: { next_cursor: null, has_more: false },
      }),
    });
    render(
      <ChatView
        api={multiConvoApi}
        accessToken="tok"
        currentUser={currentUser}
        focusConversationId="conv-2"
      />,
    );
    await waitFor(() => {
      expect(multiConvoApi.listMessages).toHaveBeenCalledWith('conv-2', expect.any(Object));
    });
  });
});
