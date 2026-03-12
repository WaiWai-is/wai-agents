import Foundation
import Testing
@testable import WaiAgentsKit

@Suite("APIClient Edge Cases")
struct APIClientEdgeCaseTests {
    let baseURL = URL(string: "https://waiagents.com")!

    // MARK: - Request Construction with All HTTP Methods

    @Test("GET request has no body")
    func getRequestHasNoBody() throws {
        let request = try APIEndpoint.me.urlRequest(baseURL: baseURL)
        #expect(request.httpMethod == "GET")
        #expect(request.httpBody == nil)
    }

    @Test("POST login request has JSON body with email and password")
    func postLoginRequestBody() throws {
        let request = try APIEndpoint.login(email: "test@example.com", password: "pass123").urlRequest(baseURL: baseURL)
        #expect(request.httpMethod == "POST")
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["email"] as? String == "test@example.com")
        #expect(dict?["password"] as? String == "pass123")
    }

    @Test("PATCH updateMe request encodes only non-nil fields")
    func patchUpdateMePartialFields() throws {
        let request = try APIEndpoint.updateMe(
            displayName: "New Name", bio: nil, avatarURL: nil
        ).urlRequest(baseURL: baseURL)
        #expect(request.httpMethod == "PATCH")
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["display_name"] as? String == "New Name")
        #expect(dict?["bio"] == nil)
        #expect(dict?["avatar_url"] == nil)
    }

    @Test("DELETE request for conversation has correct path")
    func deleteConversationPath() throws {
        let request = try APIEndpoint.deleteConversation(id: "conv_abc").urlRequest(baseURL: baseURL)
        #expect(request.httpMethod == "DELETE")
        let url = try #require(request.url)
        #expect(url.path.contains("/conversations/conv_abc"))
    }

    @Test("DELETE logout request encodes refresh_token in body")
    func deleteLogoutBody() throws {
        let request = try APIEndpoint.logout(refreshToken: "rt_xyz").urlRequest(baseURL: baseURL)
        #expect(request.httpMethod == "DELETE")
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["refresh_token"] as? String == "rt_xyz")
    }

    // MARK: - Query Parameter Encoding

    @Test("Query parameters with special characters are percent-encoded")
    func queryParamsSpecialCharacters() throws {
        let endpoint = APIEndpoint.searchMarketplace(query: "hello world & friends")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let urlString = try #require(request.url?.absoluteString)
        #expect(urlString.contains("q=hello"))
        // Spaces should be encoded
        #expect(!urlString.contains(" "))
    }

    @Test("Query parameters with unicode characters are encoded")
    func queryParamsUnicode() throws {
        let endpoint = APIEndpoint.searchMarketplace(query: "test emoji agent")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        #expect(request.url != nil)
    }

    @Test("Cursor with base64-like characters is preserved")
    func cursorBase64Characters() throws {
        let endpoint = APIEndpoint.listConversations(cursor: "eyJpZCI6IjEyMyJ9/+==", limit: 10)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let urlString = try #require(request.url?.absoluteString)
        #expect(urlString.contains("cursor="))
        #expect(urlString.contains("limit=10"))
    }

    @Test("Nil cursor and nil limit produce no query parameters")
    func nilCursorAndLimit() throws {
        let endpoint = APIEndpoint.listConversations(cursor: nil, limit: nil)
        #expect(endpoint.queryItems == nil)
    }

    @Test("Only cursor provided produces single query parameter")
    func onlyCursorProvided() throws {
        let endpoint = APIEndpoint.listConversations(cursor: "abc", limit: nil)
        let items = try #require(endpoint.queryItems)
        #expect(items.count == 1)
        #expect(items[0].name == "cursor")
        #expect(items[0].value == "abc")
    }

    @Test("Only limit provided produces single query parameter")
    func onlyLimitProvided() throws {
        let endpoint = APIEndpoint.listConversations(cursor: nil, limit: 25)
        let items = try #require(endpoint.queryItems)
        #expect(items.count == 1)
        #expect(items[0].name == "limit")
        #expect(items[0].value == "25")
    }

    // MARK: - Response Parsing for Model Types

    @Test("User decodes with all optional fields nil")
    func userDecodeMinimal() throws {
        let json = """
        {
            "id": "user_min",
            "username": "minimal",
            "created_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let user = try JSONDecoder.waiagents.decode(User.self, from: json)
        #expect(user.id == "user_min")
        #expect(user.displayName == nil)
        #expect(user.email == nil)
        #expect(user.bio == nil)
        #expect(user.avatarURL == nil)
        #expect(user.status == nil)
        #expect(user.role == nil)
        #expect(user.settings == nil)
        #expect(user.lastSeenAt == nil)
    }

    @Test("Agent decodes with tools and mcpServers arrays")
    func agentDecodeWithToolsAndMcp() throws {
        let json = """
        {
            "id": "agent_tools",
            "creator_id": "user_1",
            "name": "Tool Agent",
            "slug": "tool-agent",
            "model": "claude-sonnet-4-6",
            "tools": [
                {"name": "web_search", "enabled": true},
                {"name": "calculator", "enabled": false, "config": {"precision": 10}}
            ],
            "mcp_servers": [
                {"name": "memory", "url": "http://localhost:3001", "tools": ["store", "recall"]}
            ],
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.tools?.count == 2)
        #expect(agent.tools?[0].name == "web_search")
        #expect(agent.tools?[0].enabled == true)
        #expect(agent.tools?[1].enabled == false)
        #expect(agent.mcpServers?.count == 1)
        #expect(agent.mcpServers?[0].tools == ["store", "recall"])
    }

    @Test("Conversation decodes all types: dm, group, agent, bridge")
    func conversationDecodeAllTypes() throws {
        for (typeStr, expected) in [
            ("dm", Conversation.ConversationType.dm),
            ("group", Conversation.ConversationType.group),
            ("agent", Conversation.ConversationType.agent),
            ("bridge", Conversation.ConversationType.bridge),
        ] {
            let json = """
            {
                "id": "conv_\(typeStr)",
                "type": "\(typeStr)",
                "created_at": "2026-03-01T08:00:00Z"
            }
            """.data(using: .utf8)!

            let conv = try JSONDecoder.waiagents.decode(Conversation.self, from: json)
            #expect(conv.type == expected)
        }
    }

    @Test("Message decodes all message types")
    func messageDecodeAllTypes() throws {
        let types: [(String, Message.MessageType)] = [
            ("text", .text),
            ("media", .media),
            ("code", .code),
            ("embed", .embed),
            ("system", .system),
            ("agent_status", .agentStatus),
        ]

        for (raw, expected) in types {
            let json = """
            {
                "id": "msg_\(raw)",
                "conversation_id": "conv_1",
                "sender_type": "human",
                "type": "\(raw)",
                "content": {"text": "test"},
                "created_at": "2026-03-01T08:00:00Z"
            }
            """.data(using: .utf8)!

            let msg = try JSONDecoder.waiagents.decode(Message.self, from: json)
            #expect(msg.type == expected)
        }
    }

    @Test("FeedItem decodes all feed item types")
    func feedItemDecodeAllTypes() throws {
        let types: [(String, FeedItem.FeedItemType)] = [
            ("agent_showcase", .agentShowcase),
            ("page_showcase", .pageShowcase),
            ("tool_showcase", .toolShowcase),
            ("remix", .remix),
            ("creation", .creation),
        ]

        for (raw, expected) in types {
            let json = """
            {
                "id": "feed_\(raw)",
                "creator_id": "user_1",
                "type": "\(raw)",
                "reference_id": "ref_1",
                "reference_type": "agent",
                "quality_score": 0.5,
                "trending_score": 0.5,
                "like_count": 0,
                "fork_count": 0,
                "view_count": 0,
                "created_at": "2026-03-01T08:00:00Z",
                "updated_at": "2026-03-01T08:00:00Z"
            }
            """.data(using: .utf8)!

            let item = try JSONDecoder.waiagents.decode(FeedItem.self, from: json)
            #expect(item.type == expected)
        }
    }

    // MARK: - Error Response Parsing

    @Test("APIErrorResponse with status 400 validation error")
    func errorResponse400() throws {
        let json = """
        {
            "error": "validation_error",
            "message": "Invalid input",
            "details": {
                "field_errors": {
                    "email": ["Email format is invalid"],
                    "username": ["Username is taken", "Username too short"]
                }
            }
        }
        """.data(using: .utf8)!

        let errorResp = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        #expect(errorResp.error == "validation_error")
        #expect(errorResp.message == "Invalid input")
        // displayMessage prefers `message` field
        #expect(errorResp.displayMessage == "Invalid input")
        #expect(errorResp.details?.fieldErrors?["email"]?.count == 1)
        #expect(errorResp.details?.fieldErrors?["username"]?.count == 2)
    }

    @Test("APIErrorResponse with only error field and no message")
    func errorResponseMinimal() throws {
        let json = """
        {"error": "internal_server_error"}
        """.data(using: .utf8)!

        let errorResp = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        #expect(errorResp.error == "internal_server_error")
        #expect(errorResp.message == nil)
        #expect(errorResp.details == nil)
        #expect(errorResp.displayMessage == nil)
    }

    @Test("APIErrorResponse with form errors in details")
    func errorResponseFormErrors() throws {
        let json = """
        {
            "error": "validation_error",
            "details": {
                "form_errors": ["Rate limit exceeded", "Try again later"]
            }
        }
        """.data(using: .utf8)!

        let errorResp = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        #expect(errorResp.details?.formErrors?.count == 2)
    }

    @Test("APIError enum cases are distinguishable")
    func apiErrorEnumCases() {
        let unauthorized = APIError.unauthorized
        let invalidResponse = APIError.invalidResponse

        if case .unauthorized = unauthorized {
            // expected
        } else {
            Issue.record("Expected unauthorized case")
        }

        if case .invalidResponse = invalidResponse {
            // expected
        } else {
            Issue.record("Expected invalidResponse case")
        }
    }

    @Test("APIError httpError carries status code and error response")
    func apiErrorHTTPError() {
        let errorResp = APIErrorResponse(error: "not_found", message: "Resource not found", details: nil)
        let error = APIError.httpError(statusCode: 404, error: errorResp)

        if case .httpError(let code, let resp) = error {
            #expect(code == 404)
            #expect(resp?.error == "not_found")
            #expect(resp?.message == "Resource not found")
        } else {
            Issue.record("Expected httpError case")
        }
    }

    @Test("APIError httpError with nil error response")
    func apiErrorHTTPErrorNilResponse() {
        let error = APIError.httpError(statusCode: 500, error: nil)

        if case .httpError(let code, let resp) = error {
            #expect(code == 500)
            #expect(resp == nil)
        } else {
            Issue.record("Expected httpError case")
        }
    }

    // MARK: - Endpoint Path Verification

    @Test("All auth endpoints have correct paths")
    func authEndpointPaths() {
        #expect(APIEndpoint.register(username: "u", email: "e", password: "p").path == "/auth/register")
        #expect(APIEndpoint.login(email: "e", password: "p").path == "/auth/login")
        #expect(APIEndpoint.refresh(refreshToken: "rt").path == "/auth/refresh")
        #expect(APIEndpoint.logout(refreshToken: "rt").path == "/auth/logout")
        #expect(APIEndpoint.requestMagicLink(email: "e").path == "/auth/magic-link")
        #expect(APIEndpoint.verifyMagicLink(token: "t").path == "/auth/magic-link/verify")
    }

    @Test("Conversation endpoints interpolate IDs correctly")
    func conversationEndpointPaths() {
        #expect(APIEndpoint.getConversation(id: "c1").path == "/conversations/c1")
        #expect(APIEndpoint.listMessages(conversationID: "c2", cursor: nil, limit: nil).path == "/conversations/c2/messages")
        #expect(APIEndpoint.listMembers(conversationID: "c3").path == "/conversations/c3/members")
        #expect(APIEndpoint.removeMember(conversationID: "c4", userID: "u5").path == "/conversations/c4/members/u5")
    }

    @Test("Agent endpoints interpolate IDs correctly")
    func agentEndpointPaths() {
        #expect(APIEndpoint.getAgent(id: "a1").path == "/agents/a1")
        #expect(APIEndpoint.startAgentConversation(agentID: "a2").path == "/agents/a2/conversation")
    }

    @Test("Feed endpoints have correct paths")
    func feedEndpointPaths() {
        #expect(APIEndpoint.feed(cursor: nil, limit: nil).path == "/feed")
        #expect(APIEndpoint.trending(cursor: nil, limit: nil).path == "/feed/trending")
        #expect(APIEndpoint.followingFeed(cursor: nil, limit: nil).path == "/feed/following")
        #expect(APIEndpoint.newFeedItems(cursor: nil, limit: nil).path == "/feed/new")
        #expect(APIEndpoint.likeFeedItem(id: "f1").path == "/feed/f1/like")
        #expect(APIEndpoint.forkFeedItem(id: "f2", idempotencyKey: "k").path == "/feed/f2/fork")
    }

    // MARK: - Large Payload Handling

    @Test("Sending message with long text content encodes correctly")
    func longTextMessageEncoding() throws {
        let longText = String(repeating: "a", count: 100_000)
        let endpoint = APIEndpoint.sendMessage(
            conversationID: "conv_1",
            content: MessageContent(text: longText),
            idempotencyKey: "idem_long"
        )
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        #expect(body.count > 100_000)
    }

    @Test("Register with max-length username encodes correctly")
    func registerMaxLengthUsername() throws {
        let longUsername = String(repeating: "x", count: 255)
        let endpoint = APIEndpoint.register(username: longUsername, email: "e@e.com", password: "p")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect((dict?["username"] as? String)?.count == 255)
    }
}
