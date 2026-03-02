import Foundation

/// Unified message envelope matching the common format from the backend.
/// This is the wire format for messages received over WebSocket and REST.
public struct MessageEnvelope: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let conversationID: String
    public let sender: SenderInfo
    public let type: Message.MessageType
    public var content: MessageContent
    public var metadata: MessageMetadata?
    public var reactions: [MessageReaction]?
    public let createdAt: Date
    public var updatedAt: Date?

    public struct SenderInfo: Codable, Sendable, Equatable {
        public let id: String
        public let type: Message.SenderType
        public var displayName: String?
        public var avatarURL: URL?

        enum CodingKeys: String, CodingKey {
            case id
            case type
            case displayName
            case avatarURL = "avatarUrl"
        }

        public init(
            id: String,
            type: Message.SenderType,
            displayName: String? = nil,
            avatarURL: URL? = nil
        ) {
            self.id = id
            self.type = type
            self.displayName = displayName
            self.avatarURL = avatarURL
        }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case conversationID = "conversationId"
        case sender
        case type
        case content
        case metadata
        case reactions
        case createdAt
        case updatedAt
    }

    public init(
        id: String,
        conversationID: String,
        sender: SenderInfo,
        type: Message.MessageType,
        content: MessageContent,
        metadata: MessageMetadata? = nil,
        reactions: [MessageReaction]? = nil,
        createdAt: Date = Date(),
        updatedAt: Date? = Date()
    ) {
        self.id = id
        self.conversationID = conversationID
        self.sender = sender
        self.type = type
        self.content = content
        self.metadata = metadata
        self.reactions = reactions
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    /// Convert the envelope into a `Message` model for local storage.
    public func toMessage() -> Message {
        Message(
            id: id,
            conversationID: conversationID,
            senderID: sender.id,
            senderType: sender.type,
            type: type,
            content: content,
            metadata: metadata,
            createdAt: createdAt
        )
    }
}
