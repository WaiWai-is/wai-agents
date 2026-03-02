import Foundation

public struct MessageReaction: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let messageID: String
    public let userID: String
    public let emoji: String
    public let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case messageID = "messageId"
        case userID = "userId"
        case emoji
        case createdAt
    }

    public init(
        id: String,
        messageID: String,
        userID: String,
        emoji: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.messageID = messageID
        self.userID = userID
        self.emoji = emoji
        self.createdAt = createdAt
    }
}
