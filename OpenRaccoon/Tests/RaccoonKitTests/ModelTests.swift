import Testing
import Foundation
@testable import RaccoonKit

@Suite("Model Encoding/Decoding")
struct ModelTests {
    @Test("User decodes from JSON")
    func userDecode() throws {
        let json = """
        {
            "id": "user_123",
            "username": "alice",
            "display_name": "Alice",
            "status": "active",
            "role": "user",
            "created_at": "2026-02-25T08:00:00Z",
            "updated_at": "2026-02-25T08:00:00Z"
        }
        """.data(using: .utf8)!

        let user = try JSONDecoder.raccoon.decode(User.self, from: json)
        #expect(user.id == "user_123")
        #expect(user.username == "alice")
        #expect(user.displayName == "Alice")
        #expect(user.status == .active)
        #expect(user.role == .user)
    }

    @Test("Conversation decodes from JSON")
    func conversationDecode() throws {
        let json = """
        {
            "id": "conv_456",
            "type": "dm",
            "title": "Chat with Bob",
            "created_at": "2026-02-25T08:00:00Z",
            "updated_at": "2026-02-25T08:00:00Z"
        }
        """.data(using: .utf8)!

        let conv = try JSONDecoder.raccoon.decode(Conversation.self, from: json)
        #expect(conv.id == "conv_456")
        #expect(conv.type == .dm)
        #expect(conv.title == "Chat with Bob")
    }

    @Test("Message type enums decode correctly")
    func messageTypeEnums() throws {
        #expect(Message.SenderType.human.rawValue == "human")
        #expect(Message.SenderType.agent.rawValue == "agent")
        #expect(Message.SenderType.bridge.rawValue == "bridge")
        #expect(Message.SenderType.system.rawValue == "system")
        #expect(Message.MessageType.agentStatus.rawValue == "agent_status")
        #expect(Message.MessageType.text.rawValue == "text")
        #expect(Message.MessageType.media.rawValue == "media")
        #expect(Message.MessageType.code.rawValue == "code")
    }

    @Test("AnyCodable encodes and decodes strings")
    func anyCodableString() throws {
        let original = AnyCodable("test")
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(AnyCodable.self, from: data)
        #expect(decoded == original)
    }

    @Test("AnyCodable encodes and decodes integers")
    func anyCodableInt() throws {
        let original = AnyCodable(42)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(AnyCodable.self, from: data)
        #expect(decoded == original)
    }

    @Test("AnyCodable encodes and decodes booleans")
    func anyCodableBool() throws {
        let original = AnyCodable(true)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(AnyCodable.self, from: data)
        #expect(decoded == original)
    }

    @Test("Agent decodes from JSON")
    func agentDecode() throws {
        let json = """
        {
            "id": "agent_789",
            "creator_id": "user_123",
            "name": "Code Helper",
            "slug": "code-helper",
            "system_prompt": "You are a helpful coding assistant.",
            "model": "claude-sonnet-4-6",
            "temperature": 0.7,
            "max_tokens": 4096,
            "visibility": "public",
            "usage_count": 100,
            "rating_sum": 45,
            "rating_count": 10,
            "created_at": "2026-02-25T08:00:00Z",
            "updated_at": "2026-02-25T08:00:00Z"
        }
        """.data(using: .utf8)!

        let agent = try JSONDecoder.raccoon.decode(Agent.self, from: json)
        #expect(agent.id == "agent_789")
        #expect(agent.name == "Code Helper")
        #expect(agent.visibility == .public)
        #expect(agent.averageRating == 4.5)
    }

    @Test("Agent decodes from marketplace JSON (partial fields)")
    func agentDecodeMarketplace() throws {
        // Marketplace endpoint omits system_prompt, temperature, max_tokens, rating_sum, tools, mcp_servers, metadata
        let json = """
        {
            "id": "agent_789",
            "creator_id": "user_123",
            "name": "Code Helper",
            "slug": "code-helper",
            "description": "A helpful coding assistant",
            "model": "claude-sonnet-4-6",
            "category": "coding",
            "visibility": "public",
            "usage_count": 100,
            "rating_count": 10,
            "average_rating": 4.5,
            "created_at": "2026-02-25T08:00:00Z",
            "updated_at": "2026-02-25T08:00:00Z"
        }
        """.data(using: .utf8)!

        let agent = try JSONDecoder.raccoon.decode(Agent.self, from: json)
        #expect(agent.id == "agent_789")
        #expect(agent.name == "Code Helper")
        #expect(agent.visibility == .public)
        #expect(agent.systemPrompt == nil)
        #expect(agent.temperature == nil)
        #expect(agent.maxTokens == nil)
        #expect(agent.ratingSum == nil)
        #expect(agent.averageRating == 4.5)
    }

