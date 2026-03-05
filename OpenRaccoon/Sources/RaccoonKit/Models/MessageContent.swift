import Foundation

public struct MessageContent: Sendable, Equatable {
    public var text: String?
    public var mediaURL: URL?
    public var code: String?
    public var language: String?
    public var embed: EmbedContent?

    public struct EmbedContent: Codable, Sendable, Equatable {
        public var title: String?
        public var description: String?
        public var url: URL?
        public var thumbnailURL: URL?

        enum CodingKeys: String, CodingKey {
            case title
            case description
            case url
            case thumbnailURL = "thumbnailUrl"
        }

        public init(
            title: String? = nil,
            description: String? = nil,
            url: URL? = nil,
            thumbnailURL: URL? = nil
        ) {
            self.title = title
            self.description = description
            self.url = url
            self.thumbnailURL = thumbnailURL
        }
    }

    public init(
        text: String? = nil,
        mediaURL: URL? = nil,
        code: String? = nil,
        language: String? = nil,
        embed: EmbedContent? = nil
    ) {
        self.text = text
        self.mediaURL = mediaURL
        self.code = code
        self.language = language
        self.embed = embed
    }
}

// MARK: - Codable

extension MessageContent: Codable {
    /// Content block from the API: `[{"type":"text","text":"..."}, ...]`
    private struct ContentBlock: Codable {
        let type: String
        let text: String?
        let code: String?
        let language: String?
        let url: String?
    }

    public init(from decoder: Decoder) throws {
        // Try decoding as an array of content blocks (API format)
        if let container = try? decoder.singleValueContainer(),
           let blocks = try? container.decode([ContentBlock].self) {
            var text: String?
            var mediaURL: URL?
            var code: String?
            var language: String?

            for block in blocks {
                switch block.type {
                case "text":
                    if let t = block.text {
                        text = (text ?? "") + t
                    }
                case "code_block":
                    code = block.code
                    language = block.language
                case "image":
                    if let urlStr = block.url { mediaURL = URL(string: urlStr) }
                default:
                    break
                }
            }

            self.text = text
            self.mediaURL = mediaURL
            self.code = code
            self.language = language
            self.embed = nil
            return
        }

        // Fall back to flat object decoding (legacy/local format)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.text = try container.decodeIfPresent(String.self, forKey: .text)
        self.mediaURL = try container.decodeIfPresent(URL.self, forKey: .mediaURL)
        self.code = try container.decodeIfPresent(String.self, forKey: .code)
        self.language = try container.decodeIfPresent(String.self, forKey: .language)
        self.embed = try container.decodeIfPresent(EmbedContent.self, forKey: .embed)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(text, forKey: .text)
        try container.encodeIfPresent(mediaURL, forKey: .mediaURL)
        try container.encodeIfPresent(code, forKey: .code)
        try container.encodeIfPresent(language, forKey: .language)
        try container.encodeIfPresent(embed, forKey: .embed)
    }

    enum CodingKeys: String, CodingKey {
        case text
        case mediaURL = "mediaUrl"
        case code
        case language
        case embed
    }
}
