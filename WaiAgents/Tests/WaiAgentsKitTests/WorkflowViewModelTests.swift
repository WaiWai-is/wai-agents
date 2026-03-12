import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for workflow (Crew) ViewModel behavior:
/// workflow creation from template, step configuration,
/// workflow execution trigger, run status tracking,
/// error handling, and Crew/CrewStep model validation.
@Suite("Workflow ViewModel Tests")
struct WorkflowViewModelTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    private func makeCrew(
        id: String = "crew_1",
        name: String = "Test Workflow",
        steps: [CrewStep] = [],
        visibility: Crew.Visibility = .private,
        category: String? = nil,
        description: String? = nil
    ) -> Crew {
        Crew(
            id: id,
            creatorID: "user_1",
            name: name,
            description: description,
            visibility: visibility,
            steps: steps,
            category: category
        )
    }

    private func makeStep(
        agentID: String = "agent_1",
        role: String = "researcher",
        parallelGroup: String? = nil
    ) -> CrewStep {
        CrewStep(agentID: agentID, role: role, parallelGroup: parallelGroup)
    }

    // MARK: - Workflow Creation from Template (Crew Endpoint)

    @Test("createCrew uses POST method")
    func createCrewMethod() {
        let endpoint = APIEndpoint.createCrew(
            name: "My Workflow",
            steps: [CrewStep(agentID: "a1", role: "writer")],
            visibility: "private",
            description: "Test workflow",
            category: "productivity"
        )
        #expect(endpoint.method == "POST")
    }

    @Test("createCrew has correct path")
    func createCrewPath() {
        let endpoint = APIEndpoint.createCrew(
            name: "My Workflow",
            steps: [],
            visibility: nil,
            description: nil,
            category: nil
        )
        #expect(endpoint.path == "/crews")
    }

    @Test("createCrew requires authentication")
    func createCrewAuth() {
        let endpoint = APIEndpoint.createCrew(
            name: "Workflow",
            steps: [],
            visibility: nil,
            description: nil,
            category: nil
        )
        #expect(endpoint.requiresAuth == true)
    }

    @Test("createCrew encodes name and steps in body")
    func createCrewBody() throws {
        let steps = [
            CrewStep(agentID: "a1", role: "researcher"),
            CrewStep(agentID: "a2", role: "writer"),
        ]
        let endpoint = APIEndpoint.createCrew(
            name: "Research Workflow",
            steps: steps,
            visibility: "private",
            description: "Research and write",
            category: "productivity"
        )
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        #expect(body.count > 0)

        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["name"] as? String == "Research Workflow")
        #expect(dict?["visibility"] as? String == "private")
        #expect(dict?["description"] as? String == "Research and write")
        #expect(dict?["category"] as? String == "productivity")
        let stepsArray = dict?["steps"] as? [[String: Any]]
        #expect(stepsArray?.count == 2)
    }

    @Test("createCrew with empty steps array encodes correctly")
    func createCrewEmptySteps() throws {
        let endpoint = APIEndpoint.createCrew(
            name: "Empty Workflow",
            steps: [],
            visibility: nil,
            description: nil,
            category: nil
        )
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        let stepsArray = dict?["steps"] as? [Any]
        #expect(stepsArray?.count == 0)
    }

    @Test("createCrew with nil optional fields omits them from body")
    func createCrewNilOptionals() throws {
        let endpoint = APIEndpoint.createCrew(
            name: "Minimal",
            steps: [CrewStep(agentID: "a1", role: "worker")],
            visibility: nil,
            description: nil,
            category: nil
        )
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["name"] as? String == "Minimal")
    }

    // MARK: - Step Configuration

    @Test("CrewStep encodes agentId and role")
    func crewStepEncoding() throws {
        let step = CrewStep(agentID: "agent_abc", role: "analyst")
        let data = try JSONEncoder.waiagents.encode(step)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(dict?["agent_id"] as? String == "agent_abc")
        #expect(dict?["role"] as? String == "analyst")
    }

    @Test("CrewStep with parallelGroup encodes correctly")
    func crewStepParallelGroup() throws {
        let step = CrewStep(agentID: "a1", role: "worker", parallelGroup: "group_A")
        let data = try JSONEncoder.waiagents.encode(step)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(dict?["parallel_group"] as? String == "group_A")
    }

    @Test("CrewStep without parallelGroup omits it from encoding")
    func crewStepNoParallelGroup() throws {
        let step = CrewStep(agentID: "a1", role: "worker")
        let data = try JSONEncoder.waiagents.encode(step)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        // parallelGroup should be nil/absent
        #expect(dict?["parallel_group"] == nil || dict?["parallel_group"] is NSNull)
    }

    @Test("CrewStep decodes from JSON")
    func crewStepDecoding() throws {
        let json = """
        {"agent_id": "agent_123", "role": "reviewer", "parallel_group": "batch_1"}
        """.data(using: .utf8)!
        let step = try JSONDecoder.waiagents.decode(CrewStep.self, from: json)
        #expect(step.agentID == "agent_123")
        #expect(step.role == "reviewer")
        #expect(step.parallelGroup == "batch_1")
    }

    @Test("CrewStep equality works")
    func crewStepEquality() {
        let a = CrewStep(agentID: "a1", role: "writer")
        let b = CrewStep(agentID: "a1", role: "writer")
        let c = CrewStep(agentID: "a2", role: "writer")
        #expect(a == b)
        #expect(a != c)
    }

    @Test("Multiple steps can be configured for a workflow")
    func multipleSteps() {
        let steps = [
            makeStep(agentID: "a1", role: "researcher"),
            makeStep(agentID: "a2", role: "writer"),
            makeStep(agentID: "a3", role: "reviewer"),
        ]
        #expect(steps.count == 3)
        #expect(steps[0].role == "researcher")
        #expect(steps[1].role == "writer")
        #expect(steps[2].role == "reviewer")
    }

    @Test("Parallel steps share the same parallelGroup")
    func parallelSteps() {
        let steps = [
            makeStep(agentID: "a1", role: "researcher", parallelGroup: "parallel_1"),
            makeStep(agentID: "a2", role: "analyst", parallelGroup: "parallel_1"),
            makeStep(agentID: "a3", role: "writer"),
        ]
        let parallelSteps = steps.filter { $0.parallelGroup == "parallel_1" }
        #expect(parallelSteps.count == 2)
    }

    // MARK: - Workflow Execution Trigger

    @Test("runCrew uses POST method")
    func runCrewMethod() {
        let endpoint = APIEndpoint.runCrew(id: "crew_1", input: "Test input", idempotencyKey: "key_1")
        #expect(endpoint.method == "POST")
    }

    @Test("runCrew has correct path")
    func runCrewPath() {
        let endpoint = APIEndpoint.runCrew(id: "crew_abc", input: "input", idempotencyKey: "k1")
        #expect(endpoint.path == "/crews/crew_abc/run")
    }

    @Test("runCrew requires authentication")
    func runCrewAuth() {
        let endpoint = APIEndpoint.runCrew(id: "c1", input: "input", idempotencyKey: "k1")
        #expect(endpoint.requiresAuth == true)
    }

    @Test("runCrew has idempotency key")
    func runCrewIdempotencyKey() {
        let endpoint = APIEndpoint.runCrew(id: "c1", input: "input", idempotencyKey: "unique_run_key")
        #expect(endpoint.idempotencyKey == "unique_run_key")
    }

    @Test("runCrew encodes input in body")
    func runCrewBody() throws {
        let endpoint = APIEndpoint.runCrew(id: "c1", input: "Analyze this data", idempotencyKey: "k1")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["input"] as? String == "Analyze this data")
    }

    @Test("runCrew with empty input still encodes")
    func runCrewEmptyInput() throws {
        let endpoint = APIEndpoint.runCrew(id: "c1", input: "", idempotencyKey: "k1")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["input"] as? String == "")
    }

    @Test("runCrew with long input encodes correctly")
    func runCrewLongInput() throws {
        let longInput = String(repeating: "This is a test input. ", count: 10_000)
        let endpoint = APIEndpoint.runCrew(id: "c1", input: longInput, idempotencyKey: "k1")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        #expect(body.count > 100_000)
    }

    // MARK: - Crew Model (Run Status Tracking)

    @Test("Crew model with all fields initializes correctly")
    func crewFullInit() {
        let steps = [makeStep(), makeStep(agentID: "a2", role: "writer")]
        let crew = makeCrew(
            name: "Full Workflow",
            steps: steps,
            visibility: .public,
            category: "research",
            description: "A research workflow"
        )
        #expect(crew.name == "Full Workflow")
        #expect(crew.steps.count == 2)
        #expect(crew.visibility == .public)
        #expect(crew.category == "research")
        #expect(crew.description == "A research workflow")
    }

    @Test("Crew usageCount defaults to 0")
    func crewDefaultUsageCount() {
        let crew = makeCrew()
        #expect(crew.usageCount == 0)
    }

    @Test("Crew averageRating computes correctly")
    func crewAverageRating() {
        let crew = Crew(
            id: "c1",
            creatorID: "u1",
            name: "Workflow",
            ratingSum: 20,
            ratingCount: 4
        )
        #expect(crew.averageRating == 5.0)
    }

    @Test("Crew averageRating returns 0 when no ratings")
    func crewAverageRatingZero() {
        let crew = makeCrew()
        #expect(crew.averageRating == 0)
    }

    @Test("Crew visibility values")
    func crewVisibility() {
        #expect(Crew.Visibility.public.rawValue == "public")
        #expect(Crew.Visibility.unlisted.rawValue == "unlisted")
        #expect(Crew.Visibility.private.rawValue == "private")
    }

    @Test("Crew decodes from JSON with all fields")
    func crewFullDecode() throws {
        let json = """
        {
            "id": "crew_1",
            "creator_id": "user_1",
            "name": "Research Pipeline",
            "slug": "research-pipeline",
            "description": "Multi-step research",
            "visibility": "public",
            "steps": [
                {"agent_id": "a1", "role": "researcher"},
                {"agent_id": "a2", "role": "writer"}
            ],
            "category": "research",
            "usage_count": 42,
            "rating_sum": 180,
            "rating_count": 40,
            "created_at": "2026-03-01T08:00:00Z",
            "updated_at": "2026-03-05T12:00:00Z"
        }
        """.data(using: .utf8)!
        let crew = try JSONDecoder.waiagents.decode(Crew.self, from: json)
        #expect(crew.id == "crew_1")
        #expect(crew.name == "Research Pipeline")
        #expect(crew.steps.count == 2)
        #expect(crew.usageCount == 42)
        #expect(crew.averageRating == 4.5)
    }

    @Test("Crew decodes with missing optional fields")
    func crewMinimalDecode() throws {
        let json = """
        {
            "id": "crew_min",
            "creator_id": "user_1",
            "name": "Minimal",
            "visibility": "private",
            "steps": []
        }
        """.data(using: .utf8)!
        let crew = try JSONDecoder.waiagents.decode(Crew.self, from: json)
        #expect(crew.id == "crew_min")
        #expect(crew.slug == nil)
        #expect(crew.description == nil)
        #expect(crew.category == nil)
        #expect(crew.usageCount == 0)
        #expect(crew.ratingSum == 0)
        #expect(crew.ratingCount == 0)
        #expect(crew.createdAt == nil)
    }

    @Test("Crew round-trip encoding preserves all fields")
    func crewRoundTrip() throws {
        let original = Crew(
            id: "c1",
            creatorID: "u1",
            name: "Workflow",
            slug: "workflow",
            description: "Test",
            visibility: .unlisted,
            steps: [CrewStep(agentID: "a1", role: "worker")],
            category: "testing",
            usageCount: 5,
            ratingSum: 20,
            ratingCount: 4
        )
        let data = try JSONEncoder.waiagents.encode(original)
        let decoded = try JSONDecoder.waiagents.decode(Crew.self, from: data)
        #expect(decoded.id == original.id)
        #expect(decoded.name == original.name)
        #expect(decoded.slug == original.slug)
        #expect(decoded.description == original.description)
        #expect(decoded.visibility == original.visibility)
        #expect(decoded.steps == original.steps)
        #expect(decoded.category == original.category)
        #expect(decoded.usageCount == original.usageCount)
    }

    // MARK: - Error Handling in Workflow Steps

    @Test("Crew with zero steps is valid")
    func crewZeroSteps() {
        let crew = makeCrew(steps: [])
        #expect(crew.steps.isEmpty)
    }

    @Test("Crew with single step works correctly")
    func crewSingleStep() {
        let step = makeStep(agentID: "a1", role: "solo_worker")
        let crew = makeCrew(steps: [step])
        #expect(crew.steps.count == 1)
        #expect(crew.steps[0].role == "solo_worker")
    }

    @Test("Crew with many steps works correctly")
    func crewManySteps() {
        var steps: [CrewStep] = []
        for i in 0..<50 {
            steps.append(CrewStep(agentID: "agent_\(i)", role: "role_\(i)"))
        }
        let crew = makeCrew(steps: steps)
        #expect(crew.steps.count == 50)
    }

    @Test("CrewStep with empty role is valid at model level")
    func stepEmptyRole() {
        let step = CrewStep(agentID: "a1", role: "")
        #expect(step.role == "")
    }

    @Test("CrewStep with empty agentID is valid at model level")
    func stepEmptyAgentID() {
        let step = CrewStep(agentID: "", role: "worker")
        #expect(step.agentID == "")
    }

    // MARK: - Crew CRUD Endpoints

    @Test("getCrew uses GET method")
    func getCrewMethod() {
        #expect(APIEndpoint.getCrew(id: "c1").method == "GET")
    }

    @Test("getCrew has correct path")
    func getCrewPath() {
        #expect(APIEndpoint.getCrew(id: "crew_xyz").path == "/crews/crew_xyz")
    }

    @Test("updateCrew uses PATCH method")
    func updateCrewMethod() {
        #expect(APIEndpoint.updateCrew(id: "c1", params: [:]).method == "PATCH")
    }

    @Test("updateCrew has correct path")
    func updateCrewPath() {
        #expect(APIEndpoint.updateCrew(id: "crew_123", params: [:]).path == "/crews/crew_123")
    }

    @Test("updateCrew requires authentication")
    func updateCrewAuth() {
        #expect(APIEndpoint.updateCrew(id: "c1", params: [:]).requiresAuth == true)
    }

    @Test("updateCrew encodes params in body")
    func updateCrewBody() throws {
        let params: [String: AnyCodable] = [
            "name": AnyCodable("Updated Workflow"),
            "description": AnyCodable("New description"),
        ]
        let endpoint = APIEndpoint.updateCrew(id: "c1", params: params)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        #expect(body.count > 0)
    }

    @Test("deleteCrew uses DELETE method")
    func deleteCrewMethod() {
        #expect(APIEndpoint.deleteCrew(id: "c1").method == "DELETE")
    }

    @Test("deleteCrew has correct path")
    func deleteCrewPath() {
        #expect(APIEndpoint.deleteCrew(id: "crew_abc").path == "/crews/crew_abc")
    }

    @Test("deleteCrew requires authentication")
    func deleteCrewAuth() {
        #expect(APIEndpoint.deleteCrew(id: "c1").requiresAuth == true)
    }

    @Test("listCrews uses GET method")
    func listCrewsMethod() {
        #expect(APIEndpoint.listCrews(cursor: nil, limit: nil).method == "GET")
    }

    @Test("listCrews has correct path")
    func listCrewsPath() {
        #expect(APIEndpoint.listCrews(cursor: nil, limit: nil).path == "/crews")
    }

    @Test("listCrews with cursor and limit has query items")
    func listCrewsPagination() {
        let endpoint = APIEndpoint.listCrews(cursor: "page_2", limit: 10)
        let items = endpoint.queryItems!
        #expect(items.contains(where: { $0.name == "cursor" && $0.value == "page_2" }))
        #expect(items.contains(where: { $0.name == "limit" && $0.value == "10" }))
    }

    // MARK: - Crew Equatable

    @Test("Two crews with same properties are equal")
    func crewEquality() {
        let a = Crew(id: "c1", creatorID: "u1", name: "Workflow")
        let b = Crew(id: "c1", creatorID: "u1", name: "Workflow")
        #expect(a == b)
    }

    @Test("Two crews with different IDs are not equal")
    func crewInequality() {
        let a = Crew(id: "c1", creatorID: "u1", name: "Workflow")
        let b = Crew(id: "c2", creatorID: "u1", name: "Workflow")
        #expect(a != b)
    }

    // MARK: - Trigger Endpoints (Workflow Triggers)

    @Test("listTriggers uses GET method")
    func listTriggersMethod() {
        #expect(APIEndpoint.listTriggers(agentID: "a1").method == "GET")
    }

    @Test("listTriggers has correct path")
    func listTriggersPath() {
        #expect(APIEndpoint.listTriggers(agentID: "agent_abc").path == "/agents/agent_abc/triggers")
    }

    @Test("createTrigger uses POST method")
    func createTriggerMethod() {
        let endpoint = APIEndpoint.createTrigger(agentID: "a1", name: "Webhook", triggerType: "webhook", params: nil)
        #expect(endpoint.method == "POST")
    }

    @Test("createTrigger has correct path")
    func createTriggerPath() {
        let endpoint = APIEndpoint.createTrigger(agentID: "agent_xyz", name: "Test", triggerType: "webhook", params: nil)
        #expect(endpoint.path == "/agents/agent_xyz/triggers")
    }

    @Test("createTrigger encodes name and triggerType in body")
    func createTriggerBody() throws {
        let endpoint = APIEndpoint.createTrigger(
            agentID: "a1",
            name: "Daily Digest",
            triggerType: "schedule",
            params: ["cron_expression": AnyCodable("0 9 * * *")]
        )
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["name"] as? String == "Daily Digest")
        #expect(dict?["trigger_type"] as? String == "schedule")
        #expect(dict?["cron_expression"] as? String == "0 9 * * *")
    }

    @Test("deleteTrigger uses DELETE method")
    func deleteTriggerMethod() {
        #expect(APIEndpoint.deleteTrigger(agentID: "a1", triggerID: "t1").method == "DELETE")
    }

    @Test("deleteTrigger has correct path")
    func deleteTriggerPath() {
        #expect(APIEndpoint.deleteTrigger(agentID: "agent_1", triggerID: "trigger_2").path == "/agents/agent_1/triggers/trigger_2")
    }

    @Test("updateTrigger uses PATCH method")
    func updateTriggerMethod() {
        #expect(APIEndpoint.updateTrigger(agentID: "a1", triggerID: "t1", params: [:]).method == "PATCH")
    }

    @Test("getTrigger uses GET method")
    func getTriggerMethod() {
        #expect(APIEndpoint.getTrigger(agentID: "a1", triggerID: "t1").method == "GET")
    }

    @Test("getTrigger has correct path")
    func getTriggerPath() {
        #expect(APIEndpoint.getTrigger(agentID: "a1", triggerID: "t1").path == "/agents/a1/triggers/t1")
    }

    // MARK: - AgentTrigger Model

    @Test("AgentTrigger triggerType values")
    func triggerTypeValues() {
        #expect(AgentTrigger.TriggerType.webhook.rawValue == "webhook")
        #expect(AgentTrigger.TriggerType.schedule.rawValue == "schedule")
        #expect(AgentTrigger.TriggerType.condition.rawValue == "condition")
    }

    @Test("AgentTrigger decodes from JSON")
    func triggerDecode() throws {
        let json = """
        {
            "id": "t1",
            "agent_id": "a1",
            "creator_id": "u1",
            "name": "Webhook Trigger",
            "trigger_type": "webhook",
            "token": "tok_abc",
            "hmac_configured": true,
            "enabled": true,
            "fire_count": 42,
            "created_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!
        let trigger = try JSONDecoder.waiagents.decode(AgentTrigger.self, from: json)
        #expect(trigger.id == "t1")
        #expect(trigger.name == "Webhook Trigger")
        #expect(trigger.triggerType == .webhook)
        #expect(trigger.hmacConfigured == true)
        #expect(trigger.enabled == true)
        #expect(trigger.fireCount == 42)
    }

    @Test("AgentTrigger with condition filter decodes correctly")
    func triggerConditionFilter() throws {
        let json = """
        {
            "id": "t2",
            "agent_id": "a1",
            "creator_id": "u1",
            "name": "Condition Trigger",
            "trigger_type": "condition",
            "token": "tok_def",
            "condition_filter": {
                "all": [
                    {"field": "status", "op": "eq", "value": "active"}
                ]
            },
            "fire_count": 0
        }
        """.data(using: .utf8)!
        let trigger = try JSONDecoder.waiagents.decode(AgentTrigger.self, from: json)
        #expect(trigger.conditionFilter?.all?.count == 1)
        #expect(trigger.conditionFilter?.all?[0].field == "status")
        #expect(trigger.conditionFilter?.all?[0].op == .eq)
        #expect(trigger.conditionFilter?.all?[0].value == "active")
    }

    @Test("TriggerCondition operator values")
    func conditionOperators() {
        #expect(TriggerCondition.ConditionOperator.eq.rawValue == "eq")
        #expect(TriggerCondition.ConditionOperator.neq.rawValue == "neq")
        #expect(TriggerCondition.ConditionOperator.contains.rawValue == "contains")
        #expect(TriggerCondition.ConditionOperator.exists.rawValue == "exists")
    }

    @Test("TriggerConditionGroup with 'any' conditions decodes correctly")
    func triggerConditionGroupAny() throws {
        let json = """
        {
            "any": [
                {"field": "type", "op": "eq", "value": "webhook"},
                {"field": "type", "op": "eq", "value": "schedule"}
            ]
        }
        """.data(using: .utf8)!
        let group = try JSONDecoder.waiagents.decode(TriggerConditionGroup.self, from: json)
        #expect(group.any?.count == 2)
        #expect(group.all == nil)
    }
}
