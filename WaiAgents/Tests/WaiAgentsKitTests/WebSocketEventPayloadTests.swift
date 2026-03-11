import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for WebSocket event enums, payload types, and the static
/// decodeConversationMessage helper on WebSocketClient.
/// Also covers Crew/Trigger event payloads and
/// WebSocketClient.ConnectionState.
@Suite("WebSocket Event Payloads")
struct WebSocketEventPayloadTests {

    private let encoder = JSONEncoder.waiagents
    private let decoder = JSONDecoder.waiagents

    // MARK: - Event Enum Raw Values

    @Suite("Event Raw Values")
    struct EventRawValueTests {

        @Test("ConversationClientEvent raw values")
        func conversationClientEvents() {
            #expect(ConversationClientEvent.newMessage.rawValue == "new_message")
            #expect(ConversationClientEvent.typing.rawValue == "typing")
            #expect(ConversationClientEvent.read.rawValue == "read")
            #expect(ConversationClientEvent.react.rawValue == "react")
        }

        @Test("ConversationServerEvent raw values")
        func conversationServerEvents() {
            #expect(ConversationServerEvent.newMessage.rawValue == "new_message")
            #expect(ConversationServerEvent.messageUpdated.rawValue == "message_updated")
            #expect(ConversationServerEvent.typing.rawValue == "typing")
            #expect(ConversationServerEvent.presenceState.rawValue == "presence_state")
            #expect(ConversationServerEvent.presenceDiff.rawValue == "presence_diff")
        }

        @Test("AgentClientEvent raw values")
        func agentClientEvents() {
            #expect(AgentClientEvent.approvalDecision.rawValue == "approval_decision")
        }

        @Test("AgentServerEvent raw values")
        func agentServerEvents() {
            #expect(AgentServerEvent.token.rawValue == "token")
            #expect(AgentServerEvent.status.rawValue == "status")
            #expect(AgentServerEvent.approvalRequested.rawValue == "approval_requested")
            #expect(AgentServerEvent.approvalGranted.rawValue == "approval_granted")
            #expect(AgentServerEvent.approvalDenied.rawValue == "approval_denied")
            #expect(AgentServerEvent.approvalRevoked.rawValue == "approval_revoked")
            #expect(AgentServerEvent.toolCall.rawValue == "tool_call")
            #expect(AgentServerEvent.toolResult.rawValue == "tool_result")
            #expect(AgentServerEvent.codeBlock.rawValue == "code_block")
            #expect(AgentServerEvent.complete.rawValue == "complete")
            #expect(AgentServerEvent.error.rawValue == "error")
        }

        @Test("UserServerEvent raw values")
        func userServerEvents() {
            #expect(UserServerEvent.notification.rawValue == "notification")
            #expect(UserServerEvent.bridgeStatus.rawValue == "bridge_status")
            #expect(UserServerEvent.conversationUpdated.rawValue == "conversation_updated")
        }

        @Test("CrewServerEvent raw values")
        func crewServerEvents() {
            #expect(CrewServerEvent.stepStarted.rawValue == "crew:step_started")
            #expect(CrewServerEvent.stepCompleted.rawValue == "crew:step_completed")
            #expect(CrewServerEvent.finished.rawValue == "crew:finished")
            #expect(CrewServerEvent.error.rawValue == "crew:error")
        }

        @Test("TriggerServerEvent raw values")
        func triggerServerEvents() {
            #expect(TriggerServerEvent.fired.rawValue == "trigger:fired")
        }
    }

    // MARK: - TypingPayload

    @Suite("TypingPayload")
    struct TypingPayloadTests {

        @Test("TypingPayload round-trip")
        func roundTrip() throws {
            let payload = TypingPayload(userID: "u1", isTyping: true)
            let data = try JSONEncoder.waiagents.encode(payload)
            let decoded = try JSONDecoder.waiagents.decode(TypingPayload.self, from: data)
            #expect(decoded.userID == "u1")
            #expect(decoded.isTyping == true)
        }

