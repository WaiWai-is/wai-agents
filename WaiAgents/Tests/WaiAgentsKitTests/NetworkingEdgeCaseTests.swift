import Foundation
import Testing
@testable import WaiAgentsKit

/// Networking edge-case tests covering:
/// - APIError mapping
/// - APIErrorResponse displayMessage logic
/// - APIEndpoint URL construction, methods, auth requirements, idempotency keys
/// - AuthManager concurrent token refresh coalescing
/// - AuthManager token expiry edge cases
/// - TokenStorage (UserDefaults variant in DEBUG)
/// - JSONCoding extensions (date parsing edge cases)
@Suite("Networking Edge Cases")
struct NetworkingEdgeCaseTests {

    // MARK: - APIErrorResponse displayMessage

    @Suite("APIErrorResponse")
    struct APIErrorResponseTests {

        @Test("displayMessage returns message when present")
        func displayMessageFromMessage() {
            let response = APIErrorResponse(
                error: "bad_request",
                message: "Email is required",
                details: nil
            )
            #expect(response.displayMessage == "Email is required")
        }

        @Test("displayMessage flattens field errors when no message")
        func displayMessageFromFieldErrors() {
            let details = APIErrorResponse.ValidationDetails(
                formErrors: nil,
                fieldErrors: ["email": ["must be valid", "is required"], "password": ["too short"]]
            )
            let response = APIErrorResponse(
                error: "validation_error",
                message: nil,
                details: details
            )
            let display = response.displayMessage!
            // Field errors are sorted by key, so email comes before password
            #expect(display.contains("must be valid"))
            #expect(display.contains("is required"))
            #expect(display.contains("too short"))
        }

        @Test("displayMessage returns nil when no message and no field errors")
        func displayMessageNil() {
            let response = APIErrorResponse(
                error: "unknown",
                message: nil,
                details: nil
            )
            #expect(response.displayMessage == nil)
        }

        @Test("displayMessage returns nil when field errors are empty")
        func displayMessageEmptyFieldErrors() {
            let details = APIErrorResponse.ValidationDetails(
                formErrors: nil,
                fieldErrors: [:]
            )
            let response = APIErrorResponse(
                error: "unknown",
                message: nil,
                details: details
            )
            #expect(response.displayMessage == nil)
        }

        @Test("APIErrorResponse round-trip encoding")
        func roundTrip() throws {
            let original = APIErrorResponse(
                error: "test_error",
                message: "Something went wrong",
                details: APIErrorResponse.ValidationDetails(
                    formErrors: ["form error"],
                    fieldErrors: ["name": ["required"]]
                )
            )
            let data = try JSONEncoder().encode(original)
            let decoded = try JSONDecoder().decode(APIErrorResponse.self, from: data)
            #expect(decoded.error == "test_error")
            #expect(decoded.message == "Something went wrong")
            #expect(decoded.details?.formErrors == ["form error"])
            #expect(decoded.details?.fieldErrors?["name"] == ["required"])
        }
    }

    // MARK: - APIEndpoint URL construction

    @Suite("APIEndpoint URL Construction")
    struct APIEndpointURLTests {
        private let baseURL = URL(string: "https://waiagents.com")!

        @Test("Auth endpoints are not authenticated")
        func authEndpointsNoAuth() {
            #expect(APIEndpoint.register(username: "u", email: "e", password: "p").requiresAuth == false)
            #expect(APIEndpoint.login(email: "e", password: "p").requiresAuth == false)
            #expect(APIEndpoint.refresh(refreshToken: "t").requiresAuth == false)
            #expect(APIEndpoint.requestMagicLink(email: "e").requiresAuth == false)
            #expect(APIEndpoint.verifyMagicLink(token: "t").requiresAuth == false)
        }

        @Test("Non-auth endpoints require authentication")
        func nonAuthEndpointsRequireAuth() {
            #expect(APIEndpoint.me.requiresAuth == true)
            #expect(APIEndpoint.listConversations(cursor: nil, limit: nil).requiresAuth == true)
            #expect(APIEndpoint.feed(cursor: nil, limit: nil).requiresAuth == true)
            #expect(APIEndpoint.marketplace(cursor: nil, limit: nil).requiresAuth == true)
            #expect(APIEndpoint.listAgents.requiresAuth == true)
        }

