import Foundation

public struct User: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public var username: String
    public var displayName: String?
    public var email: String?
    public var avatarURL: URL?
    public var bio: String?
    public var status: UserStatus?
    public var role: UserRole?
    public var settings: [String: AnyCodable]?
    public var lastSeenAt: Date?
    public let createdAt: Date
    public var updatedAt: Date?

    public enum UserStatus: String, Codable, Sendable {
        case active
        case suspended
        case deleted
    }

    public enum UserRole: String, Codable, Sendable {
        case user
        case admin
        case moderator
    }

    enum CodingKeys: String, CodingKey {
        case id
        case username
        case displayName
        case email
        case avatarURL = "avatarUrl"
        case bio
        case status
        case role
        case settings
        case lastSeenAt
        case createdAt
        case updatedAt
    }

    public init(
        id: String,
        username: String,
        displayName: String? = nil,
        email: String? = nil,
        avatarURL: URL? = nil,
        bio: String? = nil,
        status: UserStatus? = .active,
        role: UserRole? = .user,
        settings: [String: AnyCodable]? = nil,
        lastSeenAt: Date? = nil,
        createdAt: Date = Date(),
        updatedAt: Date? = Date()
    ) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.email = email
        self.avatarURL = avatarURL
        self.bio = bio
        self.status = status
        self.role = role
        self.settings = settings
        self.lastSeenAt = lastSeenAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
