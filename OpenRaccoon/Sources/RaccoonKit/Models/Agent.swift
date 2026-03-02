import Foundation

public struct Agent: Identifiable, Sendable, Equatable {
    public let id: String
    public let creatorID: String
    public var name: String
    public var slug: String
    public var description: String?
    public var avatarURL: URL?
    public var systemPrompt: String?
    public var model: String?
    public var temperature: Double?
    public var maxTokens: Int?
    public var tools: [ToolConfig]?
    public var mcpServers: [McpServerConfig]?
    public var visibility: Visibility?
    public var category: String?
    public var usageCount: Int?
    public var ratingSum: Int?
    public var ratingCount: Int?
    public var averageRatingFromAPI: Double?
    public var metadata: [String: AnyCodable]?
    public let createdAt: Date
    public var updatedAt: Date

    public enum Visibility: String, Codable, Sendable {
        case `public`
        case unlisted
        case `private`
    }

    public struct ToolConfig: Codable, Sendable, Equatable {
        public var name: String
        public var enabled: Bool
        public var config: [String: AnyCodable]?

        public init(name: String, enabled: Bool = true, config: [String: AnyCodable]? = nil) {
            self.name = name
            self.enabled = enabled
            self.config = config
        }
    }

    public struct McpServerConfig: Codable, Sendable, Equatable {
        public var name: String
        public var url: String
        public var authToken: String?
        public var tools: [String]?

        public init(name: String, url: String, authToken: String? = nil, tools: [String]? = nil) {
            self.name = name
            self.url = url
            self.authToken = authToken
            self.tools = tools
        }
    }

    /// Average rating: prefer the value from the API (marketplace), fall back to computing from ratingSum / ratingCount.
    public var averageRating: Double {
        if let fromAPI = averageRatingFromAPI { return fromAPI }
        guard let sum = ratingSum, let count = ratingCount, count > 0 else { return 0 }
        return Double(sum) / Double(count)
    }

    enum CodingKeys: String, CodingKey {
        case id
        case creatorID = "creatorId"
        case name
        case slug
        case description
        case avatarURL = "avatarUrl"
        case systemPrompt
        case model
        case temperature
        case maxTokens
        case tools
        case mcpServers
        case visibility
        case category
        case usageCount
        case ratingSum
        case ratingCount
        case averageRatingFromAPI = "averageRating"
        case metadata
        case createdAt
        case updatedAt
    }

    public init(
        id: String,
        creatorID: String,
        name: String,
        slug: String,
        description: String? = nil,
        avatarURL: URL? = nil,
        systemPrompt: String? = nil,
        model: String? = "claude-sonnet-4-6",
        temperature: Double? = 0.7,
        maxTokens: Int? = 4096,
        tools: [ToolConfig]? = nil,
        mcpServers: [McpServerConfig]? = nil,
        visibility: Visibility? = .private,
        category: String? = nil,
        usageCount: Int? = 0,
        ratingSum: Int? = 0,
        ratingCount: Int? = 0,
        averageRatingFromAPI: Double? = nil,
        metadata: [String: AnyCodable]? = nil,
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.creatorID = creatorID
        self.name = name
        self.slug = slug
        self.description = description
        self.avatarURL = avatarURL
        self.systemPrompt = systemPrompt
        self.model = model
        self.temperature = temperature
        self.maxTokens = maxTokens
        self.tools = tools
        self.mcpServers = mcpServers
        self.visibility = visibility
        self.category = category
        self.usageCount = usageCount
        self.ratingSum = ratingSum
        self.ratingCount = ratingCount
        self.averageRatingFromAPI = averageRatingFromAPI
        self.metadata = metadata
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// Custom Codable — explicit init(from:) ensures optional fields missing from the API response
// (e.g. marketplace items omit system_prompt, temperature, etc.) decode as nil instead of
// throwing keyNotFound. The auto-synthesized decoder has issues with .convertFromSnakeCase
// and missing optional keys in some Swift/Xcode versions.
extension Agent: Codable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        creatorID = try container.decode(String.self, forKey: .creatorID)
        name = try container.decode(String.self, forKey: .name)
        slug = try container.decode(String.self, forKey: .slug)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        avatarURL = try container.decodeIfPresent(URL.self, forKey: .avatarURL)
        systemPrompt = try container.decodeIfPresent(String.self, forKey: .systemPrompt)
        model = try container.decodeIfPresent(String.self, forKey: .model)
        temperature = try container.decodeIfPresent(Double.self, forKey: .temperature)
        maxTokens = try container.decodeIfPresent(Int.self, forKey: .maxTokens)
        tools = try container.decodeIfPresent([ToolConfig].self, forKey: .tools)
        mcpServers = try container.decodeIfPresent([McpServerConfig].self, forKey: .mcpServers)
        visibility = try container.decodeIfPresent(Visibility.self, forKey: .visibility)
        category = try container.decodeIfPresent(String.self, forKey: .category)
        usageCount = try container.decodeIfPresent(Int.self, forKey: .usageCount)
        ratingSum = try container.decodeIfPresent(Int.self, forKey: .ratingSum)
        ratingCount = try container.decodeIfPresent(Int.self, forKey: .ratingCount)
        averageRatingFromAPI = try container.decodeIfPresent(Double.self, forKey: .averageRatingFromAPI)
        metadata = try container.decodeIfPresent([String: AnyCodable].self, forKey: .metadata)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(creatorID, forKey: .creatorID)
        try container.encode(name, forKey: .name)
        try container.encode(slug, forKey: .slug)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(avatarURL, forKey: .avatarURL)
        try container.encodeIfPresent(systemPrompt, forKey: .systemPrompt)
        try container.encodeIfPresent(model, forKey: .model)
        try container.encodeIfPresent(temperature, forKey: .temperature)
        try container.encodeIfPresent(maxTokens, forKey: .maxTokens)
        try container.encodeIfPresent(tools, forKey: .tools)
        try container.encodeIfPresent(mcpServers, forKey: .mcpServers)
        try container.encodeIfPresent(visibility, forKey: .visibility)
        try container.encodeIfPresent(category, forKey: .category)
        try container.encodeIfPresent(usageCount, forKey: .usageCount)
        try container.encodeIfPresent(ratingSum, forKey: .ratingSum)
        try container.encodeIfPresent(ratingCount, forKey: .ratingCount)
        try container.encodeIfPresent(averageRatingFromAPI, forKey: .averageRatingFromAPI)
        try container.encodeIfPresent(metadata, forKey: .metadata)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(updatedAt, forKey: .updatedAt)
    }
}
