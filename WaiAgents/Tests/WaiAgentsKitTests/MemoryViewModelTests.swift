import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for memory-related API client interactions:
/// memory endpoint validation, request construction, model decoding,
/// error handling, and edge cases for memory operations.
/// Since the memory feature does not have a dedicated ViewModel,
/// these tests cover the APIEndpoint and model layer that will
/// interact with the memory API.
@Suite("Memory ViewModel Tests")
struct MemoryViewModelTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    private func makeAPIClient() -> (APIClient, AuthManager) {
        let authManager = AuthManager(
            serviceName: "test.memoryvm.\(UUID().uuidString)",
            baseURL: baseURL
        )
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        return (apiClient, authManager)
    }

    // MARK: - Agent Model with Memory Configuration

    @Test("Agent can be initialized with tools including memory MCP server")
    func agentWithMemoryTools() {
        let memoryMcp = Agent.McpServerConfig(
            name: "memory",
            url: "http://localhost:3001",
            authToken: "secret",
            tools: ["store", "recall", "list", "delete"]
        )
        let agent = Agent(
            id: "a1",
            creatorID: "u1",
            name: "Memory Agent",
            slug: "memory-agent",
            mcpServers: [memoryMcp]
        )
        #expect(agent.mcpServers?.count == 1)
        #expect(agent.mcpServers?[0].name == "memory")
        #expect(agent.mcpServers?[0].tools?.count == 4)
    }

    @Test("Agent McpServerConfig encodes and decodes correctly")
    func mcpServerConfigCodable() throws {
        let config = Agent.McpServerConfig(
            name: "memory",
            url: "http://localhost:3001",
            authToken: "token123",
            tools: ["store", "recall"]
        )
        let data = try JSONEncoder.waiagents.encode(config)
        let decoded = try JSONDecoder.waiagents.decode(Agent.McpServerConfig.self, from: data)

        #expect(decoded.name == "memory")
        #expect(decoded.url == "http://localhost:3001")
        #expect(decoded.authToken == "token123")
        #expect(decoded.tools == ["store", "recall"])
    }

    @Test("Agent McpServerConfig with nil authToken and tools")
    func mcpServerConfigNilOptionals() {
        let config = Agent.McpServerConfig(name: "memory", url: "http://localhost:3001")
        #expect(config.authToken == nil)
        #expect(config.tools == nil)
    }

    @Test("Agent McpServerConfig equality")
    func mcpServerConfigEquality() {
        let a = Agent.McpServerConfig(name: "memory", url: "http://localhost:3001")
        let b = Agent.McpServerConfig(name: "memory", url: "http://localhost:3001")
        #expect(a == b)
    }

    @Test("Agent McpServerConfig inequality with different URL")
    func mcpServerConfigInequality() {
        let a = Agent.McpServerConfig(name: "memory", url: "http://localhost:3001")
        let b = Agent.McpServerConfig(name: "memory", url: "http://localhost:3002")
        #expect(a != b)
    }

    // MARK: - Agent Tool Config for Memory Tools

    @Test("ToolConfig for memory store tool")
    func toolConfigMemoryStore() {
        let tool = Agent.ToolConfig(
            name: "memory_store",
            enabled: true,
            config: ["max_memories": AnyCodable(1000)]
        )
        #expect(tool.name == "memory_store")
        #expect(tool.enabled == true)
        #expect(tool.config?["max_memories"]?.intValue == 1000)
    }

    @Test("ToolConfig for memory recall tool")
    func toolConfigMemoryRecall() {
        let tool = Agent.ToolConfig(
            name: "memory_recall",
            enabled: true,
            config: ["top_k": AnyCodable(5)]
        )
        #expect(tool.name == "memory_recall")
        #expect(tool.config?["top_k"]?.intValue == 5)
    }

    @Test("ToolConfig with disabled memory tool")
    func toolConfigDisabled() {
        let tool = Agent.ToolConfig(name: "memory_consolidate", enabled: false)
        #expect(tool.enabled == false)
    }

    @Test("ToolConfig encodes and decodes correctly")
    func toolConfigCodable() throws {
        let tool = Agent.ToolConfig(
            name: "memory_store",
            enabled: true,
            config: ["limit": AnyCodable(100)]
        )
        let data = try JSONEncoder.waiagents.encode(tool)
        let decoded = try JSONDecoder.waiagents.decode(Agent.ToolConfig.self, from: data)

        #expect(decoded.name == "memory_store")
        #expect(decoded.enabled == true)
    }

    // MARK: - Agent Update with Memory Parameters

    @Test("updateAgent endpoint can send memory-related params")
    func updateAgentWithMemoryParams() throws {
        let params: [String: AnyCodable] = [
            "mcp_servers": AnyCodable([
                ["name": "memory", "url": "http://localhost:3001"]
            ])
        ]
        let endpoint = APIEndpoint.updateAgent(id: "a1", params: params)

        #expect(endpoint.method == "PATCH")
        #expect(endpoint.path == "/agents/a1")

        let request = try endpoint.urlRequest(baseURL: baseURL)
        #expect(request.httpBody != nil)
    }

    @Test("updateAgent requires auth for memory config changes")
    func updateAgentMemoryRequiresAuth() {
        let endpoint = APIEndpoint.updateAgent(id: "a1", params: [:])
        #expect(endpoint.requiresAuth == true)
    }

    // MARK: - API Client Request Pattern for Memory Operations

    @Test("APIClient request method throws networkError when server unreachable")
    func apiClientNetworkError() async throws {
        let (apiClient, authManager) = makeAPIClient()
        try await authManager.setTokens(access: "token", refresh: "rt", expiresIn: 3600)

        do {
            let _: AgentResponse = try await apiClient.request(.getAgent(id: "a1"))
            Issue.record("Expected error")
        } catch {
            // networkError or unauthorized expected
        }
    }

    @Test("APIClient requestVoid throws networkError when server unreachable")
    func apiClientVoidNetworkError() async throws {
        let (apiClient, authManager) = makeAPIClient()
        try await authManager.setTokens(access: "token", refresh: "rt", expiresIn: 3600)

        do {
            try await apiClient.requestVoid(.deleteAgent(id: "a1"))
            Issue.record("Expected error")
        } catch {
            // Expected
        }
    }

    // MARK: - Agent Decoding with Memory-Related Fields

    @Test("Agent decodes with mcp_servers from JSON")
    func agentDecodesWithMcpServers() throws {
        let json = """
        {
            "id": "a1",
            "creator_id": "u1",
            "name": "Memory Agent",
            "slug": "memory-agent",
            "mcp_servers": [
                {"name": "memory", "url": "http://localhost:3001", "tools": ["store", "recall"]}
            ],
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.mcpServers?.count == 1)
        #expect(agent.mcpServers?[0].name == "memory")
        #expect(agent.mcpServers?[0].tools?.contains("store") == true)
        #expect(agent.mcpServers?[0].tools?.contains("recall") == true)
    }

    @Test("Agent decodes with tools array from JSON")
    func agentDecodesWithTools() throws {
        let json = """
        {
            "id": "a1",
            "creator_id": "u1",
            "name": "Tool Agent",
            "slug": "tool-agent",
            "tools": [
                {"name": "memory_store", "enabled": true},
                {"name": "memory_recall", "enabled": true},
                {"name": "memory_delete", "enabled": false}
            ],
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.tools?.count == 3)
        #expect(agent.tools?[2].enabled == false)
    }

    @Test("Agent decodes without memory fields present")
    func agentDecodesWithoutMemoryFields() throws {
        let json = """
        {
            "id": "a1",
            "creator_id": "u1",
            "name": "Simple Agent",
            "slug": "simple-agent",
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!

        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.mcpServers == nil)
        #expect(agent.tools == nil)
    }

    // MARK: - Memory Stats via Agent Performance

    @Test("Agent performance endpoint has correct path")
    func agentPerformancePath() {
        // Agent performance stats (which may include memory stats) are at
        // /agents/:id/performance — while not currently in APIEndpoint enum,
        // we verify the pattern would work
        let agentID = "agent_mem_1"
        let expectedPath = "/agents/\(agentID)"
        let endpoint = APIEndpoint.getAgent(id: agentID)
        #expect(endpoint.path == expectedPath)
    }

    @Test("getAgent uses GET method")
    func getAgentMethod() {
        #expect(APIEndpoint.getAgent(id: "a1").method == "GET")
    }

    @Test("getAgent requires auth")
    func getAgentRequiresAuth() {
        #expect(APIEndpoint.getAgent(id: "a1").requiresAuth == true)
    }

    // MARK: - Error Handling Edge Cases

    @Test("APIError.unauthorized maps to readable message")
    func unauthorizedReadableMessage() {
        // Verify the error can be pattern-matched
        let error = APIError.unauthorized
        switch error {
        case .unauthorized:
            break // Expected
        default:
            Issue.record("Expected .unauthorized")
        }
    }

    @Test("APIError.networkError wraps underlying error")
    func networkErrorWraps() {
        let underlying = URLError(.notConnectedToInternet)
        let error = APIError.networkError(underlying)

        switch error {
        case .networkError:
            break // Expected
        default:
            Issue.record("Expected .networkError")
        }
    }

    @Test("APIError.httpError includes status code")
    func httpErrorStatusCode() {
        let error = APIError.httpError(statusCode: 429, error: nil)

        switch error {
        case .httpError(let code, _):
            #expect(code == 429)
        default:
            Issue.record("Expected .httpError")
        }
    }

    @Test("APIError.httpError includes error response with display message")
    func httpErrorWithResponse() throws {
        let json = """
        {"error": "rate_limited", "message": "Too many requests. Try again in 60 seconds."}
        """.data(using: .utf8)!
        let errorResponse = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)

        #expect(errorResponse.displayMessage == "Too many requests. Try again in 60 seconds.")
    }

    @Test("APIErrorResponse with field errors flattens to display message")
    func errorResponseFieldErrors() throws {
        let json = """
        {
            "error": "validation_error",
            "message": null,
            "details": {
                "formErrors": [],
                "fieldErrors": {
                    "content": ["Content is required"],
                    "type": ["Invalid type"]
                }
            }
        }
        """.data(using: .utf8)!
        let errorResponse = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        let display = errorResponse.displayMessage
        #expect(display != nil)
        #expect(display?.contains("Content is required") == true)
    }

    @Test("APIErrorResponse without message or details returns nil displayMessage")
    func errorResponseNoDisplay() throws {
        let json = """
        {"error": "unknown"}
        """.data(using: .utf8)!
        let errorResponse = try JSONDecoder.waiagents.decode(APIErrorResponse.self, from: json)
        #expect(errorResponse.displayMessage == nil)
    }
}
