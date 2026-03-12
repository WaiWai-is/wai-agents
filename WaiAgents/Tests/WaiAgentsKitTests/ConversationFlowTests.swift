import Foundation
import Testing
@testable import WaiAgentsKit

// MARK: - Helpers

private func makeMessage(
    id: String,
    conversationID: String = "conv_1",
    senderType: Message.SenderType = .human,
    text: String = "test",
    createdAt: Date = Date()
) -> Message {
    Message(
        id: id,
        conversationID: conversationID,
        senderType: senderType,
        type: .text,
        content: MessageContent(text: text),
        createdAt: createdAt
    )
}

private func makeConversation(
    id: String,
    type: Conversation.ConversationType = .dm,
    title: String? = nil,
    lastMessageAt: Date? = nil
) -> Conversation {
    Conversation(
        id: id,
        type: type,
        title: title,
        lastMessageAt: lastMessageAt
    )
}

@Suite("Conversation Flow")
struct ConversationFlowTests {

    // MARK: - Message Ordering

    @Test("Messages can be sorted by createdAt ascending")
    @MainActor
    func messagesSortedByCreatedAtAscending() {
        let store = MessageStore()
        let now = Date()

        let m1 = makeMessage(id: "m1", createdAt: now.addingTimeInterval(-60))
        let m2 = makeMessage(id: "m2", createdAt: now.addingTimeInterval(-30))
        let m3 = makeMessage(id: "m3", createdAt: now)

        // Insert out of order
        store.appendMessage(m3, to: "conv_1")
        store.appendMessage(m1, to: "conv_1")
        store.appendMessage(m2, to: "conv_1")

        let sorted = store.messages(for: "conv_1").sorted { $0.createdAt < $1.createdAt }
        #expect(sorted[0].id == "m1")
        #expect(sorted[1].id == "m2")
        #expect(sorted[2].id == "m3")
    }

    @Test("Messages with identical timestamps maintain insertion order")
    @MainActor
    func messagesWithSameTimestamp() {
        let store = MessageStore()
        let now = Date()

        let m1 = makeMessage(id: "m1", createdAt: now)
        let m2 = makeMessage(id: "m2", createdAt: now)

        store.appendMessage(m1, to: "conv_1")
        store.appendMessage(m2, to: "conv_1")

        let msgs = store.messages(for: "conv_1")
        #expect(msgs[0].id == "m1")
        #expect(msgs[1].id == "m2")
    }

    // MARK: - Optimistic Message Insertion and Replacement

    @Test("Optimistic message can be appended and later replaced by server version")
    @MainActor
    func optimisticInsertionAndReplacement() {
        let store = MessageStore()

        // Client creates optimistic message
        let optimistic = makeMessage(id: "temp_1", text: "Sending...")
        store.appendMessage(optimistic, to: "conv_1")
        #expect(store.messages(for: "conv_1").count == 1)
        #expect(store.messages(for: "conv_1")[0].content.text == "Sending...")

        // Server confirms: remove optimistic, add real
        store.removeMessage(id: "temp_1", from: "conv_1")
        let serverMessage = makeMessage(id: "msg_server_1", text: "Sent message")
        store.appendMessage(serverMessage, to: "conv_1")

        #expect(store.messages(for: "conv_1").count == 1)
        #expect(store.messages(for: "conv_1")[0].id == "msg_server_1")
        #expect(store.messages(for: "conv_1")[0].content.text == "Sent message")
    }

    @Test("Multiple optimistic messages can be pending simultaneously")
    @MainActor
    func multipleOptimisticMessages() {
        let store = MessageStore()

        store.appendMessage(makeMessage(id: "temp_1", text: "First"), to: "conv_1")
        store.appendMessage(makeMessage(id: "temp_2", text: "Second"), to: "conv_1")
        #expect(store.messages(for: "conv_1").count == 2)

        // Server confirms first
        store.removeMessage(id: "temp_1", from: "conv_1")
        store.appendMessage(makeMessage(id: "real_1", text: "First confirmed"), to: "conv_1")

        #expect(store.messages(for: "conv_1").count == 2)
        #expect(store.messages(for: "conv_1").contains { $0.id == "temp_2" })
        #expect(store.messages(for: "conv_1").contains { $0.id == "real_1" })
    }

    // MARK: - Message Deduplication

    @Test("Appending message with same ID creates duplicate (store does not auto-deduplicate)")
    @MainActor
    func appendDuplicateDoesNotDeduplicate() {
        let store = MessageStore()

        let msg = makeMessage(id: "m1", text: "original")
        store.appendMessage(msg, to: "conv_1")
        store.appendMessage(msg, to: "conv_1")

        // Store allows duplicates - callers responsible for dedup
        #expect(store.messages(for: "conv_1").count == 2)
    }

    @Test("UpdateMessage replaces in-place without duplication")
    @MainActor
    func updateMessageNoDuplication() {
        let store = MessageStore()

        store.appendMessage(makeMessage(id: "m1", text: "original"), to: "conv_1")
        store.appendMessage(makeMessage(id: "m2", text: "other"), to: "conv_1")

        store.updateMessage(makeMessage(id: "m1", text: "edited"), in: "conv_1")

        #expect(store.messages(for: "conv_1").count == 2)
        #expect(store.messages(for: "conv_1")[0].content.text == "edited")
    }

    // MARK: - Typing Indicator State Transitions

    @Test("TypingPayload encodes isTyping=true correctly")
    func typingStartPayload() throws {
        let payload = TypingPayload(userID: "user_1", isTyping: true)
        let data = try JSONEncoder.waiagents.encode(payload)
        let decoded = try JSONDecoder.waiagents.decode(TypingPayload.self, from: data)
        #expect(decoded.userID == "user_1")
        #expect(decoded.isTyping == true)
    }