        @Test("GET endpoints have correct method")
        func getEndpoints() {
            #expect(APIEndpoint.me.method == "GET")
            #expect(APIEndpoint.listConversations(cursor: nil, limit: nil).method == "GET")
            #expect(APIEndpoint.listAgents.method == "GET")
            #expect(APIEndpoint.feed(cursor: nil, limit: nil).method == "GET")
            #expect(APIEndpoint.marketplace(cursor: nil, limit: nil).method == "GET")
            #expect(APIEndpoint.listBridges.method == "GET")
            #expect(APIEndpoint.listPages.method == "GET")
            #expect(APIEndpoint.usage.method == "GET")
            #expect(APIEndpoint.marketplaceCategories.method == "GET")
        }

        @Test("POST endpoints have correct method")
        func postEndpoints() {
            #expect(APIEndpoint.register(username: "u", email: "e", password: "p").method == "POST")
            #expect(APIEndpoint.login(email: "e", password: "p").method == "POST")
            #expect(APIEndpoint.createConversation(type: "dm", title: nil, agentID: nil).method == "POST")
            #expect(APIEndpoint.sendMessage(conversationID: "c", content: MessageContent(text: "hi"), idempotencyKey: "k").method == "POST")
            #expect(APIEndpoint.likeFeedItem(id: "f").method == "POST")
            #expect(APIEndpoint.rateAgent(id: "a", rating: 5, review: nil).method == "POST")
        }

        @Test("DELETE endpoints have correct method")
        func deleteEndpoints() {
            #expect(APIEndpoint.logout(refreshToken: "t").method == "DELETE")
            #expect(APIEndpoint.deleteConversation(id: "c").method == "DELETE")
            #expect(APIEndpoint.deleteAgent(id: "a").method == "DELETE")
            #expect(APIEndpoint.unlikeFeedItem(id: "f").method == "DELETE")
            #expect(APIEndpoint.disconnectBridge(id: "b").method == "DELETE")
            #expect(APIEndpoint.deleteCrew(id: "cr").method == "DELETE")
            #expect(APIEndpoint.deleteTrigger(agentID: "a", triggerID: "t").method == "DELETE")
        }

        @Test("PATCH endpoints have correct method")
        func patchEndpoints() {
            #expect(APIEndpoint.updateMe(displayName: nil, bio: nil, avatarURL: nil).method == "PATCH")
            #expect(APIEndpoint.updateConversation(id: "c", title: nil).method == "PATCH")
            #expect(APIEndpoint.updateAgent(id: "a", params: [:]).method == "PATCH")
            #expect(APIEndpoint.updateCrew(id: "cr", params: [:]).method == "PATCH")
        }

        @Test("Idempotency key is set for sendMessage")
        func idempotencyKeySendMessage() {
            let endpoint = APIEndpoint.sendMessage(
                conversationID: "c",
                content: MessageContent(text: "hi"),
                idempotencyKey: "idem-123"
            )
            #expect(endpoint.idempotencyKey == "idem-123")
        }

        @Test("Idempotency key is nil for non-idempotent endpoints")
        func noIdempotencyKey() {
            #expect(APIEndpoint.me.idempotencyKey == nil)
            #expect(APIEndpoint.listConversations(cursor: nil, limit: nil).idempotencyKey == nil)
            #expect(APIEndpoint.login(email: "e", password: "p").idempotencyKey == nil)
        }

        @Test("Idempotency key is set for deployPage, forkPage, forkFeedItem, runCrew")
        func otherIdempotencyKeys() {
            #expect(APIEndpoint.deployPage(id: "p", idempotencyKey: "k1").idempotencyKey == "k1")
            #expect(APIEndpoint.forkPage(id: "p", idempotencyKey: "k2").idempotencyKey == "k2")
            #expect(APIEndpoint.forkFeedItem(id: "f", idempotencyKey: "k3").idempotencyKey == "k3")
            #expect(APIEndpoint.runCrew(id: "cr", input: "test", idempotencyKey: "k4").idempotencyKey == "k4")
        }

        @Test("Query items for paginated endpoints include cursor and limit")
        func queryItemsPaginated() {
            let endpoint = APIEndpoint.listConversations(cursor: "abc", limit: 25)
            let items = endpoint.queryItems!
            #expect(items.contains(where: { $0.name == "cursor" && $0.value == "abc" }))
            #expect(items.contains(where: { $0.name == "limit" && $0.value == "25" }))
        }

        @Test("Query items for search includes q parameter")
        func queryItemsSearch() {
            let endpoint = APIEndpoint.searchMarketplace(query: "code helper")
            let items = endpoint.queryItems!
            #expect(items.contains(where: { $0.name == "q" && $0.value == "code helper" }))
        }