        @Test("TypingPayload with nil userID")
        func nilUserID() throws {
            let payload = TypingPayload(isTyping: false)
            let data = try JSONEncoder.waiagents.encode(payload)
            let decoded = try JSONDecoder.waiagents.decode(TypingPayload.self, from: data)
            #expect(decoded.userID == nil)
            #expect(decoded.isTyping == false)
        }
    }

    // MARK: - ApprovalRequestPayload

    @Suite("ApprovalRequestPayload")
    struct ApprovalRequestPayloadTests {

        @Test("ApprovalRequestPayload round-trip")
        func roundTrip() throws {
            let json = """
            {"requestId":"req_1","tool":"file_write","argsPreview":{"path":"/tmp/test.txt"},"scopes":["allow_once","allow_for_session"]}
            """
            let decoded = try JSONDecoder.waiagents.decode(ApprovalRequestPayload.self, from: Data(json.utf8))
            #expect(decoded.requestID == "req_1")
            #expect(decoded.tool == "file_write")
            #expect(decoded.scopes.count == 2)
            #expect(decoded.argsPreview != nil)
        }

        @Test("ApprovalRequestPayload with nil argsPreview")
        func nilArgsPreview() throws {
            let json = """
            {"requestId":"req_2","tool":"shell_exec","scopes":["allow_once"]}
            """
            let decoded = try JSONDecoder.waiagents.decode(ApprovalRequestPayload.self, from: Data(json.utf8))
            #expect(decoded.argsPreview == nil)
        }
    }

    // MARK: - ApprovalDecisionPayload

    @Suite("ApprovalDecisionPayload")
    struct ApprovalDecisionPayloadTests {

        @Test("ApprovalDecisionPayload round-trip with scope")
        func roundTripWithScope() throws {
            let payload = ApprovalDecisionPayload(
                requestID: "req_1",
                decision: "approve",
                scope: "allow_for_session"
            )
            let data = try JSONEncoder.waiagents.encode(payload)
            let decoded = try JSONDecoder.waiagents.decode(ApprovalDecisionPayload.self, from: data)
            #expect(decoded.requestID == "req_1")
            #expect(decoded.decision == "approve")
            #expect(decoded.scope == "allow_for_session")
        }

        @Test("ApprovalDecisionPayload with nil scope")
        func nilScope() throws {
            let payload = ApprovalDecisionPayload(requestID: "req_2", decision: "deny")
            let data = try JSONEncoder.waiagents.encode(payload)
            let decoded = try JSONDecoder.waiagents.decode(ApprovalDecisionPayload.self, from: data)
            #expect(decoded.scope == nil)
        }
    }

    // MARK: - BridgeStatusPayload

    @Suite("BridgeStatusPayload")
    struct BridgeStatusPayloadTests {

        @Test("BridgeStatusPayload round-trip")
        func roundTrip() throws {
            let json = """
            {"bridgeId":"br_1","status":"connected"}
            """
            let decoded = try JSONDecoder.waiagents.decode(BridgeStatusPayload.self, from: Data(json.utf8))
            #expect(decoded.bridgeID == "br_1")
            #expect(decoded.status == "connected")
        }
    }

    // MARK: - CodeBlockPayload

    @Suite("CodeBlockPayload")
    struct CodeBlockPayloadTests {

        @Test("CodeBlockPayload round-trip")
        func roundTrip() throws {
            let payload = CodeBlockPayload(language: "python", code: "print('hello')")
            let data = try JSONEncoder.waiagents.encode(payload)
            let decoded = try JSONDecoder.waiagents.decode(CodeBlockPayload.self, from: data)
            #expect(decoded.language == "python")
            #expect(decoded.code == "print('hello')")
        }
    }

    // MARK: - ToolCallPayload

    @Suite("ToolCallPayload")
    struct ToolCallPayloadTests {

