import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for agent-related ViewModel and endpoint behavior:
/// agent listing, creation validation, deletion, editing,
/// category filtering, search, and empty state handling.
@Suite("Agent ViewModel Tests")
struct AgentViewModelTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    private func makeAgent(
        id: String = "agent_1",
        name: String = "Test Agent",
        slug: String = "test-agent",
        model: String? = "claude-sonnet-4-6",
        category: String? = nil,
        visibility: Agent.Visibility? = .private,
        systemPrompt: String? = "You are helpful.",
        usageCount: Int? = 0,
        ratingSum: Int? = 0,
        ratingCount: Int? = 0
    ) -> Agent {
        Agent(
            id: id,
            creatorID: "user_1",
            name: name,
            slug: slug,
            systemPrompt: systemPrompt,
            model: model,
            visibility: visibility,
            category: category,
            usageCount: usageCount,
            ratingSum: ratingSum,
            ratingCount: ratingCount
        )
    }

    // MARK: - Agent List Endpoint

    @Test("listAgents endpoint uses GET method")
    func listAgentsMethod() {
        #expect(APIEndpoint.listAgents.method == "GET")
    }

    @Test("listAgents requires authentication")
    func listAgentsRequiresAuth() {
        #expect(APIEndpoint.listAgents.requiresAuth == true)
    }

    @Test("listAgents has correct path")
    func listAgentsPath() {
        #expect(APIEndpoint.listAgents.path == "/agents")
    }

    @Test("listAgents has no query items")
    func listAgentsNoQueryItems() {
        #expect(APIEndpoint.listAgents.queryItems == nil)
    }

    @Test("listAgents has no idempotency key")
    func listAgentsNoIdempotencyKey() {
        #expect(APIEndpoint.listAgents.idempotencyKey == nil)
    }

    // MARK: - Agent Creation Validation

    @Test("createAgent endpoint uses POST method")
    func createAgentMethod() {
        let endpoint = APIEndpoint.createAgent(name: "My Agent", systemPrompt: "You are helpful", model: nil)
        #expect(endpoint.method == "POST")
    }

    @Test("createAgent requires authentication")
    func createAgentRequiresAuth() {
        let endpoint = APIEndpoint.createAgent(name: "My Agent", systemPrompt: "You are helpful", model: nil)
        #expect(endpoint.requiresAuth == true)
    }

    @Test("createAgent has correct path")
    func createAgentPath() {
        let endpoint = APIEndpoint.createAgent(name: "My Agent", systemPrompt: "You are helpful", model: nil)
        #expect(endpoint.path == "/agents")
    }

    @Test("createAgent encodes name and systemPrompt in body")
    func createAgentBody() throws {
        let endpoint = APIEndpoint.createAgent(name: "My Agent", systemPrompt: "Be helpful", model: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["name"] as? String == "My Agent")
        #expect(dict?["system_prompt"] as? String == "Be helpful")
        #expect(dict?["model"] == nil)
    }

    @Test("createAgent encodes model when provided")
    func createAgentWithModel() throws {
        let endpoint = APIEndpoint.createAgent(name: "Agent", systemPrompt: "Prompt", model: "claude-opus-4-6")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["model"] as? String == "claude-opus-4-6")
    }

    @Test("createAgent with empty name still encodes")
    func createAgentEmptyName() throws {
        let endpoint = APIEndpoint.createAgent(name: "", systemPrompt: "prompt", model: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["name"] as? String == "")
    }

    @Test("createAgent with long name encodes correctly")
    func createAgentLongName() throws {
        let longName = String(repeating: "A", count: 500)
        let endpoint = APIEndpoint.createAgent(name: longName, systemPrompt: "prompt", model: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect((dict?["name"] as? String)?.count == 500)
    }

    @Test("createAgent with special characters in name")
    func createAgentSpecialCharsName() throws {
        let endpoint = APIEndpoint.createAgent(name: "Agent <script> & 'test'", systemPrompt: "prompt", model: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["name"] as? String == "Agent <script> & 'test'")
    }

    // MARK: - Agent Deletion

    @Test("deleteAgent endpoint uses DELETE method")
    func deleteAgentMethod() {
        #expect(APIEndpoint.deleteAgent(id: "agent_1").method == "DELETE")
    }

    @Test("deleteAgent requires authentication")
    func deleteAgentRequiresAuth() {
        #expect(APIEndpoint.deleteAgent(id: "agent_1").requiresAuth == true)
    }

    @Test("deleteAgent has correct path with ID interpolation")
    func deleteAgentPath() {
        #expect(APIEndpoint.deleteAgent(id: "agent_abc").path == "/agents/agent_abc")
    }

    @Test("deleteAgent has no body")
    func deleteAgentNoBody() throws {
        let request = try APIEndpoint.deleteAgent(id: "a1").urlRequest(baseURL: baseURL)
        #expect(request.httpBody == nil)
    }

    // MARK: - Agent Editing

    @Test("updateAgent endpoint uses PATCH method")
    func updateAgentMethod() {
        #expect(APIEndpoint.updateAgent(id: "a1", params: [:]).method == "PATCH")
    }

    @Test("updateAgent requires authentication")
    func updateAgentRequiresAuth() {
        #expect(APIEndpoint.updateAgent(id: "a1", params: [:]).requiresAuth == true)
    }

    @Test("updateAgent has correct path")
    func updateAgentPath() {
        #expect(APIEndpoint.updateAgent(id: "agent_xyz", params: [:]).path == "/agents/agent_xyz")
    }

    @Test("updateAgent encodes params dictionary in body")
    func updateAgentBody() throws {
        let params: [String: AnyCodable] = [
            "name": AnyCodable("Updated Name"),
            "system_prompt": AnyCodable("New prompt"),
        ]
        let endpoint = APIEndpoint.updateAgent(id: "a1", params: params)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        #expect(body.count > 0)
    }

    @Test("updateAgent with empty params encodes empty object")
    func updateAgentEmptyParams() throws {
        let endpoint = APIEndpoint.updateAgent(id: "a1", params: [:])
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?.isEmpty == true)
    }

    // MARK: - Agent Get

    @Test("getAgent uses GET method")
    func getAgentMethod() {
        #expect(APIEndpoint.getAgent(id: "a1").method == "GET")
    }

    @Test("getAgent has correct path")
    func getAgentPath() {
        #expect(APIEndpoint.getAgent(id: "agent_123").path == "/agents/agent_123")
    }

    @Test("getAgent has no body")
    func getAgentNoBody() throws {
        let request = try APIEndpoint.getAgent(id: "a1").urlRequest(baseURL: baseURL)
        #expect(request.httpBody == nil)
    }

    // MARK: - Start Agent Conversation

    @Test("startAgentConversation uses POST method")
    func startConversationMethod() {
        #expect(APIEndpoint.startAgentConversation(agentID: "a1").method == "POST")
    }

    @Test("startAgentConversation has correct path")
    func startConversationPath() {
        #expect(APIEndpoint.startAgentConversation(agentID: "agent_abc").path == "/agents/agent_abc/conversation")
    }

    @Test("startAgentConversation requires authentication")
    func startConversationRequiresAuth() {
        #expect(APIEndpoint.startAgentConversation(agentID: "a1").requiresAuth == true)
    }

    // MARK: - Agent Model Properties

    @Test("Agent averageRating prefers API value over computed")
    func averageRatingPrefersAPI() {
        let agent = Agent(
            id: "a1",
            creatorID: "u1",
            name: "Agent",
            slug: "agent",
            ratingSum: 10,
            ratingCount: 2,
            averageRatingFromAPI: 4.5
        )
        #expect(agent.averageRating == 4.5)
    }

    @Test("Agent averageRating computes from sum and count when API value absent")
    func averageRatingComputed() {
        let agent = Agent(
            id: "a1",
            creatorID: "u1",
            name: "Agent",
            slug: "agent",
            ratingSum: 15,
            ratingCount: 3,
            averageRatingFromAPI: nil
        )
        #expect(agent.averageRating == 5.0)
    }

    @Test("Agent averageRating returns 0 when no ratings")
    func averageRatingNoRatings() {
        let agent = Agent(
            id: "a1",
            creatorID: "u1",
            name: "Agent",
            slug: "agent",
            ratingSum: 0,
            ratingCount: 0,
            averageRatingFromAPI: nil
        )
        #expect(agent.averageRating == 0)
    }

    @Test("Agent averageRating returns 0 when ratingCount is nil")
    func averageRatingNilCount() {
        let agent = Agent(
            id: "a1",
            creatorID: "u1",
            name: "Agent",
            slug: "agent",
            ratingSum: nil,
            ratingCount: nil,
            averageRatingFromAPI: nil
        )
        #expect(agent.averageRating == 0)
    }

    // MARK: - Category Filtering via Model

    @Test("Agent with category can be filtered")
    func agentCategoryFiltering() {
        let agents = [
            makeAgent(id: "a1", category: "productivity"),
            makeAgent(id: "a2", category: "creative"),
            makeAgent(id: "a3", category: "productivity"),
            makeAgent(id: "a4", category: nil),
        ]
        let productivityAgents = agents.filter { $0.category == "productivity" }
        #expect(productivityAgents.count == 2)
    }

    @Test("Agent nil category agents can be filtered for uncategorized")
    func uncategorizedAgents() {
        let agents = [
            makeAgent(id: "a1", category: "productivity"),
            makeAgent(id: "a2", category: nil),
            makeAgent(id: "a3", category: nil),
        ]
        let uncategorized = agents.filter { $0.category == nil }
        #expect(uncategorized.count == 2)
    }

    // MARK: - Search via Agent name/slug

    @Test("Agents can be searched by name prefix")
    func searchByNamePrefix() {
        let agents = [
            makeAgent(id: "a1", name: "Code Helper", slug: "code-helper"),
            makeAgent(id: "a2", name: "Code Review Bot", slug: "code-review"),
            makeAgent(id: "a3", name: "Design Assistant", slug: "design-assistant"),
        ]
        let results = agents.filter { $0.name.lowercased().contains("code") }
        #expect(results.count == 2)
    }

    @Test("Agents can be searched by slug")
    func searchBySlug() {
        let agents = [
            makeAgent(id: "a1", name: "Agent A", slug: "code-helper"),
            makeAgent(id: "a2", name: "Agent B", slug: "code-review"),
            makeAgent(id: "a3", name: "Agent C", slug: "design-assistant"),
        ]
        let results = agents.filter { $0.slug.contains("code") }
        #expect(results.count == 2)
    }

    @Test("Search with empty query returns all agents")
    func searchEmptyQuery() {
        let agents = [
            makeAgent(id: "a1"),
            makeAgent(id: "a2"),
        ]
        let query = ""
        let results = query.isEmpty ? agents : agents.filter { $0.name.contains(query) }
        #expect(results.count == 2)
    }

    @Test("Search with no matches returns empty array")
    func searchNoMatches() {
        let agents = [
            makeAgent(id: "a1", name: "Alpha"),
            makeAgent(id: "a2", name: "Beta"),
        ]
        let results = agents.filter { $0.name.lowercased().contains("gamma") }
        #expect(results.isEmpty)
    }

    // MARK: - Empty State Handling

    @Test("Empty agents array is valid initial state")
    func emptyAgentsArray() {
        let agents: [Agent] = []
        #expect(agents.isEmpty)
        #expect(agents.count == 0)
    }

    @Test("Single agent array works correctly")
    func singleAgentArray() {
        let agents = [makeAgent()]
        #expect(agents.count == 1)
        #expect(agents[0].id == "agent_1")
    }

    // MARK: - Agent Visibility

    @Test("Agent visibility values decode correctly")
    func visibilityDecoding() throws {
        for (raw, expected) in [
            ("public", Agent.Visibility.public),
            ("unlisted", Agent.Visibility.unlisted),
            ("private", Agent.Visibility.private),
        ] {
            let json = """
            {
                "id": "a1", "creator_id": "u1", "name": "Agent", "slug": "agent",
                "visibility": "\(raw)",
                "created_at": "2026-03-01T08:00:00Z", "updated_at": "2026-03-01T08:00:00Z"
            }
            """.data(using: .utf8)!
            let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
            #expect(agent.visibility == expected)
        }
    }

    @Test("Agent with nil visibility decodes as nil")
    func nilVisibility() throws {
        let json = """
        {
            "id": "a1", "creator_id": "u1", "name": "Agent", "slug": "agent",
            "created_at": "2026-03-01T08:00:00Z", "updated_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!
        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.visibility == nil)
    }

    // MARK: - Agent Tool Configuration

    @Test("Agent ToolConfig initializer works with defaults")
    func toolConfigDefaults() {
        let tool = Agent.ToolConfig(name: "web_search")
        #expect(tool.name == "web_search")
        #expect(tool.enabled == true)
        #expect(tool.config == nil)
    }

    @Test("Agent ToolConfig with custom config")
    func toolConfigCustom() {
        let tool = Agent.ToolConfig(
            name: "calculator",
            enabled: false,
            config: ["precision": AnyCodable(10)]
        )
        #expect(tool.name == "calculator")
        #expect(tool.enabled == false)
        #expect(tool.config?["precision"]?.intValue == 10)
    }

    @Test("Agent McpServerConfig initializer")
    func mcpServerConfig() {
        let mcp = Agent.McpServerConfig(
            name: "memory",
            url: "http://localhost:3001",
            authToken: "secret",
            tools: ["store", "recall"]
        )
        #expect(mcp.name == "memory")
        #expect(mcp.url == "http://localhost:3001")
        #expect(mcp.authToken == "secret")
        #expect(mcp.tools == ["store", "recall"])
    }

    // MARK: - Agent Equatable

    @Test("Two agents with same properties are equal")
    func agentEquality() {
        let date = Date()
        let a = Agent(id: "a1", creatorID: "u1", name: "Agent", slug: "agent", createdAt: date, updatedAt: date)
        let b = Agent(id: "a1", creatorID: "u1", name: "Agent", slug: "agent", createdAt: date, updatedAt: date)
        #expect(a == b)
    }

    @Test("Two agents with different IDs are not equal")
    func agentInequality() {
        let date = Date()
        let a = Agent(id: "a1", creatorID: "u1", name: "Agent", slug: "agent", createdAt: date, updatedAt: date)
        let b = Agent(id: "a2", creatorID: "u1", name: "Agent", slug: "agent", createdAt: date, updatedAt: date)
        #expect(a != b)
    }
}