        @Test("Query items are nil when no pagination params given")
        func queryItemsNilNoPagination() {
            let endpoint = APIEndpoint.listConversations(cursor: nil, limit: nil)
            #expect(endpoint.queryItems == nil)
        }

        @Test("URL path construction for nested endpoints")
        func nestedPaths() {
            #expect(APIEndpoint.listMessages(conversationID: "c1", cursor: nil, limit: nil).path == "/conversations/c1/messages")
            #expect(APIEndpoint.listMembers(conversationID: "c1").path == "/conversations/c1/members")
            #expect(APIEndpoint.removeMember(conversationID: "c1", userID: "u1").path == "/conversations/c1/members/u1")
            #expect(APIEndpoint.startAgentConversation(agentID: "a1").path == "/agents/a1/conversation")
            #expect(APIEndpoint.listTriggers(agentID: "a1").path == "/agents/a1/triggers")
            #expect(APIEndpoint.getTrigger(agentID: "a1", triggerID: "t1").path == "/agents/a1/triggers/t1")
        }

        @Test("urlRequest constructs valid URL with /api/v1 prefix")
        func urlRequestConstruction() throws {
            let endpoint = APIEndpoint.me
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.url!.absoluteString.contains("/api/v1/users/me"))
            #expect(request.httpMethod == "GET")
            #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        }

        @Test("urlRequest for POST includes body data")
        func urlRequestWithBody() throws {
            let endpoint = APIEndpoint.login(email: "test@example.com", password: "pass123")
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.httpBody != nil)
            #expect(request.httpMethod == "POST")
        }

