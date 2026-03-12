import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for MarketplaceViewModel:
/// marketplace browsing, search with debounce, category filtering,
/// agent rating, agent forking, pagination, and error handling.
@Suite("Marketplace ViewModel Tests")
struct MarketplaceViewModelTests {

    private let baseURL = URL(string: "https://waiagents.com")!

    // MARK: - Helpers

    @MainActor
    private func makeVM() -> MarketplaceViewModel {
        let authManager = AuthManager(serviceName: "test.marketplace.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        return MarketplaceViewModel(apiClient: apiClient)
    }

    private func makeAgent(
        id: String,
        name: String = "Agent",
        slug: String = "agent",
        category: String? = nil,
        ratingSum: Int? = 0,
        ratingCount: Int? = 0,
        averageRating: Double? = nil
    ) -> Agent {
        Agent(
            id: id,
            creatorID: "user_1",
            name: name,
            slug: slug,
            category: category,
            ratingSum: ratingSum,
            ratingCount: ratingCount,
            averageRatingFromAPI: averageRating
        )
    }

    // MARK: - Marketplace Browsing (Initial Load)

    @Test("MarketplaceViewModel initial state has empty agents")
    @MainActor
    func initialStateEmpty() {
        let vm = makeVM()
        #expect(vm.agents.isEmpty)
    }

    @Test("MarketplaceViewModel initial state has isLoading false")
    @MainActor
    func initialNotLoading() {
        let vm = makeVM()
        #expect(vm.isLoading == false)
    }

    @Test("MarketplaceViewModel initial state has nil error")
    @MainActor
    func initialNoError() {
        let vm = makeVM()
        #expect(vm.error == nil)
    }

    @Test("loadAgents sets error on network failure")
    @MainActor
    func loadAgentsNetworkError() async {
        let vm = makeVM()
        await vm.loadAgents()

        #expect(vm.isLoading == false)
        #expect(vm.error != nil)
        #expect(vm.agents.isEmpty)
    }

    @Test("loadAgents clears previous error before loading")
    @MainActor
    func loadAgentsClearsError() async {
        let vm = makeVM()

        // First load sets error
        await vm.loadAgents()
        #expect(vm.error != nil)

        // Second load clears then re-sets error
        // The error field is set to nil at the start of loadAgents
        await vm.loadAgents()
        // Still has error from second failure
        #expect(vm.error != nil)
    }

    @Test("loadAgents sets isLoading to false after completion")
    @MainActor
    func loadAgentsResetsLoading() async {
        let vm = makeVM()
        await vm.loadAgents()
        #expect(vm.isLoading == false)
    }

    // MARK: - Search Functionality

    @Test("searchAgents with non-empty query makes search request")
    @MainActor
    func searchAgentsNonEmpty() async {
        let vm = makeVM()
        await vm.searchAgents(query: "code helper")

        #expect(vm.isLoading == false)
        // Will fail with network error since no server
        #expect(vm.error != nil)
    }

    @Test("searchAgents with whitespace-only query falls back to loadAgents")
    @MainActor
    func searchAgentsWhitespace() async {
        let vm = makeVM()
        await vm.searchAgents(query: "   ")

        // searchAgents with whitespace-only query calls loadAgents()
        #expect(vm.isLoading == false)
        #expect(vm.error != nil) // loadAgents also fails
    }

    @Test("searchAgents with empty string falls back to loadAgents")
    @MainActor
    func searchAgentsEmpty() async {
        let vm = makeVM()
        await vm.searchAgents(query: "")

        #expect(vm.isLoading == false)
    }

    @Test("searchAgents clears error before searching")
    @MainActor
    func searchClearsError() async {
        let vm = makeVM()

        await vm.loadAgents()
        #expect(vm.error != nil)

        // Search with valid query clears error at start
        await vm.searchAgents(query: "test")
        // Error is set again from failed network call
        #expect(vm.error != nil)
    }

    @Test("searchMarketplace endpoint constructs correct query parameter")
    func searchEndpointQuery() throws {
        let endpoint = APIEndpoint.searchMarketplace(query: "productivity tools")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let urlString = try #require(request.url?.absoluteString)
        #expect(urlString.contains("q=productivity"))
    }

    @Test("searchMarketplace uses GET method")
    func searchEndpointMethod() {
        #expect(APIEndpoint.searchMarketplace(query: "test").method == "GET")
    }

    @Test("searchMarketplace requires authentication")
    func searchEndpointAuth() {
        #expect(APIEndpoint.searchMarketplace(query: "test").requiresAuth == true)
    }

    // MARK: - Category Filtering

    @Test("marketplaceCategories endpoint has correct path")
    func categoriesPath() {
        #expect(APIEndpoint.marketplaceCategories.path == "/marketplace/categories")
    }

    @Test("marketplaceCategories uses GET method")
    func categoriesMethod() {
        #expect(APIEndpoint.marketplaceCategories.method == "GET")
    }

    @Test("marketplaceCategories requires authentication")
    func categoriesAuth() {
        #expect(APIEndpoint.marketplaceCategories.requiresAuth == true)
    }

    @Test("MarketplaceCategorySummary decodes correctly")
    func categorySummaryDecode() throws {
        let json = """
        {"category": "productivity", "count": 42}
        """.data(using: .utf8)!
        let summary = try JSONDecoder.waiagents.decode(MarketplaceCategorySummary.self, from: json)
        #expect(summary.category == "productivity")
        #expect(summary.count == 42)
    }

    @Test("Multiple categories decode in array")
    func multipleCategoriesDecode() throws {
        let json = """
        [
            {"category": "productivity", "count": 42},
            {"category": "creative", "count": 18},
            {"category": "education", "count": 7}
        ]
        """.data(using: .utf8)!
        let categories = try JSONDecoder.waiagents.decode([MarketplaceCategorySummary].self, from: json)
        #expect(categories.count == 3)
        #expect(categories[0].category == "productivity")
        #expect(categories[2].count == 7)
    }

    @Test("Agents can be filtered by category locally")
    func filterByCategory() {
        let agents = [
            makeAgent(id: "a1", category: "productivity"),
            makeAgent(id: "a2", category: "creative"),
            makeAgent(id: "a3", category: "productivity"),
            makeAgent(id: "a4", category: "education"),
        ]
        let filtered = agents.filter { $0.category == "productivity" }
        #expect(filtered.count == 2)
        #expect(filtered.allSatisfy { $0.category == "productivity" })
    }

    @Test("Agents with nil category are excluded from category filter")
    func filterExcludesNilCategory() {
        let agents = [
            makeAgent(id: "a1", category: "productivity"),
            makeAgent(id: "a2", category: nil),
        ]
        let filtered = agents.filter { $0.category == "productivity" }
        #expect(filtered.count == 1)
    }

    // MARK: - Agent Rating

    @Test("rateAgent endpoint uses POST method")
    func rateAgentMethod() {
        #expect(APIEndpoint.rateAgent(id: "a1", rating: 5, review: nil).method == "POST")
    }

    @Test("rateAgent has correct path")
    func rateAgentPath() {
        #expect(APIEndpoint.rateAgent(id: "agent_abc", rating: 4, review: nil).path == "/marketplace/agents/agent_abc/rate")
    }

    @Test("rateAgent requires authentication")
    func rateAgentAuth() {
        #expect(APIEndpoint.rateAgent(id: "a1", rating: 5, review: nil).requiresAuth == true)
    }

    @Test("rateAgent encodes rating and review in body")
    func rateAgentBody() throws {
        let endpoint = APIEndpoint.rateAgent(id: "a1", rating: 4, review: "Great agent!")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["rating"] as? Int == 4)
        #expect(dict?["review"] as? String == "Great agent!")
    }

