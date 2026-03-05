import Foundation

public enum APIEndpoint: Sendable {
    // MARK: - Auth
    case register(username: String, email: String, password: String)
    case login(email: String, password: String)
    case refresh(refreshToken: String)
    case logout(refreshToken: String)
    case requestMagicLink(email: String)
    case verifyMagicLink(token: String)

    // MARK: - Users
    case me
    case updateMe(displayName: String?, bio: String?, avatarURL: String?)
    case userProfile(username: String)
    case usage

    // MARK: - Conversations
    case listConversations(cursor: String?, limit: Int?)
    case createConversation(type: String, title: String?, agentID: String?)
    case getConversation(id: String)
    case updateConversation(id: String, title: String?)
    case deleteConversation(id: String)
    case listMessages(conversationID: String, cursor: String?, limit: Int?)
    case sendMessage(conversationID: String, content: MessageContent, idempotencyKey: String)
    case listMembers(conversationID: String)
    case addMember(conversationID: String, userID: String)
    case removeMember(conversationID: String, userID: String)

    // MARK: - Agents
    case listAgents
    case createAgent(name: String, systemPrompt: String, model: String?)
    case getAgent(id: String)
    case updateAgent(id: String, params: [String: AnyCodable])
    case deleteAgent(id: String)
    case startAgentConversation(agentID: String)

    // MARK: - Pages
    case listPages
    case createPage(title: String, slug: String)
    case getPage(id: String)
    case updatePage(id: String, title: String?, description: String?)
    case deployPage(id: String, idempotencyKey: String)
    case forkPage(id: String, idempotencyKey: String)
    case pageVersions(id: String)

    // MARK: - Bridges
    case listBridges
    case connectTelegram
    case connectWhatsApp
    case disconnectBridge(id: String)
    case bridgeStatus(id: String)

    // MARK: - Feed
    case feed(cursor: String?, limit: Int?)
    case trending(cursor: String?, limit: Int?)
    case followingFeed(cursor: String?, limit: Int?)
    case newFeedItems(cursor: String?, limit: Int?)
    case likeFeedItem(id: String)
    case unlikeFeedItem(id: String)
    case forkFeedItem(id: String, idempotencyKey: String)

    // MARK: - Marketplace
    case marketplace(cursor: String?, limit: Int?)
    case marketplaceCategories
    case agentProfile(slug: String)
    case rateAgent(id: String, rating: Int, review: String?)
    case searchMarketplace(query: String)

    public var method: String {
        switch self {
        case .register, .login, .refresh, .sendMessage, .createConversation,
             .addMember, .createAgent, .startAgentConversation, .createPage,
             .deployPage, .forkPage, .connectTelegram, .connectWhatsApp,
             .likeFeedItem, .forkFeedItem, .rateAgent,
             .requestMagicLink, .verifyMagicLink:
            return "POST"
        case .updateMe, .updateConversation, .updateAgent, .updatePage:
            return "PATCH"
        case .logout, .deleteConversation, .removeMember, .deleteAgent,
             .disconnectBridge, .unlikeFeedItem:
            return "DELETE"
        default:
            return "GET"
        }
    }

    public var path: String {
        switch self {
        case .register: return "/auth/register"
        case .login: return "/auth/login"
        case .refresh: return "/auth/refresh"
        case .logout: return "/auth/logout"
        case .requestMagicLink: return "/auth/magic-link"
        case .verifyMagicLink: return "/auth/magic-link/verify"

        case .me, .updateMe: return "/users/me"
        case .userProfile(let username): return "/users/\(username)"
        case .usage: return "/users/me/usage"

        case .listConversations, .createConversation: return "/conversations"
        case .getConversation(let id), .updateConversation(let id, _), .deleteConversation(let id):
            return "/conversations/\(id)"
        case .listMessages(let cid, _, _), .sendMessage(let cid, _, _):
            return "/conversations/\(cid)/messages"
        case .listMembers(let cid), .addMember(let cid, _):
            return "/conversations/\(cid)/members"
        case .removeMember(let cid, let uid):
            return "/conversations/\(cid)/members/\(uid)"

        case .listAgents, .createAgent: return "/agents"
        case .getAgent(let id), .updateAgent(let id, _), .deleteAgent(let id):
            return "/agents/\(id)"
        case .startAgentConversation(let id): return "/agents/\(id)/conversation"

        case .listPages, .createPage: return "/pages"
        case .getPage(let id), .updatePage(let id, _, _): return "/pages/\(id)"
        case .deployPage(let id, _): return "/pages/\(id)/deploy"
        case .forkPage(let id, _): return "/pages/\(id)/fork"
        case .pageVersions(let id): return "/pages/\(id)/versions"

        case .listBridges: return "/bridges"
        case .connectTelegram: return "/bridges/telegram/connect"
        case .connectWhatsApp: return "/bridges/whatsapp/connect"
        case .disconnectBridge(let id): return "/bridges/\(id)"
        case .bridgeStatus(let id): return "/bridges/\(id)/status"

        case .feed: return "/feed"
        case .trending: return "/feed/trending"
        case .followingFeed: return "/feed/following"
        case .newFeedItems: return "/feed/new"
        case .likeFeedItem(let id), .unlikeFeedItem(let id): return "/feed/\(id)/like"
        case .forkFeedItem(let id, _): return "/feed/\(id)/fork"

        case .marketplace: return "/marketplace"
        case .marketplaceCategories: return "/marketplace/categories"
        case .agentProfile(let slug): return "/marketplace/agents/\(slug)"
        case .rateAgent(let id, _, _): return "/marketplace/agents/\(id)/rate"
        case .searchMarketplace: return "/marketplace/search"
        }
    }

