import Foundation

public struct Conversation: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public var type: ConversationType
    public var title: String?
    public var avatarURL: URL?
    public var creatorID: String?
    public var agentID: String?
    public var bridgeID: String?
    public var metadata: [String: AnyCodable]?
    public var lastMessageAt: Date?
    public let createdAt: Date
    public var updatedAt: Date?

    public enum ConversationType: String, Codable, Sendable {
        case dm
        case group
        case agent
        case bridge
    }

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case title
        case avatarURL = "avatarUrl"
        case creatorID = "creatorId"
        case agentID = "agentId"
        case bridgeID = "bridgeId"
        case metadata
        case lastMessageAt
        case createdAt
        case updatedAt
    }

    public init(
        id: String,
        type: ConversationType,
        title: String? = nil,
        avatarURL: URL? = nil,
        creatorID: String? = nil,
        agentID: String? = nil,
        bridgeID: String? = nil,
        metadata: [String: AnyCodable]? = nil,
        lastMessageAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date? = Date()
    ) {
        self.id = id
        self.type = type
        self.title = title
        self.avatarURL = avatarURL
        self.creatorID = creatorID
        self.agentID = agentID
        self.bridgeID = bridgeID
        self.metadata = metadata
        self.lastMessageAt = lastMessageAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
