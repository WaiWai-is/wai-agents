import Foundation
import Testing
@testable import WaiAgentsKit

/// Extended model edge-case tests covering:
/// - BridgeConnection, Page, PageVersion, ConversationMember
/// - MessageEnvelope and toMessage() conversion
/// - MessageContent dual-format decoding (array blocks vs flat)
/// - MessageMetadata, MessageReaction
/// - Malformed/empty JSON payloads
/// - Codable round-trip for models not covered in previous waves
@Suite("Model Edge Cases Extended")
struct ModelEdgeCaseExtendedTests {

    private let encoder = JSONEncoder.waiagents
    private let decoder = JSONDecoder.waiagents

    // MARK: - BridgeConnection

    @Suite("BridgeConnection")
    struct BridgeConnectionTests {
        private let encoder = JSONEncoder.waiagents
        private let decoder = JSONDecoder.waiagents

        @Test("BridgeConnection round-trip encodes and decodes correctly")
        func roundTrip() throws {
            let bridge = BridgeConnection(
                id: "br_1",
                userID: "u_1",
                platform: .telegram,
                method: .bot,
                status: .connected,
                lastSyncAt: Date(timeIntervalSince1970: 1700000000)
            )
            let data = try encoder.encode(bridge)
            let decoded = try decoder.decode(BridgeConnection.self, from: data)
            #expect(decoded.id == "br_1")
            #expect(decoded.platform == .telegram)
            #expect(decoded.method == .bot)
            #expect(decoded.status == .connected)
        }

        @Test("All BridgeConnection.Platform cases decode correctly")
        func allPlatforms() throws {
            for platform in [
                BridgeConnection.Platform.telegram,
                .whatsapp,
                .signal,
                .discord
            ] {
                let json = """
                {"id":"b1","userId":"u1","platform":"\(platform.rawValue)","method":"bot","status":"connected","createdAt":"2024-01-01T00:00:00Z","updatedAt":"2024-01-01T00:00:00Z"}
                """
                let decoded = try decoder.decode(BridgeConnection.self, from: Data(json.utf8))
                #expect(decoded.platform == platform)
            }
        }

        @Test("All BridgeConnection.BridgeMethod cases decode correctly")
        func allMethods() throws {
            for method in [
                BridgeConnection.BridgeMethod.userLevel,
                .bot,
                .cloudAPI
            ] {
                let json = """
                {"id":"b1","userId":"u1","platform":"telegram","method":"\(method.rawValue)","status":"connected","createdAt":"2024-01-01T00:00:00Z","updatedAt":"2024-01-01T00:00:00Z"}
                """
                let decoded = try decoder.decode(BridgeConnection.self, from: Data(json.utf8))
                #expect(decoded.method == method)
            }
        }

        @Test("All BridgeConnection.BridgeStatus cases decode correctly")
        func allStatuses() throws {
            for status in [
                BridgeConnection.BridgeStatus.connected,
                .reconnecting,
                .disconnected,
                .error
            ] {
                let json = """
                {"id":"b1","userId":"u1","platform":"telegram","method":"bot","status":"\(status.rawValue)","createdAt":"2024-01-01T00:00:00Z","updatedAt":"2024-01-01T00:00:00Z"}
                """
                let decoded = try decoder.decode(BridgeConnection.self, from: Data(json.utf8))
                #expect(decoded.status == status)
            }
        }

        @Test("BridgeConnection with nil metadata and lastSyncAt")
        func nilOptionalFields() throws {
            let bridge = BridgeConnection(
                id: "br_2",
                userID: "u_1",
                platform: .whatsapp,
                method: .cloudAPI
            )
            let data = try encoder.encode(bridge)
            let decoded = try decoder.decode(BridgeConnection.self, from: data)
            #expect(decoded.metadata == nil)
            #expect(decoded.lastSyncAt == nil)
        }
    }

    // MARK: - Page and PageVersion

    @Suite("Page Model")
    struct PageModelTests {
        private let encoder = JSONEncoder.waiagents
        private let decoder = JSONDecoder.waiagents