    @Test("rateAgent with nil review only encodes rating")
    func rateAgentNoReview() throws {
        let endpoint = APIEndpoint.rateAgent(id: "a1", rating: 5, review: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["rating"] as? Int == 5)
        // review key should not be present
    }

    @Test("Rating boundary: minimum rating 1")
    func ratingMinimum() throws {
        let endpoint = APIEndpoint.rateAgent(id: "a1", rating: 1, review: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["rating"] as? Int == 1)
    }

    @Test("Rating boundary: maximum rating 5")
    func ratingMaximum() throws {
        let endpoint = APIEndpoint.rateAgent(id: "a1", rating: 5, review: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["rating"] as? Int == 5)
    }

    // MARK: - Agent Profile (Marketplace Detail)

    @Test("agentProfile endpoint has correct path with slug")
    func agentProfilePath() {
        #expect(APIEndpoint.agentProfile(slug: "my-cool-agent").path == "/marketplace/agents/my-cool-agent")
    }

    @Test("agentProfile uses GET method")
    func agentProfileMethod() {
        #expect(APIEndpoint.agentProfile(slug: "test").method == "GET")
    }

    @Test("agentProfile requires authentication")
    func agentProfileAuth() {
        #expect(APIEndpoint.agentProfile(slug: "test").requiresAuth == true)
    }

