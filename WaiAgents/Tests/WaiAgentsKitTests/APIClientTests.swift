import Foundation
import Testing
@testable import WaiAgentsKit

@Suite("APIClient")
struct APIClientTests {
    let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - URLRequest Construction from APIEndpoint

    @Test("urlRequest builds full URL with /api/v1 prefix")
    func urlRequestFullURL() throws {
        let endpoint = APIEndpoint.me
        let request = try endpoint.urlRequest(baseURL: baseURL)
        #expect(request.url?.absoluteString.contains("/api/v1/users/me") == true)
        #expect(request.url?.host == "openraccoon.com")
        #expect(request.url?.scheme == "https")
    }

    @Test("urlRequest includes query parameters in URL")
    func urlRequestWithQueryParams() throws {
        let endpoint = APIEndpoint.listConversations(cursor: "abc123", limit: 10)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let urlString = try #require(request.url?.absoluteString)
        #expect(urlString.contains("cursor=abc123"))
        #expect(urlString.contains("limit=10"))
    }

    @Test("urlRequest sets httpMethod correctly")
    func urlRequestHTTPMethod() throws {
        let postRequest = try APIEndpoint.login(email: "e", password: "p").urlRequest(baseURL: baseURL)
        #expect(postRequest.httpMethod == "POST")

        let getRequest = try APIEndpoint.me.urlRequest(baseURL: baseURL)
        #expect(getRequest.httpMethod == "GET")

        let patchRequest = try APIEndpoint.updateMe(displayName: "A", bio: nil, avatarURL: nil).urlRequest(baseURL: baseURL)
        #expect(patchRequest.httpMethod == "PATCH")

        let deleteRequest = try APIEndpoint.deleteConversation(id: "c1").urlRequest(baseURL: baseURL)
        #expect(deleteRequest.httpMethod == "DELETE")
    }

    @Test("urlRequest sets Content-Type header to application/json")
    func urlRequestContentType() throws {
        let request = try APIEndpoint.login(email: "e", password: "p").urlRequest(baseURL: baseURL)
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    }

    // MARK: - Auth Token Injection

    @Test("requiresAuth is false for auth endpoints")
    func authEndpointsDoNotRequireAuth() {
        #expect(!APIEndpoint.login(email: "e", password: "p").requiresAuth)
        #expect(!APIEndpoint.register(username: "u", email: "e", password: "p").requiresAuth)
        #expect(!APIEndpoint.refresh(refreshToken: "rt").requiresAuth)
        #expect(!APIEndpoint.requestMagicLink(email: "e").requiresAuth)
        #expect(!APIEndpoint.verifyMagicLink(token: "t").requiresAuth)
    }

    @Test("requiresAuth is true for protected endpoints")
    func protectedEndpointsRequireAuth() {
        #expect(APIEndpoint.me.requiresAuth)
        #expect(APIEndpoint.listConversations(cursor: nil, limit: nil).requiresAuth)
        #expect(APIEndpoint.listAgents.requiresAuth)
        #expect(APIEndpoint.feed(cursor: nil, limit: nil).requiresAuth)
        #expect(APIEndpoint.deleteAgent(id: "a").requiresAuth)
    }

    // MARK: - Idempotency Key Injection

    @Test("Idempotency key is set for sendMessage endpoint")
    func idempotencyKeyOnSendMessage() {
        let endpoint = APIEndpoint.sendMessage(
            conversationID: "c1",
            content: MessageContent(text: "test"),
            idempotencyKey: "idem-key-42"
        )
        #expect(endpoint.idempotencyKey == "idem-key-42")
    }

    @Test("Idempotency key is nil for endpoints that do not support it")
    func noIdempotencyKeyForNonSupportedEndpoints() {
        #expect(APIEndpoint.me.idempotencyKey == nil)
        #expect(APIEndpoint.login(email: "e", password: "p").idempotencyKey == nil)
        #expect(APIEndpoint.createAgent(name: "B", systemPrompt: "s", model: nil).idempotencyKey == nil)
    }

    // MARK: - Error Response Parsing

    @Test("APIErrorResponse decodes from JSON")
    func apiErrorResponseDecode() throws {
        let json = """
        {
            "error": "validation_error",
            "message": "Invalid email format"
        }
        """.data(using: .utf8)!

        let errorResponse = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        #expect(errorResponse.error == "validation_error")
        #expect(errorResponse.message == "Invalid email format")
        #expect(errorResponse.displayMessage == "Invalid email format")
    }

    @Test("APIErrorResponse decodes with validation details")
    func apiErrorResponseWithValidationDetails() throws {
        let json = """
        {
            "error": "validation_error",
            "details": {
                "field_errors": {
                    "email": ["Email is required"],
                    "password": ["Password too short"]
                }
            }
        }
        """.data(using: .utf8)!

        let errorResponse = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        #expect(errorResponse.error == "validation_error")
        #expect(errorResponse.message == nil)
        // displayMessage should flatten field errors
        let displayMsg = try #require(errorResponse.displayMessage)
        #expect(displayMsg.contains("Email is required"))
        #expect(displayMsg.contains("Password too short"))
    }

    @Test("APIErrorResponse displayMessage returns nil when no message or field errors")
    func apiErrorResponseNoDisplayMessage() throws {
        let json = """
        {
            "error": "internal_error"
        }
        """.data(using: .utf8)!

        let errorResponse = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        #expect(errorResponse.displayMessage == nil)
    }

    // MARK: - HTTP Method Mapping

    @Test("All HTTP methods are correctly assigned")
    func httpMethodMapping() {
        // POST
        #expect(APIEndpoint.register(username: "u", email: "e", password: "p").method == "POST")
        #expect(APIEndpoint.login(email: "e", password: "p").method == "POST")
        #expect(APIEndpoint.refresh(refreshToken: "rt").method == "POST")
        #expect(APIEndpoint.createConversation(type: "dm", title: nil, agentID: nil).method == "POST")

        // PATCH
        #expect(APIEndpoint.updateMe(displayName: nil, bio: nil, avatarURL: nil).method == "PATCH")
        #expect(APIEndpoint.updateConversation(id: "c", title: nil).method == "PATCH")
        #expect(APIEndpoint.updateAgent(id: "a", params: [:]).method == "PATCH")

        // DELETE
        #expect(APIEndpoint.logout(refreshToken: "rt").method == "DELETE")
        #expect(APIEndpoint.deleteConversation(id: "c").method == "DELETE")
        #expect(APIEndpoint.deleteAgent(id: "a").method == "DELETE")
        #expect(APIEndpoint.removeMember(conversationID: "c", userID: "u").method == "DELETE")

        // GET (default)
        #expect(APIEndpoint.me.method == "GET")
        #expect(APIEndpoint.listAgents.method == "GET")
        #expect(APIEndpoint.getConversation(id: "c").method == "GET")
    }

    // MARK: - Headers Verification

    @Test("urlRequest always includes Content-Type header")
    func alwaysHasContentType() throws {
        let endpoints: [APIEndpoint] = [
            .me,
            .login(email: "e", password: "p"),
            .deleteConversation(id: "c"),
            .updateMe(displayName: "A", bio: nil, avatarURL: nil),
        ]
        for endpoint in endpoints {
            let request = try endpoint.urlRequest(baseURL: baseURL)
            #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        }
    }
}