    @Test("TypingPayload encodes isTyping=false correctly")
    func typingStopPayload() throws {
        let payload = TypingPayload(userID: "user_1", isTyping: false)
        let data = try JSONEncoder.waiagents.encode(payload)
        let decoded = try JSONDecoder.waiagents.decode(TypingPayload.self, from: data)
        #expect(decoded.isTyping == false)
    }

    @Test("TypingPayload with nil userID indicates unknown typist")
    func typingPayloadNilUser() throws {
        let json = """
        {"is_typing": true}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder.waiagents.decode(TypingPayload.self, from: json)
        #expect(decoded.userID == nil)
        #expect(decoded.isTyping == true)
    }

    // MARK: - Read Receipt Tracking

    @Test("ConversationClientEvent.read has correct raw value")
    func readEventRawValue() {
        #expect(ConversationClientEvent.read.rawValue == "read")
    }

    @Test("Read receipt payload structure is valid")
    func readReceiptPayloadStructure() throws {
        let payload: [String: Any] = ["message_id": "msg_123"]
        let data = try JSONSerialization.data(withJSONObject: payload)
        let decoded = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(decoded?["message_id"] as? String == "msg_123")
    }

    // MARK: - Conversation Metadata Handling

    @Test("Conversation with metadata decodes correctly")
    func conversationWithMetadata() throws {
        let json = """
        {
            "id": "conv_meta",
            "type": "agent",
            "metadata": {
                "agent_model": "claude-sonnet-4-6",
                "pinned": true,
                "tags": ["important", "work"]
            },
            "created_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let conv = try JSONDecoder.waiagents.decode(Conversation.self, from: json)
        #expect(conv.id == "conv_meta")
        #expect(conv.metadata?["pinned"]?.boolValue == true)
        #expect(conv.metadata?["agent_model"]?.stringValue == "claude-sonnet-4-6")
        #expect(conv.metadata?["tags"]?.arrayValue?.count == 2)
    }

    @Test("Conversation with no metadata decodes metadata as nil")
    func conversationNoMetadata() throws {
        let json = """
        {
            "id": "conv_no_meta",
            "type": "dm",
            "created_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let conv = try JSONDecoder.waiagents.decode(Conversation.self, from: json)
        #expect(conv.metadata == nil)
    }

    @Test("ConversationStore upsert updates metadata")
    @MainActor
    func upsertUpdatesMetadata() {
        let store = ConversationStore()
        let original = Conversation(
            id: "conv_1",
            type: .dm,
            title: "Chat",
            metadata: ["key": .string("old")]
        )
        store.conversations = [original]

        let updated = Conversation(
            id: "conv_1",
            type: .dm,
            title: "Chat",
            metadata: ["key": .string("new"), "extra": .bool(true)]
        )
        store.upsert(updated)

        #expect(store.conversations.count == 1)
        #expect(store.conversations[0].metadata?["key"]?.stringValue == "new")
        #expect(store.conversations[0].metadata?["extra"]?.boolValue == true)
    }

    // MARK: - Conversation Type Handling

    @Test("All ConversationType values have unique raw values")
    func conversationTypeUnique() {
        let types: [Conversation.ConversationType] = [.dm, .group, .agent, .bridge]
        let rawValues = Set(types.map(\.rawValue))
        #expect(rawValues.count == types.count)
    }

    @Test("Conversation with lastMessageAt decodes correctly")
    func conversationLastMessageAt() throws {
        let json = """
        {
            "id": "conv_lm",
            "type": "dm",
            "last_message_at": "2026-03-01T15:30:00Z",
            "created_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let conv = try JSONDecoder.waiagents.decode(Conversation.self, from: json)
        #expect(conv.lastMessageAt != nil)
    }

    // MARK: - MessageEnvelope to Message Conversion

    @Test("MessageEnvelope toMessage preserves all core fields")
    func envelopeToMessagePreservesFields() {
        let sender = MessageEnvelope.SenderInfo(
            id: "user_1",
            type: .human,
            displayName: "Alice",
            avatarURL: URL(string: "https://example.com/avatar.jpg")
        )
        let content = MessageContent(text: "Hello from envelope")
        let metadata = MessageMetadata(replyTo: "msg_prev", threadID: "thread_1")

        let envelope = MessageEnvelope(
            id: "env_1",
            conversationID: "conv_1",
            sender: sender,
            type: .text,
            content: content,
            metadata: metadata
        )

        let message = envelope.toMessage()
        #expect(message.id == "env_1")
        #expect(message.conversationID == "conv_1")
        #expect(message.senderID == "user_1")
        #expect(message.senderType == .human)
        #expect(message.type == .text)
        #expect(message.content.text == "Hello from envelope")
        #expect(message.metadata?.replyTo == "msg_prev")
        #expect(message.metadata?.threadID == "thread_1")
    }

    @Test("MessageEnvelope toMessage conversion does not carry sender displayName or avatarURL")
    func envelopeToMessageNoSenderDetails() {
        let sender = MessageEnvelope.SenderInfo(
            id: "user_1",
            type: .agent,
            displayName: "Bot",
            avatarURL: URL(string: "https://example.com/bot.png")
        )
        let envelope = MessageEnvelope(
            id: "env_2",
            conversationID: "conv_1",
            sender: sender,
            type: .text,
            content: MessageContent(text: "Hi")
        )

        let message = envelope.toMessage()
        // Message struct does not have displayName or avatarURL for sender
        #expect(message.senderID == "user_1")
        #expect(message.senderType == .agent)
    }
}