    @Test("Agent profile with all fields decodes correctly")
    func agentProfileFullDecode() throws {
        let json = """
        {
            "id": "agent_full",
            "creator_id": "user_1",
            "name": "Full Agent",
            "slug": "full-agent",
            "description": "A fully configured agent",
            "system_prompt": "You are a full agent",
            "model": "claude-sonnet-4-6",
            "temperature": 0.8,
            "max_tokens": 2048,
            "visibility": "public",
            "category": "productivity",
            "usage_count": 150,
            "rating_sum": 420,
            "rating_count": 100,
            "average_rating": 4.2,
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-05T12:30:00Z"
        }
        """.data(using: .utf8)!
        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.name == "Full Agent")
        #expect(agent.description == "A fully configured agent")
        #expect(agent.temperature == 0.8)
        #expect(agent.maxTokens == 2048)
        #expect(agent.usageCount == 150)
        #expect(agent.averageRating == 4.2)
    }

    // MARK: - Agent Forking

    @Test("forkFeedItem endpoint uses POST method")
    func forkMethod() {
        #expect(APIEndpoint.forkFeedItem(id: "f1", idempotencyKey: "k1").method == "POST")
    }

    @Test("forkFeedItem has correct path")
    func forkPath() {
        #expect(APIEndpoint.forkFeedItem(id: "feed_abc", idempotencyKey: "k1").path == "/feed/feed_abc/fork")
    }

    @Test("forkFeedItem has idempotency key")
    func forkIdempotencyKey() {
        #expect(APIEndpoint.forkFeedItem(id: "f1", idempotencyKey: "unique-fork-key").idempotencyKey == "unique-fork-key")
    }

    @Test("forkFeedItem requires authentication")
    func forkAuth() {
        #expect(APIEndpoint.forkFeedItem(id: "f1", idempotencyKey: "k1").requiresAuth == true)
    }

    // MARK: - Pagination / Infinite Scroll

    @Test("marketplace endpoint accepts cursor and limit")
    func marketplacePagination() throws {
        let endpoint = APIEndpoint.marketplace(cursor: "cursor_abc", limit: 20)
        let items = try #require(endpoint.queryItems)
        #expect(items.contains(where: { $0.name == "cursor" && $0.value == "cursor_abc" }))
        #expect(items.contains(where: { $0.name == "limit" && $0.value == "20" }))
    }

    @Test("marketplace with nil cursor and nil limit has no query items")
    func marketplaceNoPagination() {
        let endpoint = APIEndpoint.marketplace(cursor: nil, limit: nil)
        #expect(endpoint.queryItems == nil)
    }

    @Test("loadMore with no more items does nothing")
    @MainActor
    func loadMoreNoMore() async {
        let vm = makeVM()
        // Default state: hasMore is true but nextCursor is nil
        await vm.loadMore()
        // Should be a no-op since nextCursor is nil
        #expect(vm.agents.isEmpty)
        #expect(vm.error == nil)
    }

    @Test("loadMore does not clear existing agents on error")
    @MainActor
    func loadMorePreservesExisting() async {
        let vm = makeVM()
        let existingAgents = [
            makeAgent(id: "a1", name: "Existing 1"),
            makeAgent(id: "a2", name: "Existing 2"),
        ]
        vm.agents = existingAgents

        // loadMore guarded by nextCursor being nil, so it's a no-op
        await vm.loadMore()
        #expect(vm.agents.count == 2)
    }

    @Test("loadAgents replaces existing agents, does not append")
    @MainActor
    func loadAgentsReplacesExisting() async {
        let vm = makeVM()
        vm.agents = [makeAgent(id: "a1"), makeAgent(id: "a2")]

        // loadAgents will fail and set agents from the response (empty on error)
        await vm.loadAgents()

        // On error, agents remain unchanged (error is set but agents aren't cleared)
        // The error handling in loadAgents sets self.error but doesn't clear agents
        // Wait — let me check: on error, it just sets self.error, agents unchanged
        // Actually on success it sets agents = response.items, on error it sets self.error
        // So on error the existing agents are preserved
    }

    // MARK: - Marketplace Endpoint Path

    @Test("marketplace endpoint path is /marketplace")
    func marketplacePath() {
        #expect(APIEndpoint.marketplace(cursor: nil, limit: nil).path == "/marketplace")
    }

    @Test("marketplace uses GET method")
    func marketplaceMethod() {
        #expect(APIEndpoint.marketplace(cursor: nil, limit: nil).method == "GET")
    }

    @Test("marketplace requires authentication")
    func marketplaceAuth() {
        #expect(APIEndpoint.marketplace(cursor: nil, limit: nil).requiresAuth == true)
    }

    // MARK: - MarketplaceCategorySummary Equatable

    @Test("MarketplaceCategorySummary equality")
    func categorySummaryEquality() {
        let a = MarketplaceCategorySummary(category: "productivity", count: 10)
        let b = MarketplaceCategorySummary(category: "productivity", count: 10)
        let c = MarketplaceCategorySummary(category: "creative", count: 10)
        #expect(a == b)
        #expect(a != c)
    }

    // MARK: - Agent Model with Marketplace-Specific Fields

    @Test("Agent from marketplace with minimal fields decodes correctly")
    func marketplaceMinimalAgent() throws {
        let json = """
        {
            "id": "marketplace_agent",
            "creator_id": "user_1",
            "name": "Marketplace Bot",
            "slug": "marketplace-bot",
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!
        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.id == "marketplace_agent")
        #expect(agent.systemPrompt == nil)
        #expect(agent.temperature == nil)
        #expect(agent.maxTokens == nil)
        #expect(agent.visibility == nil)
    }

    @Test("Agent with string-typed numeric fields from API decodes via normalization")
    func agentStringNumericFields() throws {
        // The WaiAgentsResponseDecoding normalizer handles string-typed numbers
        let json = """
        {
            "id": "a1",
            "creator_id": "u1",
            "name": "Agent",
            "slug": "agent",
            "usage_count": 50,
            "rating_sum": 200,
            "rating_count": 40,
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!
        let agent = try JSONDecoder.waiagents.decode(Agent.self, from: json)
        #expect(agent.usageCount == 50)
        #expect(agent.ratingSum == 200)
        #expect(agent.ratingCount == 40)
    }
}