    public var requiresAuth: Bool {
        switch self {
        case .register, .login, .refresh, .requestMagicLink, .verifyMagicLink:
            return false
        default:
            return true
        }
    }

    public var idempotencyKey: String? {
        switch self {
        case .sendMessage(_, _, let key),
             .deployPage(_, let key),
             .forkPage(_, let key),
             .forkFeedItem(_, let key):
            return key
        default:
            return nil
        }
    }

    public var queryItems: [URLQueryItem]? {
        switch self {
        case .listConversations(let cursor, let limit),
             .feed(let cursor, let limit),
             .trending(let cursor, let limit),
             .followingFeed(let cursor, let limit),
             .newFeedItems(let cursor, let limit),
             .marketplace(let cursor, let limit):
            var items: [URLQueryItem] = []
            if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
            if let limit { items.append(URLQueryItem(name: "limit", value: String(limit))) }
            return items.isEmpty ? nil : items
        case .listMessages(_, let cursor, let limit):
            var items: [URLQueryItem] = []
            if let cursor { items.append(URLQueryItem(name: "cursor", value: cursor)) }
            if let limit { items.append(URLQueryItem(name: "limit", value: String(limit))) }
            return items.isEmpty ? nil : items
        case .searchMarketplace(let query):
            return [URLQueryItem(name: "q", value: query)]
        default:
            return nil
        }
    }

    public func urlRequest(baseURL: URL) throws -> URLRequest {
        let fullPath = "/api/v1" + path
        var components = URLComponents(
            url: baseURL.appendingPathComponent(fullPath),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw APIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        request.httpBody = try httpBody()

        return request
    }

    private func httpBody() throws -> Data? {
        let encoder = JSONEncoder.raccoon
        switch self {
        case .register(let username, let email, let password):
            return try encoder.encode(["username": username, "email": email, "password": password])
        case .login(let email, let password):
            return try encoder.encode(["email": email, "password": password])
        case .refresh(let refreshToken):
            return try encoder.encode(["refresh_token": refreshToken])
        case .requestMagicLink(let email):
            return try encoder.encode(["email": email])
        case .verifyMagicLink(let token):
            return try encoder.encode(["token": token])
        case .logout(let refreshToken):
            return try encoder.encode(["refresh_token": refreshToken])
        case .createConversation(let type, let title, let agentID):
            var body: [String: String] = ["type": type]
            if let title { body["title"] = title }
            if let agentID { body["agent_id"] = agentID }
            return try encoder.encode(body)
        case .sendMessage(_, let content, _):
            // API expects content as array of ContentBlock objects
            struct ContentBlock: Encodable {
                let type: String
                let text: String?
                let code: String?
                let language: String?
                let url: String?
                let name: String?
            }
            struct SendMessageBody: Encodable {
                let content: [ContentBlock]
            }
            var blocks: [ContentBlock] = []
            if let text = content.text {
                blocks.append(ContentBlock(type: "text", text: text, code: nil, language: nil, url: nil, name: nil))
            }
            if let code = content.code {
                blocks.append(ContentBlock(type: "code_block", text: nil, code: code, language: content.language ?? "plaintext", url: nil, name: nil))
            }
            if let mediaURL = content.mediaURL {
                blocks.append(ContentBlock(type: "image", text: nil, code: nil, language: nil, url: mediaURL.absoluteString, name: nil))
            }
            return try encoder.encode(SendMessageBody(content: blocks))
        case .addMember(_, let userID):
            return try encoder.encode(["user_id": userID])
        case .createAgent(let name, let systemPrompt, let model):
            var body: [String: String] = ["name": name, "system_prompt": systemPrompt]
            if let model { body["model"] = model }
            return try encoder.encode(body)
        case .createPage(let title, let slug):
            return try encoder.encode(["title": title, "slug": slug])
        case .rateAgent(_, let rating, let review):
            var body: [String: AnyCodable] = ["rating": AnyCodable(rating)]
            if let review { body["review"] = AnyCodable(review) }
            return try encoder.encode(body)
        case .updateMe(let displayName, let bio, let avatarURL):
            var body: [String: String] = [:]
            if let displayName { body["display_name"] = displayName }
            if let bio { body["bio"] = bio }
            if let avatarURL { body["avatar_url"] = avatarURL }
            return try encoder.encode(body)
        case .updateConversation(_, let title):
            var body: [String: String] = [:]
            if let title { body["title"] = title }
            return try encoder.encode(body)
        case .updateAgent(_, let params):
            return try encoder.encode(params)
        case .updatePage(_, let title, let description):
            var body: [String: String] = [:]
            if let title { body["title"] = title }
            if let description { body["description"] = description }
            return try encoder.encode(body)
        default:
            return nil
        }
    }
}