    @Test("PaginatedResponse<Agent> decodes marketplace listing")
    func paginatedAgentDecode() throws {
        let json = """
        {
            "items": [
                {
                    "id": "agent_001",
                    "creator_id": "user_123",
                    "name": "Agent One",
                    "slug": "agent-one",
                    "model": "claude-sonnet-4-6",
                    "visibility": "public",
                    "usage_count": 50,
                    "rating_count": 5,
                    "average_rating": 4.0,
                    "created_at": "2026-02-25T08:00:00Z",
                    "updated_at": "2026-02-25T08:00:00Z"
                }
            ],
            "page_info": {
                "next_cursor": null,
                "has_more": false
            }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder.raccoon.decode(PaginatedResponse<Agent>.self, from: json)
        #expect(response.items.count == 1)
        #expect(response.items[0].name == "Agent One")
        #expect(response.pageInfo.hasMore == false)
    }

    @Test("BridgeConnection decodes from JSON")
    func bridgeConnectionDecode() throws {
        let json = """
        {
            "id": "bridge_001",
            "user_id": "user_123",
            "platform": "telegram",
            "method": "user_level",
            "status": "connected",
            "created_at": "2026-02-25T08:00:00Z",
            "updated_at": "2026-02-25T08:00:00Z"
        }
        """.data(using: .utf8)!

        let bridge = try JSONDecoder.raccoon.decode(BridgeConnection.self, from: json)
        #expect(bridge.id == "bridge_001")
        #expect(bridge.platform == .telegram)
        #expect(bridge.method == .userLevel)
        #expect(bridge.status == .connected)
    }

    @Test("FeedItem decodes from JSON")
    func feedItemDecode() throws {
        let json = """
        {
            "id": "feed_001",
            "creator_id": "user_123",
            "type": "agent_showcase",
            "reference_id": "agent_789",
            "reference_type": "agent",
            "title": "My Agent",
            "quality_score": 0.85,
            "trending_score": 0.72,
            "like_count": 42,
            "fork_count": 8,
            "view_count": 200,
            "created_at": "2026-02-25T08:00:00Z",
            "updated_at": "2026-02-25T08:00:00Z"
        }
        """.data(using: .utf8)!

        let item = try JSONDecoder.raccoon.decode(FeedItem.self, from: json)
        #expect(item.id == "feed_001")
        #expect(item.type == .agentShowcase)
        #expect(item.referenceType == .agent)
        #expect(item.likeCount == 42)
    }

    @Test("ConversationMember decodes from JSON")
    func conversationMemberDecode() throws {
        let json = """
        {
            "id": "mem_001",
            "conversation_id": "conv_456",
            "user_id": "user_123",
            "role": "owner",
            "muted": false,
            "joined_at": "2026-02-25T08:00:00Z"
        }
        """.data(using: .utf8)!

        let member = try JSONDecoder.raccoon.decode(ConversationMember.self, from: json)
        #expect(member.id == "mem_001")
        #expect(member.role == .owner)
        #expect(member.muted == false)
    }

    @Test("MessageContent round-trips through encoding")
    func messageContentRoundTrip() throws {
        let content = MessageContent(text: "Hello, world!", code: "print('hi')", language: "python")
        let data = try JSONEncoder.raccoon.encode(content)
        let decoded = try JSONDecoder.raccoon.decode(MessageContent.self, from: data)
        #expect(decoded == content)
    }

    @Test("MessageEnvelope converts to Message")
    func envelopeToMessage() {
        let sender = MessageEnvelope.SenderInfo(id: "user_123", type: .human, displayName: "Alice")
        let content = MessageContent(text: "Test message")
        let envelope = MessageEnvelope(
            id: "msg_001",
            conversationID: "conv_456",
            sender: sender,
            type: .text,
            content: content
        )

        let message = envelope.toMessage()
        #expect(message.id == "msg_001")
        #expect(message.conversationID == "conv_456")
        #expect(message.senderID == "user_123")
        #expect(message.senderType == .human)
        #expect(message.content.text == "Test message")
    }
}