        @Test("Page round-trip with all fields")
        func fullRoundTrip() throws {
            let page = Page(
                id: "page_1",
                creatorID: "u_1",
                agentID: "a_1",
                conversationID: "conv_1",
                title: "My Page",
                slug: "my-page",
                description: "A test page",
                thumbnailURL: URL(string: "https://example.com/thumb.jpg"),
                r2Path: "pages/page_1/v1",
                deployURL: URL(string: "https://openraccoon.com/p/my-page"),
                customDomain: "custom.example.com",
                version: 3,
                forkedFrom: "page_0",
                visibility: "public",
                viewCount: 42
            )
            let data = try encoder.encode(page)
            let decoded = try decoder.decode(Page.self, from: data)
            #expect(decoded.id == "page_1")
            #expect(decoded.slug == "my-page")
            #expect(decoded.version == 3)
            #expect(decoded.viewCount == 42)
            #expect(decoded.customDomain == "custom.example.com")
            #expect(decoded.forkedFrom == "page_0")
        }

        @Test("Page with minimal fields (nil optionals)")
        func minimalPage() throws {
            let page = Page(
                id: "page_2",
                creatorID: "u_2",
                title: "Minimal",
                slug: "minimal",
                r2Path: "pages/page_2/v1"
            )
            let data = try encoder.encode(page)
            let decoded = try decoder.decode(Page.self, from: data)
            #expect(decoded.agentID == nil)
            #expect(decoded.conversationID == nil)
            #expect(decoded.description == nil)
            #expect(decoded.thumbnailURL == nil)
            #expect(decoded.deployURL == nil)
            #expect(decoded.customDomain == nil)
            #expect(decoded.forkedFrom == nil)
        }

        @Test("PageVersion round-trip")
        func pageVersionRoundTrip() throws {
            let version = PageVersion(
                id: "pv_1",
                pageID: "page_1",
                version: 2,
                r2Path: "pages/page_1/v2",
                changes: "Updated header"
            )
            let data = try encoder.encode(version)
            let decoded = try decoder.decode(PageVersion.self, from: data)
            #expect(decoded.version == 2)
            #expect(decoded.changes == "Updated header")
        }

        @Test("PageVersion with nil changes")
        func pageVersionNilChanges() throws {
            let version = PageVersion(
                id: "pv_2",
                pageID: "page_1",
                version: 1,
                r2Path: "pages/page_1/v1"
            )
            let data = try encoder.encode(version)
            let decoded = try decoder.decode(PageVersion.self, from: data)
            #expect(decoded.changes == nil)
        }
    }

    // MARK: - ConversationMember

    @Suite("ConversationMember")
    struct ConversationMemberTests {
        private let encoder = JSONEncoder.waiagents
        private let decoder = JSONDecoder.waiagents

        @Test("ConversationMember round-trip with all roles")
        func allRoles() throws {
            for role in [
                ConversationMember.MemberRole.owner,
                .admin,
                .member
            ] {
                let member = ConversationMember(
                    id: "cm_1",
                    conversationID: "conv_1",
                    userID: "u_1",
                    role: role
                )
                let data = try encoder.encode(member)
                let decoded = try decoder.decode(ConversationMember.self, from: data)
                #expect(decoded.role == role)
            }
        }

        @Test("ConversationMember muted default is false")
        func mutedDefault() {
            let member = ConversationMember(
                id: "cm_1",
                conversationID: "conv_1",
                userID: "u_1"
            )
            #expect(member.muted == false)
        }

        @Test("ConversationMember with lastReadAt nil")
        func nilLastReadAt() throws {
            let member = ConversationMember(
                id: "cm_1",
                conversationID: "conv_1",
                userID: "u_1"
            )
            let data = try encoder.encode(member)
            let decoded = try decoder.decode(ConversationMember.self, from: data)
            #expect(decoded.lastReadAt == nil)
        }
    }

    // MARK: - MessageEnvelope

    @Suite("MessageEnvelope")
    struct MessageEnvelopeTests {
        private let encoder = JSONEncoder.waiagents
        private let decoder = JSONDecoder.waiagents

        @Test("MessageEnvelope toMessage produces correct Message")
        func toMessage() {
            let envelope = MessageEnvelope(
                id: "env_1",
                conversationID: "conv_1",
                sender: .init(id: "u_1", type: .human, displayName: "Alex"),
                type: .text,
                content: MessageContent(text: "Hello from envelope")
            )
            let message = envelope.toMessage()
            #expect(message.id == "env_1")
            #expect(message.conversationID == "conv_1")
            #expect(message.senderID == "u_1")
            #expect(message.senderType == .human)
            #expect(message.content.text == "Hello from envelope")
        }