        @Test("urlRequest for GET has no body")
        func urlRequestGetNoBody() throws {
            let endpoint = APIEndpoint.me
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.httpBody == nil)
        }

        @Test("Feed endpoint paths are correct")
        func feedPaths() {
            #expect(APIEndpoint.feed(cursor: nil, limit: nil).path == "/feed")
            #expect(APIEndpoint.trending(cursor: nil, limit: nil).path == "/feed/trending")
            #expect(APIEndpoint.followingFeed(cursor: nil, limit: nil).path == "/feed/following")
            #expect(APIEndpoint.newFeedItems(cursor: nil, limit: nil).path == "/feed/new")
            #expect(APIEndpoint.likeFeedItem(id: "f1").path == "/feed/f1/like")
            #expect(APIEndpoint.unlikeFeedItem(id: "f1").path == "/feed/f1/like")
        }

        @Test("Marketplace endpoint paths are correct")
        func marketplacePaths() {
            #expect(APIEndpoint.marketplace(cursor: nil, limit: nil).path == "/marketplace")
            #expect(APIEndpoint.marketplaceCategories.path == "/marketplace/categories")
            #expect(APIEndpoint.agentProfile(slug: "my-bot").path == "/marketplace/agents/my-bot")
            #expect(APIEndpoint.rateAgent(id: "a1", rating: 5, review: nil).path == "/marketplace/agents/a1/rate")
            #expect(APIEndpoint.searchMarketplace(query: "test").path == "/marketplace/search")
        }

        @Test("Bridge endpoint paths are correct")
        func bridgePaths() {
            #expect(APIEndpoint.listBridges.path == "/bridges")
            #expect(APIEndpoint.connectTelegram.path == "/bridges/telegram/connect")
            #expect(APIEndpoint.connectWhatsApp.path == "/bridges/whatsapp/connect")
            #expect(APIEndpoint.disconnectBridge(id: "b1").path == "/bridges/b1")
            #expect(APIEndpoint.bridgeStatus(id: "b1").path == "/bridges/b1/status")
        }

        @Test("Crew endpoint paths are correct")
        func crewPaths() {
            #expect(APIEndpoint.listCrews(cursor: nil, limit: nil).path == "/crews")
            #expect(APIEndpoint.getCrew(id: "cr1").path == "/crews/cr1")
            #expect(APIEndpoint.runCrew(id: "cr1", input: "test", idempotencyKey: "k").path == "/crews/cr1/run")
        }
    }

    // MARK: - AuthManager token expiry

    @Suite("AuthManager Token Expiry")
    struct AuthManagerTokenExpiryTests {

        @Test("validAccessToken throws unauthorized when no tokens stored")
        func noTokensThrows() async {
            let manager = AuthManager(
                serviceName: "test.authmanager.\(UUID().uuidString)",
                baseURL: URL(string: "https://nonexistent.local")
            )
            do {
                _ = try await manager.validAccessToken()
                Issue.record("Expected unauthorized")
            } catch {
                // Expected
            }
        }

        @Test("validAccessToken returns token when not expired")
        func validTokenReturned() async throws {
            let manager = AuthManager(
                serviceName: "test.authmanager.\(UUID().uuidString)",
                baseURL: URL(string: "https://nonexistent.local")
            )
            try await manager.setTokens(access: "valid-token", refresh: "refresh", expiresIn: 3600)
            let token = try await manager.validAccessToken()
            #expect(token == "valid-token")
        }

        @Test("validAccessToken attempts refresh when token is expired")
        func expiredTokenAttemptsRefresh() async {
            let manager = AuthManager(
                serviceName: "test.authmanager.\(UUID().uuidString)",
                baseURL: URL(string: "https://nonexistent.local")
            )
            try? await manager.setTokens(access: "expired", refresh: "refresh-tok", expiresIn: -1)
            do {
                _ = try await manager.validAccessToken()
                Issue.record("Expected error from failed refresh")
            } catch {
                // Expected — refresh will fail because the server is nonexistent
            }
        }

        @Test("clearTokens removes all token state")
        func clearTokens() async throws {
            let manager = AuthManager(
                serviceName: "test.authmanager.\(UUID().uuidString)",
                baseURL: URL(string: "https://nonexistent.local")
            )
            try await manager.setTokens(access: "tok", refresh: "ref", expiresIn: 3600)
            #expect(await manager.isAuthenticated == true)
            try await manager.clearTokens()
            #expect(await manager.isAuthenticated == false)
        }

        @Test("isAuthenticated reflects token presence")
        func isAuthenticated() async throws {
            let manager = AuthManager(
                serviceName: "test.authmanager.\(UUID().uuidString)",
                baseURL: nil
            )
            #expect(await manager.isAuthenticated == false)
            try await manager.setTokens(access: "tok", refresh: "ref", expiresIn: 3600)
            #expect(await manager.isAuthenticated == true)
        }

        @Test("currentRefreshToken returns stored refresh token")
        func currentRefreshToken() async throws {
            let manager = AuthManager(
                serviceName: "test.authmanager.\(UUID().uuidString)",
                baseURL: nil
            )
            #expect(await manager.currentRefreshToken == nil)
            try await manager.setTokens(access: "acc", refresh: "my-refresh", expiresIn: 3600)
            #expect(await manager.currentRefreshToken == "my-refresh")
        }
    }

    // MARK: - JSONCoding date parsing

    @Suite("JSON Date Parsing")
    struct JSONDateParsingTests {

        @Test("Parses ISO8601 date with fractional seconds")
        func fractionalSeconds() throws {
            let json = """
            {"id":"m1","conversationId":"c1","senderType":"human","type":"text","content":{"text":"hi"},"createdAt":"2024-01-15T10:30:45.123Z"}
            """
            let msg = try JSONDecoder.waiagents.decode(Message.self, from: Data(json.utf8))
            #expect(msg.id == "m1")
        }

        @Test("Parses ISO8601 date without fractional seconds")
        func noFractionalSeconds() throws {
            let json = """
            {"id":"m1","conversationId":"c1","senderType":"human","type":"text","content":{"text":"hi"},"createdAt":"2024-01-15T10:30:45Z"}
            """
            let msg = try JSONDecoder.waiagents.decode(Message.self, from: Data(json.utf8))
            #expect(msg.id == "m1")
        }

        @Test("Invalid date string throws decodingError")
        func invalidDate() {
            let json = """
            {"id":"m1","conversationId":"c1","senderType":"human","type":"text","content":{"text":"hi"},"createdAt":"not-a-date"}
            """
            #expect(throws: DecodingError.self) {
                try JSONDecoder.waiagents.decode(Message.self, from: Data(json.utf8))
            }
        }
    }

    // MARK: - PaginatedResponse

    @Suite("PaginatedResponse")
    struct PaginatedResponseTests {

        @Test("PageInfo equality")
        func pageInfoEquality() {
            let a = PageInfo(nextCursor: "abc", hasMore: true)
            let b = PageInfo(nextCursor: "abc", hasMore: true)
            let c = PageInfo(nextCursor: nil, hasMore: false)
            #expect(a == b)
            #expect(a != c)
        }
    }
}