        @Test("ToolCallPayload with args")
        func withArgs() throws {
            let json = """
            {"tool":"web_search","args":{"query":"swift testing"}}
            """
            let decoded = try JSONDecoder.waiagents.decode(ToolCallPayload.self, from: Data(json.utf8))
            #expect(decoded.tool == "web_search")
            #expect(decoded.args?["query"]?.stringValue == "swift testing")
        }

        @Test("ToolCallPayload with nil args")
        func nilArgs() throws {
            let json = """
            {"tool":"get_time"}
            """
            let decoded = try JSONDecoder.waiagents.decode(ToolCallPayload.self, from: Data(json.utf8))
            #expect(decoded.tool == "get_time")
            #expect(decoded.args == nil)
        }
    }

    // MARK: - ToolResultPayload

    @Suite("ToolResultPayload")
    struct ToolResultPayloadTests {

        @Test("ToolResultPayload with string result")
        func stringResult() throws {
            let json = """
            {"tool":"web_search","result":"Found 5 results"}
            """
            let decoded = try JSONDecoder.waiagents.decode(ToolResultPayload.self, from: Data(json.utf8))
            #expect(decoded.tool == "web_search")
            #expect(decoded.result.stringValue == "Found 5 results")
        }
    }

    // MARK: - ToolApprovalRequestPayload

    @Suite("ToolApprovalRequestPayload")
    struct ToolApprovalRequestPayloadTests {

        @Test("ToolApprovalRequestPayload round-trip")
        func roundTrip() throws {
            let payload = ToolApprovalRequestPayload(
                requestID: "tar_1",
                toolName: "code_execution",
                argsPreview: "Running test.py",
                scopes: ["allow_once", "always_for_agent_tool"]
            )
            let data = try JSONEncoder.waiagents.encode(payload)
            let decoded = try JSONDecoder.waiagents.decode(ToolApprovalRequestPayload.self, from: data)
            #expect(decoded.requestID == "tar_1")
            #expect(decoded.toolName == "code_execution")
            #expect(decoded.argsPreview == "Running test.py")
            #expect(decoded.scopes.count == 2)
        }
    }

    // MARK: - Crew Event Payloads

    @Suite("Crew Event Payloads")
    struct CrewEventPayloadTests {

        @Test("CrewStepStartedPayload round-trip")
        func stepStarted() throws {
            let json = """
            {"crewId":"cr_1","stepIndex":0,"agentId":"a_1","role":"researcher"}
            """
            let decoded = try JSONDecoder.waiagents.decode(CrewStepStartedPayload.self, from: Data(json.utf8))
            #expect(decoded.crewID == "cr_1")
            #expect(decoded.stepIndex == 0)
            #expect(decoded.agentID == "a_1")
            #expect(decoded.role == "researcher")
            #expect(decoded.parallelGroup == nil)
        }

        @Test("CrewStepStartedPayload with parallelGroup")
        func stepStartedParallel() throws {
            let json = """
            {"crewId":"cr_1","stepIndex":1,"agentId":"a_2","role":"writer","parallelGroup":"group_a"}
            """
            let decoded = try JSONDecoder.waiagents.decode(CrewStepStartedPayload.self, from: Data(json.utf8))
            #expect(decoded.parallelGroup == "group_a")
        }

        @Test("CrewStepCompletedPayload round-trip")
        func stepCompleted() throws {
            let json = """
            {"crewId":"cr_1","stepIndex":0,"agentId":"a_1","role":"researcher","response":"Found relevant data."}
            """
            let decoded = try JSONDecoder.waiagents.decode(CrewStepCompletedPayload.self, from: Data(json.utf8))
            #expect(decoded.response == "Found relevant data.")
        }

        @Test("CrewFinishedPayload round-trip")
        func finished() throws {
            let json = """
            {"crewId":"cr_1","totalSteps":3,"finalResponse":"Here is the final report."}
            """
            let decoded = try JSONDecoder.waiagents.decode(CrewFinishedPayload.self, from: Data(json.utf8))
            #expect(decoded.crewID == "cr_1")
            #expect(decoded.totalSteps == 3)
            #expect(decoded.finalResponse == "Here is the final report.")
        }