        @Test("MessageEnvelope round-trip preserves all fields")
        func roundTrip() throws {
            let envelope = MessageEnvelope(
                id: "env_2",
                conversationID: "conv_2",
                sender: .init(
                    id: "u_2",
                    type: .agent,
                    displayName: "Bot",
                    avatarURL: URL(string: "https://example.com/avatar.png")
                ),
                type: .code,
                content: MessageContent(code: "print('hello')", language: "python"),
                metadata: MessageMetadata(agentModel: "claude-sonnet-4-6"),
                reactions: [
                    MessageReaction(id: "r1", messageID: "env_2", userID: "u_1", emoji: "thumbsup")
                ]
            )
            let data = try encoder.encode(envelope)
            let decoded = try decoder.decode(MessageEnvelope.self, from: data)
            #expect(decoded.sender.displayName == "Bot")
            #expect(decoded.sender.avatarURL?.absoluteString == "https://example.com/avatar.png")
            #expect(decoded.metadata?.agentModel == "claude-sonnet-4-6")
            #expect(decoded.reactions?.count == 1)
        }

        @Test("MessageEnvelope with nil optionals")
        func nilOptionals() throws {
            let envelope = MessageEnvelope(
                id: "env_3",
                conversationID: "conv_3",
                sender: .init(id: "u_3", type: .system),
                type: .system,
                content: MessageContent(text: "System message")
            )
            let data = try encoder.encode(envelope)
            let decoded = try decoder.decode(MessageEnvelope.self, from: data)
            #expect(decoded.metadata == nil)
            #expect(decoded.reactions == nil)
            #expect(decoded.sender.displayName == nil)
        }
    }

    // MARK: - MessageContent dual-format decoding

    @Suite("MessageContent Decoding")
    struct MessageContentDecodingTests {

        @Test("Decodes array-of-blocks format (text)")
        func arrayBlocksText() throws {
            let json = """
            [{"type":"text","text":"Hello world"}]
            """
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.text == "Hello world")
        }

