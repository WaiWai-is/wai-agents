import Foundation
import Testing
@testable import WaiAgentsKit

@Suite("APIEndpoint")
struct APIEndpointTests {

    let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - URL Construction

    @Test("Auth endpoints produce correct paths")
    func authPaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.register(username: "u", email: "e", password: "p"), "/api/v1/auth/register"),
            (.login(email: "e", password: "p"), "/api/v1/auth/login"),
            (.refresh(refreshToken: "rt"), "/api/v1/auth/refresh"),
            (.logout(refreshToken: "rt"), "/api/v1/auth/logout"),
            (.requestMagicLink(email: "e"), "/api/v1/auth/magic-link"),
            (.verifyMagicLink(token: "t"), "/api/v1/auth/magic-link/verify"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath, "Endpoint path mismatch for \(endpoint)")
        }
    }

    @Test("User endpoints produce correct paths")
    func userPaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.me, "/api/v1/users/me"),
            (.updateMe(displayName: nil, bio: nil, avatarURL: nil), "/api/v1/users/me"),
            (.userProfile(username: "alice"), "/api/v1/users/alice"),
            (.usage, "/api/v1/users/me/usage"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Conversation endpoints produce correct paths")
    func conversationPaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.listConversations(cursor: nil, limit: nil), "/api/v1/conversations"),
            (.createConversation(type: "dm", title: nil, agentID: nil), "/api/v1/conversations"),
            (.getConversation(id: "c1"), "/api/v1/conversations/c1"),
            (.updateConversation(id: "c1", title: nil), "/api/v1/conversations/c1"),
            (.deleteConversation(id: "c1"), "/api/v1/conversations/c1"),
            (.listMessages(conversationID: "c1", cursor: nil, limit: nil), "/api/v1/conversations/c1/messages"),
            (.sendMessage(conversationID: "c1", content: MessageContent(text: "hi"), idempotencyKey: "k"), "/api/v1/conversations/c1/messages"),
            (.listMembers(conversationID: "c1"), "/api/v1/conversations/c1/members"),
            (.addMember(conversationID: "c1", userID: "u1"), "/api/v1/conversations/c1/members"),
            (.removeMember(conversationID: "c1", userID: "u1"), "/api/v1/conversations/c1/members/u1"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Agent endpoints produce correct paths")
    func agentPaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.listAgents, "/api/v1/agents"),
            (.createAgent(name: "Bot", systemPrompt: "sys", model: nil), "/api/v1/agents"),
            (.getAgent(id: "a1"), "/api/v1/agents/a1"),
            (.updateAgent(id: "a1", params: [:]), "/api/v1/agents/a1"),
            (.deleteAgent(id: "a1"), "/api/v1/agents/a1"),
            (.startAgentConversation(agentID: "a1"), "/api/v1/agents/a1/conversation"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Feed endpoints produce correct paths")
    func feedPaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.feed(cursor: nil, limit: nil), "/api/v1/feed"),
            (.trending(cursor: nil, limit: nil), "/api/v1/feed/trending"),
            (.followingFeed(cursor: nil, limit: nil), "/api/v1/feed/following"),
            (.newFeedItems(cursor: nil, limit: nil), "/api/v1/feed/new"),
            (.likeFeedItem(id: "f1"), "/api/v1/feed/f1/like"),
            (.unlikeFeedItem(id: "f1"), "/api/v1/feed/f1/like"),
            (.forkFeedItem(id: "f1", idempotencyKey: "k"), "/api/v1/feed/f1/fork"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Marketplace endpoints produce correct paths")
    func marketplacePaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.marketplace(cursor: nil, limit: nil), "/api/v1/marketplace"),
            (.marketplaceCategories, "/api/v1/marketplace/categories"),
            (.agentProfile(slug: "code-helper"), "/api/v1/marketplace/agents/code-helper"),
            (.rateAgent(id: "a1", rating: 5, review: nil), "/api/v1/marketplace/agents/a1/rate"),
            (.searchMarketplace(query: "test"), "/api/v1/marketplace/search"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Bridge endpoints produce correct paths")
    func bridgePaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.listBridges, "/api/v1/bridges"),
            (.connectTelegram, "/api/v1/bridges/telegram/connect"),
            (.connectWhatsApp, "/api/v1/bridges/whatsapp/connect"),
            (.disconnectBridge(id: "b1"), "/api/v1/bridges/b1"),
            (.bridgeStatus(id: "b1"), "/api/v1/bridges/b1/status"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Crew endpoints produce correct paths")
    func crewPaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.listCrews(cursor: nil, limit: nil), "/api/v1/crews"),
            (.createCrew(name: "C", steps: [], visibility: nil, description: nil, category: nil), "/api/v1/crews"),
            (.getCrew(id: "cr1"), "/api/v1/crews/cr1"),
            (.updateCrew(id: "cr1", params: [:]), "/api/v1/crews/cr1"),
            (.deleteCrew(id: "cr1"), "/api/v1/crews/cr1"),
            (.runCrew(id: "cr1", input: "go", idempotencyKey: "k"), "/api/v1/crews/cr1/run"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Trigger endpoints produce correct paths")
    func triggerPaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.listTriggers(agentID: "a1"), "/api/v1/agents/a1/triggers"),
            (.createTrigger(agentID: "a1", name: "T", triggerType: "webhook", params: nil), "/api/v1/agents/a1/triggers"),
            (.getTrigger(agentID: "a1", triggerID: "t1"), "/api/v1/agents/a1/triggers/t1"),
            (.updateTrigger(agentID: "a1", triggerID: "t1", params: [:]), "/api/v1/agents/a1/triggers/t1"),
            (.deleteTrigger(agentID: "a1", triggerID: "t1"), "/api/v1/agents/a1/triggers/t1"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    @Test("Page endpoints produce correct paths")
    func pagePaths() throws {
        let cases: [(APIEndpoint, String)] = [
            (.listPages, "/api/v1/pages"),
            (.createPage(title: "T", slug: "s"), "/api/v1/pages"),
            (.getPage(id: "p1"), "/api/v1/pages/p1"),
            (.updatePage(id: "p1", title: nil, description: nil), "/api/v1/pages/p1"),
            (.deployPage(id: "p1", idempotencyKey: "k"), "/api/v1/pages/p1/deploy"),
            (.forkPage(id: "p1", idempotencyKey: "k"), "/api/v1/pages/p1/fork"),
            (.pageVersions(id: "p1"), "/api/v1/pages/p1/versions"),
        ]
        for (endpoint, expectedPath) in cases {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url?.path == expectedPath)
        }
    }

    // MARK: - HTTP Methods

    @Test("POST endpoints use POST method")
    func postMethods() {
        let postEndpoints: [APIEndpoint] = [
            .register(username: "u", email: "e", password: "p"),
            .login(email: "e", password: "p"),
            .refresh(refreshToken: "rt"),
            .sendMessage(conversationID: "c", content: MessageContent(text: "hi"), idempotencyKey: "k"),
            .createConversation(type: "dm", title: nil, agentID: nil),
            .addMember(conversationID: "c", userID: "u"),
            .createAgent(name: "B", systemPrompt: "s", model: nil),
            .startAgentConversation(agentID: "a"),
            .createPage(title: "T", slug: "s"),
            .deployPage(id: "p", idempotencyKey: "k"),
            .forkPage(id: "p", idempotencyKey: "k"),
            .connectTelegram,
            .connectWhatsApp,
            .likeFeedItem(id: "f"),
            .forkFeedItem(id: "f", idempotencyKey: "k"),
            .rateAgent(id: "a", rating: 5, review: nil),
            .requestMagicLink(email: "e"),
            .verifyMagicLink(token: "t"),
            .createCrew(name: "C", steps: [], visibility: nil, description: nil, category: nil),
            .runCrew(id: "cr", input: "go", idempotencyKey: "k"),
            .createTrigger(agentID: "a", name: "T", triggerType: "webhook", params: nil),
        ]
        for endpoint in postEndpoints {
            #expect(endpoint.method == "POST", "\(endpoint) should be POST")
        }
    }

    @Test("PATCH endpoints use PATCH method")
    func patchMethods() {
        let patchEndpoints: [APIEndpoint] = [
            .updateMe(displayName: nil, bio: nil, avatarURL: nil),
            .updateConversation(id: "c", title: nil),
            .updateAgent(id: "a", params: [:]),
            .updatePage(id: "p", title: nil, description: nil),
            .updateCrew(id: "cr", params: [:]),
            .updateTrigger(agentID: "a", triggerID: "t", params: [:]),
        ]
        for endpoint in patchEndpoints {
            #expect(endpoint.method == "PATCH", "\(endpoint) should be PATCH")
        }
    }

    @Test("DELETE endpoints use DELETE method")
    func deleteMethods() {
        let deleteEndpoints: [APIEndpoint] = [
            .logout(refreshToken: "rt"),
            .deleteConversation(id: "c"),
            .removeMember(conversationID: "c", userID: "u"),
            .deleteAgent(id: "a"),
            .disconnectBridge(id: "b"),
            .unlikeFeedItem(id: "f"),
            .deleteCrew(id: "cr"),
            .deleteTrigger(agentID: "a", triggerID: "t"),
        ]
        for endpoint in deleteEndpoints {
            #expect(endpoint.method == "DELETE", "\(endpoint) should be DELETE")
        }
    }

    @Test("GET endpoints use GET method")
    func getMethods() {
        let getEndpoints: [APIEndpoint] = [
            .me,
            .userProfile(username: "alice"),
            .usage,
            .listConversations(cursor: nil, limit: nil),
            .getConversation(id: "c"),
            .listMessages(conversationID: "c", cursor: nil, limit: nil),
            .listMembers(conversationID: "c"),
            .listAgents,
            .getAgent(id: "a"),
            .listPages,
            .getPage(id: "p"),
            .pageVersions(id: "p"),
            .listBridges,
            .bridgeStatus(id: "b"),
            .feed(cursor: nil, limit: nil),
            .trending(cursor: nil, limit: nil),
            .followingFeed(cursor: nil, limit: nil),
            .newFeedItems(cursor: nil, limit: nil),
            .marketplace(cursor: nil, limit: nil),
            .marketplaceCategories,
            .agentProfile(slug: "s"),
            .searchMarketplace(query: "q"),
            .listCrews(cursor: nil, limit: nil),
            .getCrew(id: "cr"),
            .listTriggers(agentID: "a"),
            .getTrigger(agentID: "a", triggerID: "t"),
        ]
        for endpoint in getEndpoints {
            #expect(endpoint.method == "GET", "\(endpoint) should be GET")
        }
    }

    // MARK: - requiresAuth

    @Test("Auth endpoints do not require auth")
    func authEndpointsNoAuth() {
        let noAuthEndpoints: [APIEndpoint] = [
            .register(username: "u", email: "e", password: "p"),
            .login(email: "e", password: "p"),
            .refresh(refreshToken: "rt"),
            .requestMagicLink(email: "e"),
            .verifyMagicLink(token: "t"),
        ]
        for endpoint in noAuthEndpoints {
            #expect(!endpoint.requiresAuth, "\(endpoint) should not require auth")
        }
    }

    @Test("Non-auth endpoints require auth")
    func nonAuthEndpointsRequireAuth() {
        let authEndpoints: [APIEndpoint] = [
            .me,
            .listConversations(cursor: nil, limit: nil),
            .listAgents,
            .feed(cursor: nil, limit: nil),
            .marketplace(cursor: nil, limit: nil),
            .logout(refreshToken: "rt"),
        ]
        for endpoint in authEndpoints {
            #expect(endpoint.requiresAuth, "\(endpoint) should require auth")
        }
    }

    // MARK: - Idempotency Key

    @Test("sendMessage has idempotency key")
    func sendMessageIdempotencyKey() {
        let endpoint = APIEndpoint.sendMessage(
            conversationID: "c1",
            content: MessageContent(text: "hi"),
            idempotencyKey: "unique-key-123"
        )
        #expect(endpoint.idempotencyKey == "unique-key-123")
    }

    @Test("deployPage has idempotency key")
    func deployPageIdempotencyKey() {
        let endpoint = APIEndpoint.deployPage(id: "p1", idempotencyKey: "deploy-key")
        #expect(endpoint.idempotencyKey == "deploy-key")
    }

    @Test("forkPage has idempotency key")
    func forkPageIdempotencyKey() {
        let endpoint = APIEndpoint.forkPage(id: "p1", idempotencyKey: "fork-key")
        #expect(endpoint.idempotencyKey == "fork-key")
    }

    @Test("forkFeedItem has idempotency key")
    func forkFeedItemIdempotencyKey() {
        let endpoint = APIEndpoint.forkFeedItem(id: "f1", idempotencyKey: "feed-fork-key")
        #expect(endpoint.idempotencyKey == "feed-fork-key")
    }

    @Test("runCrew has idempotency key")
    func runCrewIdempotencyKey() {
        let endpoint = APIEndpoint.runCrew(id: "cr1", input: "go", idempotencyKey: "crew-run-key")
        #expect(endpoint.idempotencyKey == "crew-run-key")
    }

    @Test("GET endpoints have no idempotency key")
    func getEndpointsNoIdempotencyKey() {
        let endpoints: [APIEndpoint] = [.me, .listAgents, .feed(cursor: nil, limit: nil)]
        for endpoint in endpoints {
            #expect(endpoint.idempotencyKey == nil)
        }
    }

    // MARK: - Query Parameters

    @Test("listConversations encodes cursor and limit as query items")
    func listConversationsQueryItems() {
        let endpoint = APIEndpoint.listConversations(cursor: "abc", limit: 25)
        let items = endpoint.queryItems
        #expect(items != nil)
        #expect(items?.count == 2)
        #expect(items?.contains(where: { $0.name == "cursor" && $0.value == "abc" }) == true)
        #expect(items?.contains(where: { $0.name == "limit" && $0.value == "25" }) == true)
    }

    @Test("listConversations with nil cursor and limit returns nil query items")
    func listConversationsNilQueryItems() {
        let endpoint = APIEndpoint.listConversations(cursor: nil, limit: nil)
        #expect(endpoint.queryItems == nil)
    }

    @Test("listMessages encodes cursor and limit as query items")
    func listMessagesQueryItems() {
        let endpoint = APIEndpoint.listMessages(conversationID: "c1", cursor: "xyz", limit: 50)
        let items = endpoint.queryItems
        #expect(items != nil)
        #expect(items?.contains(where: { $0.name == "cursor" && $0.value == "xyz" }) == true)
        #expect(items?.contains(where: { $0.name == "limit" && $0.value == "50" }) == true)
    }

    @Test("searchMarketplace encodes query parameter")
    func searchMarketplaceQueryParam() {
        let endpoint = APIEndpoint.searchMarketplace(query: "coding assistant")
        let items = endpoint.queryItems
        #expect(items?.count == 1)
        #expect(items?.first?.name == "q")
        #expect(items?.first?.value == "coding assistant")
    }

    @Test("feed endpoints encode cursor and limit")
    func feedQueryItems() {
        let feedEndpoints: [APIEndpoint] = [
            .feed(cursor: "c1", limit: 20),
            .trending(cursor: "c2", limit: 10),
            .followingFeed(cursor: "c3", limit: 15),
            .newFeedItems(cursor: "c4", limit: 5),
            .marketplace(cursor: "c5", limit: 30),
            .listCrews(cursor: "c6", limit: 25),
        ]
        for endpoint in feedEndpoints {
            let items = endpoint.queryItems
            #expect(items != nil, "\(endpoint) should have query items")
            #expect(items?.count == 2)
        }
    }

    @Test("Non-paginated endpoints return nil query items")
    func noPaginationQueryItems() {
        let endpoints: [APIEndpoint] = [
            .me,
            .listAgents,
            .marketplaceCategories,
            .login(email: "e", password: "p"),
        ]
        for endpoint in endpoints {
            #expect(endpoint.queryItems == nil)
        }
    }

    // MARK: - HTTP Body Serialization

    @Test("login body contains email and password")
    func loginBody() throws {
        let endpoint = APIEndpoint.login(email: "test@example.com", password: "secret")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder().decode([String: String].self, from: body)
        #expect(dict["email"] == "test@example.com")
        #expect(dict["password"] == "secret")
    }

    @Test("register body contains username, email, and password")
    func registerBody() throws {
        let endpoint = APIEndpoint.register(username: "alice", email: "a@b.com", password: "pass")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder().decode([String: String].self, from: body)
        #expect(dict["username"] == "alice")
        #expect(dict["email"] == "a@b.com")
        #expect(dict["password"] == "pass")
    }

    @Test("refresh body contains refresh_token")
    func refreshBody() throws {
        let endpoint = APIEndpoint.refresh(refreshToken: "my-refresh-token")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder.waiagents.decode([String: String].self, from: body)
        #expect(dict["refresh_token"] == "my-refresh-token")
    }

    @Test("createConversation body includes type and optional fields")
    func createConversationBody() throws {
        let endpoint = APIEndpoint.createConversation(type: "agent", title: "Chat", agentID: "a1")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder.waiagents.decode([String: String].self, from: body)
        #expect(dict["type"] == "agent")
        #expect(dict["title"] == "Chat")
        #expect(dict["agent_id"] == "a1")
    }

    @Test("createConversation body omits nil fields")
    func createConversationBodyNilFields() throws {
        let endpoint = APIEndpoint.createConversation(type: "dm", title: nil, agentID: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder.waiagents.decode([String: String].self, from: body)
        #expect(dict["type"] == "dm")
        #expect(dict["title"] == nil)
        #expect(dict["agent_id"] == nil)
    }

    @Test("GET endpoints have no httpBody")
    func getEndpointsNoBody() throws {
        let endpoints: [APIEndpoint] = [
            .me,
            .listAgents,
            .listConversations(cursor: nil, limit: nil),
        ]
        for endpoint in endpoints {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.httpBody == nil)
        }
    }

    @Test("createAgent body includes name and system_prompt")
    func createAgentBody() throws {
        let endpoint = APIEndpoint.createAgent(name: "Helper", systemPrompt: "Be helpful", model: "gpt-4")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder.waiagents.decode([String: String].self, from: body)
        #expect(dict["name"] == "Helper")
        #expect(dict["system_prompt"] == "Be helpful")
        #expect(dict["model"] == "gpt-4")
    }

    @Test("URLRequest has Content-Type header set to application/json")
    func contentTypeHeader() throws {
        let request = try APIEndpoint.me.urlRequest(baseURL: baseURL)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    }

    @Test("sendMessage body serializes content as array of ContentBlocks")
    func sendMessageBody() throws {
        let content = MessageContent(text: "Hello world")
        let endpoint = APIEndpoint.sendMessage(conversationID: "c1", content: content, idempotencyKey: "k")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        // Parse to verify structure: { "content": [{"type": "text", "text": "Hello world", ...}] }
        let parsed = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        let blocks = try #require(parsed?["content"] as? [[String: Any]])
        #expect(blocks.count == 1)
        #expect(blocks[0]["type"] as? String == "text")
        #expect(blocks[0]["text"] as? String == "Hello world")
    }

    @Test("requestMagicLink body contains email")
    func requestMagicLinkBody() throws {
        let endpoint = APIEndpoint.requestMagicLink(email: "user@test.com")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder().decode([String: String].self, from: body)
        #expect(dict["email"] == "user@test.com")
    }

    @Test("verifyMagicLink body contains token")
    func verifyMagicLinkBody() throws {
        let endpoint = APIEndpoint.verifyMagicLink(token: "magic-token-123")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONDecoder().decode([String: String].self, from: body)
        #expect(dict["token"] == "magic-token-123")
    }
}