        @Test("CrewErrorPayload round-trip with stepIndex")
        func errorWithStep() throws {
            let json = """
            {"crewId":"cr_1","error":"Agent timed out","stepIndex":2}
            """
            let decoded = try JSONDecoder.waiagents.decode(CrewErrorPayload.self, from: Data(json.utf8))
            #expect(decoded.error == "Agent timed out")
            #expect(decoded.stepIndex == 2)
        }

        @Test("CrewErrorPayload with nil stepIndex")
        func errorNoStep() throws {
            let json = """
            {"crewId":"cr_1","error":"Unknown error"}
            """
            let decoded = try JSONDecoder.waiagents.decode(CrewErrorPayload.self, from: Data(json.utf8))
            #expect(decoded.stepIndex == nil)
        }
    }

    // MARK: - TriggerFiredPayload

    @Suite("TriggerFiredPayload")
    struct TriggerFiredPayloadTests {

        @Test("TriggerFiredPayload round-trip")
        func roundTrip() throws {
            let json = """
            {"triggerId":"t_1","agentId":"a_1","triggerType":"webhook","conversationId":"conv_1","firedAt":"2024-06-15T10:00:00Z"}
            """
            let decoded = try JSONDecoder.waiagents.decode(TriggerFiredPayload.self, from: data(json))
            #expect(decoded.triggerID == "t_1")
            #expect(decoded.triggerType == "webhook")
            #expect(decoded.conversationID == "conv_1")
        }

        private func data(_ str: String) -> Data { Data(str.utf8) }
    }

    // MARK: - WebSocketClient.decodeConversationMessage

    @Suite("decodeConversationMessage")
    struct DecodeConversationMessageTests {

        @Test("Decodes direct message payload")
        func directPayload() {
            let payload: [String: Any] = [
                "id": "m_1",
                "conversationId": "conv_1",
                "senderId": "u_1",
                "senderType": "human",
                "type": "text",
                "content": ["text": "Hello"],
                "createdAt": "2024-01-15T10:00:00Z"
            ]
            let message = WebSocketClient.decodeConversationMessage(payload: payload)
            #expect(message != nil)
            #expect(message?.id == "m_1")
            #expect(message?.content.text == "Hello")
        }

        @Test("Decodes wrapped message payload")
        func wrappedPayload() {
            let payload: [String: Any] = [
                "message": [
                    "id": "m_2",
                    "conversationId": "conv_1",
                    "senderId": "u_2",
                    "senderType": "agent",
                    "type": "text",
                    "content": ["text": "Hi back"],
                    "createdAt": "2024-01-15T10:00:05Z"
                ]
            ]
            let message = WebSocketClient.decodeConversationMessage(payload: payload)
            #expect(message != nil)
            #expect(message?.id == "m_2")
        }

        @Test("Returns nil for completely invalid payload")
        func invalidPayload() {
            let payload: [String: Any] = [
                "random_key": "random_value",
                "number": 42
            ]
            let message = WebSocketClient.decodeConversationMessage(payload: payload)
            #expect(message == nil)
        }

        @Test("Returns nil for empty payload")
        func emptyPayload() {
            let message = WebSocketClient.decodeConversationMessage(payload: [:])
            #expect(message == nil)
        }
    }

    // MARK: - ConnectionState

    @Suite("ConnectionState")
    struct ConnectionStateTests {

        @Test("ConnectionState raw values")
        func rawValues() {
            #expect(WebSocketClient.ConnectionState.connecting.rawValue == "connecting")
            #expect(WebSocketClient.ConnectionState.connected.rawValue == "connected")
            #expect(WebSocketClient.ConnectionState.disconnected.rawValue == "disconnected")
        }
    }
}