        @Test("Decodes array-of-blocks format (code_block)")
        func arrayBlocksCode() throws {
            let json = """
            [{"type":"code_block","code":"let x = 1","language":"swift"}]
            """
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.code == "let x = 1")
            #expect(decoded.language == "swift")
        }

        @Test("Decodes array-of-blocks format (image)")
        func arrayBlocksImage() throws {
            let json = """
            [{"type":"image","url":"https://example.com/img.png"}]
            """
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.mediaURL?.absoluteString == "https://example.com/img.png")
        }

        @Test("Decodes array with multiple text blocks concatenated")
        func multipleTextBlocks() throws {
            let json = """
            [{"type":"text","text":"Hello "},{"type":"text","text":"world"}]
            """
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.text == "Hello world")
        }

        @Test("Decodes flat object format (legacy)")
        func flatObjectFormat() throws {
            let json = """
            {"text":"Legacy message","code":null}
            """
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.text == "Legacy message")
            #expect(decoded.code == nil)
        }

        @Test("Decodes flat object with embed")
        func flatObjectWithEmbed() throws {
            let json = """
            {"text":"Check this out","embed":{"title":"Link Title","description":"Link desc","url":"https://example.com"}}
            """
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.embed?.title == "Link Title")
            #expect(decoded.embed?.url?.absoluteString == "https://example.com")
        }

        @Test("Array format with unknown block types are ignored")
        func unknownBlockType() throws {
            let json = """
            [{"type":"text","text":"Hello"},{"type":"video","url":"https://example.com/vid.mp4"}]
            """
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.text == "Hello")
            #expect(decoded.mediaURL == nil)
        }

        @Test("Empty array decodes to nil content fields")
        func emptyArray() throws {
            let json = "[]"
            let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: Data(json.utf8))
            #expect(decoded.text == nil)
            #expect(decoded.code == nil)
            #expect(decoded.mediaURL == nil)
        }

        @Test("MessageContent encode produces flat object format")
        func encodeProducesFlatFormat() throws {
            let content = MessageContent(text: "Hello", code: "x=1", language: "py")
            let data = try JSONEncoder.waiagents.encode(content)
            let dict = try JSONDecoder().decode([String: String?].self, from: data)
            #expect(dict["text"] == "Hello")
            #expect(dict["code"] == "x=1")
            #expect(dict["language"] == "py")
        }
    }

    // MARK: - MessageMetadata

    @Suite("MessageMetadata")
    struct MessageMetadataTests {
        private let encoder = JSONEncoder.waiagents
        private let decoder = JSONDecoder.waiagents

        @Test("MessageMetadata round-trip with all fields")
        func fullRoundTrip() throws {
            let meta = MessageMetadata(
                bridgeSource: .init(platform: "telegram", externalMessageID: "ext_123", senderName: "TG User"),
                agentModel: "claude-sonnet-4-6",
                agentToolsUsed: ["web_search", "code_exec"],
                encryption: .e2e,
                editHistory: [.init(previousText: "old text", editedAt: Date(timeIntervalSince1970: 1700000000))],
                replyTo: "msg_prev",
                threadID: "thread_1"
            )
            let data = try encoder.encode(meta)
            let decoded = try decoder.decode(MessageMetadata.self, from: data)
            #expect(decoded.bridgeSource?.platform == "telegram")
            #expect(decoded.bridgeSource?.externalMessageID == "ext_123")
            #expect(decoded.agentToolsUsed?.count == 2)
            #expect(decoded.encryption == .e2e)
            #expect(decoded.editHistory?.count == 1)
            #expect(decoded.replyTo == "msg_prev")
            #expect(decoded.threadID == "thread_1")
        }

        @Test("All encryption types decode correctly")
        func allEncryptionTypes() throws {
            for enc in [MessageMetadata.EncryptionType.e2e, .server, .none] {
                let json = """
                {"encryption":"\(enc.rawValue)"}
                """
                let decoded = try decoder.decode(MessageMetadata.self, from: Data(json.utf8))
                #expect(decoded.encryption == enc)
            }
        }

        @Test("MessageMetadata with all nil optional fields")
        func allNil() throws {
            let meta = MessageMetadata()
            let data = try encoder.encode(meta)
            let decoded = try decoder.decode(MessageMetadata.self, from: data)
            #expect(decoded.bridgeSource == nil)
            #expect(decoded.agentModel == nil)
            #expect(decoded.encryption == nil)
        }
    }

    // MARK: - MessageReaction

    @Suite("MessageReaction")
    struct MessageReactionTests {

        @Test("MessageReaction round-trip")
        func roundTrip() throws {
            let reaction = MessageReaction(
                id: "r1",
                messageID: "m1",
                userID: "u1",
                emoji: "heart"
            )
            let data = try JSONEncoder.waiagents.encode(reaction)
            let decoded = try JSONDecoder.waiagents.decode(MessageReaction.self, from: data)
            #expect(decoded.emoji == "heart")
            #expect(decoded.messageID == "m1")
        }
    }

    // MARK: - Conversation types

    @Suite("Conversation Edge Cases")
    struct ConversationEdgeCaseTests {

        @Test("All ConversationType cases decode correctly")
        func allConversationTypes() throws {
            for type in [
                Conversation.ConversationType.dm,
                .group,
                .agent,
                .bridge
            ] {
                let json = """
                {"id":"c1","type":"\(type.rawValue)","createdAt":"2024-01-01T00:00:00Z"}
                """
                let decoded = try JSONDecoder.waiagents.decode(Conversation.self, from: Data(json.utf8))
                #expect(decoded.type == type)
            }
        }

        @Test("Conversation with all nil optional fields")
        func minimalConversation() {
            let conv = Conversation(id: "c1", type: .dm)
            #expect(conv.title == nil)
            #expect(conv.agentID == nil)
            #expect(conv.bridgeID == nil)
            #expect(conv.metadata == nil)
        }
    }

    // MARK: - User edge cases

    @Suite("User Edge Cases")
    struct UserEdgeCaseTests {

        @Test("All UserStatus cases")
        func allStatuses() {
            #expect(User.UserStatus.active.rawValue == "active")
            #expect(User.UserStatus.suspended.rawValue == "suspended")
            #expect(User.UserStatus.deleted.rawValue == "deleted")
        }

        @Test("All UserRole cases")
        func allRoles() {
            #expect(User.UserRole.user.rawValue == "user")
            #expect(User.UserRole.admin.rawValue == "admin")
            #expect(User.UserRole.moderator.rawValue == "moderator")
        }

        @Test("User with minimal fields")
        func minimalUser() throws {
            let json = """
            {"id":"u1","username":"test","createdAt":"2024-01-01T00:00:00Z"}
            """
            let decoded = try JSONDecoder.waiagents.decode(User.self, from: Data(json.utf8))
            #expect(decoded.email == nil)
            #expect(decoded.bio == nil)
            #expect(decoded.displayName == nil)
        }
    }
}
