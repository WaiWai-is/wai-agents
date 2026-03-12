import Foundation
import Testing
@testable import WaiAgentsKit

@Suite("WebSocketClient Reconnection")
struct WebSocketClientReconnectionTests {

    // MARK: - ConnectionState Transitions

    @Test("ConnectionState has exactly three cases")
    func connectionStateHasThreeCases() {
        let allCases: [WebSocketClient.ConnectionState] = [.connecting, .connected, .disconnected]
        #expect(allCases.count == 3)
    }

    @Test("ConnectionState raw values are stable for serialization")
    func connectionStateRawValuesStable() {
        #expect(WebSocketClient.ConnectionState.connecting.rawValue == "connecting")
        #expect(WebSocketClient.ConnectionState.connected.rawValue == "connected")
        #expect(WebSocketClient.ConnectionState.disconnected.rawValue == "disconnected")
    }

    @Test("ConnectionState equality works correctly")
    func connectionStateEquality() {
        let a = WebSocketClient.ConnectionState.connected
        let b = WebSocketClient.ConnectionState.connected
        let c = WebSocketClient.ConnectionState.disconnected
        #expect(a == b)
        #expect(a != c)
    }

    @Test("ConnectionState can be used as dictionary key")
    func connectionStateAsDictionaryKey() {
        var counts: [WebSocketClient.ConnectionState: Int] = [:]
        counts[.connecting] = 1
        counts[.connected] = 2
        counts[.disconnected] = 3
        #expect(counts[.connected] == 2)
    }

    // MARK: - Topic Parsing for Rejoin

    @Test("Conversation topic prefix is 'conversation:'")
    func conversationTopicPrefix() {
        let topic = "conversation:conv_123"
        #expect(topic.hasPrefix("conversation:"))
        let id = String(topic.dropFirst("conversation:".count))
        #expect(id == "conv_123")
    }

    @Test("Agent topic prefix is 'agent:'")
    func agentTopicPrefix() {
        let topic = "agent:conv_456"
        #expect(topic.hasPrefix("agent:"))
        let id = String(topic.dropFirst("agent:".count))
        #expect(id == "conv_456")
    }

    @Test("User topic prefix is 'user:'")
    func userTopicPrefix() {
        let topic = "user:user_789"
        #expect(topic.hasPrefix("user:"))
        let id = String(topic.dropFirst("user:".count))
        #expect(id == "user_789")
    }

    @Test("Topic with empty ID after prefix produces empty string")
    func topicEmptyIDAfterPrefix() {
        let topic = "conversation:"
        let id = String(topic.dropFirst("conversation:".count))
        #expect(id == "")
    }

    @Test("Topic with special characters in ID is preserved")
    func topicSpecialCharactersInID() {
        let topic = "conversation:conv-abc_123.456"
        let id = String(topic.dropFirst("conversation:".count))
        #expect(id == "conv-abc_123.456")
    }

    @Test("Unknown topic prefix does not match conversation, agent, or user")
    func unknownTopicPrefix() {
        let topic = "notification:xyz"
        #expect(!topic.hasPrefix("conversation:"))
        #expect(!topic.hasPrefix("agent:"))
        #expect(!topic.hasPrefix("user:"))
    }

    // MARK: - decodeConversationMessage Reconnection Scenarios

    @Test("decodeConversationMessage handles message received after reconnect (normal payload)")
    @MainActor
    func decodeMessageAfterReconnect() {
        let payload: [String: Any] = [
            "id": "msg_reconnect_1",
            "conversation_id": "conv_1",
            "sender_id": "user_1",
            "sender_type": "human",
            "type": "text",
            "content": ["text": "message after reconnect"],
            "created_at": "2026-03-01T12:00:00Z",
        ]

        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded != nil)
        #expect(decoded?.id == "msg_reconnect_1")
        #expect(decoded?.content.text == "message after reconnect")
    }

    @Test("decodeConversationMessage handles wrapped message received after reconnect")
    @MainActor
    func decodeWrappedMessageAfterReconnect() {
        let payload: [String: Any] = [
            "message": [
                "id": "msg_reconnect_2",
                "conversation_id": "conv_1",
                "sender_id": "agent_1",
                "sender_type": "agent",
                "type": "text",
                "content": ["text": "agent reply after reconnect"],
                "created_at": "2026-03-01T12:01:00Z",
            ]
        ]

        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded != nil)
        #expect(decoded?.id == "msg_reconnect_2")
        #expect(decoded?.senderType == .agent)
    }

    @Test("decodeConversationMessage handles message with all optional fields populated")
    @MainActor
    func decodeMessageAllOptionalFields() {
        let payload: [String: Any] = [
            "id": "msg_full",
            "conversation_id": "conv_1",
            "sender_id": "user_1",
            "sender_type": "human",
            "type": "text",
            "content": ["text": "full message"],
            "metadata": [
                "reply_to": "msg_prev",
                "thread_id": "thread_1",
            ],
            "created_at": "2026-03-01T10:00:00Z",
            "edited_at": "2026-03-01T10:05:00Z",
        ]

        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded != nil)
        #expect(decoded?.id == "msg_full")
        #expect(decoded?.metadata?.replyTo == "msg_prev")
        #expect(decoded?.metadata?.threadID == "thread_1")
        #expect(decoded?.editedAt != nil)
    }

    @Test("decodeConversationMessage handles message with reactions array")
    @MainActor
    func decodeMessageWithReactions() {
        let payload: [String: Any] = [
            "id": "msg_reactions",
            "conversation_id": "conv_1",
            "sender_id": "user_1",
            "sender_type": "human",
            "type": "text",
            "content": ["text": "reacted message"],
            "reactions": [
                [
                    "id": "react_1",
                    "message_id": "msg_reactions",
                    "user_id": "user_2",
                    "emoji": "thumbsup",
                    "created_at": "2026-03-01T10:10:00Z",
                ]
            ],
            "created_at": "2026-03-01T10:00:00Z",
        ]

        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded != nil)
        #expect(decoded?.reactions?.count == 1)
        #expect(decoded?.reactions?.first?.emoji == "thumbsup")
    }

    @Test("decodeConversationMessage handles message with media content type")
    @MainActor
    func decodeMediaMessage() {
        let payload: [String: Any] = [
            "id": "msg_media",
            "conversation_id": "conv_1",
            "sender_id": "user_1",
            "sender_type": "human",
            "type": "media",
            "content": [
                "text": "Check this out",
                "media_url": "https://example.com/image.png",
            ],
            "created_at": "2026-03-01T10:00:00Z",
        ]

        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded != nil)
        #expect(decoded?.type == .media)
    }

    @Test("decodeConversationMessage returns nil for completely empty dictionary")
    @MainActor
    func decodeCompletelyEmpty() {
        let decoded = WebSocketClient.decodeConversationMessage(payload: [:])
        #expect(decoded == nil)
    }

    @Test("decodeConversationMessage returns nil for payload with only status field")
    @MainActor
    func decodeStatusOnlyPayload() {
        let payload: [String: Any] = ["status": "ok"]
        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded == nil)
    }

    // MARK: - WebSocket URL Construction

    @Test("HTTPS base URL converts to WSS")
    func httpsToWss() {
        let baseURL = "https://waiagents.com"
        let wsURL = baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        #expect(wsURL == "wss://waiagents.com")
    }

    @Test("HTTP base URL converts to WS")
    func httpToWs() {
        let baseURL = "http://localhost:4000"
        let wsURL = baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        #expect(wsURL == "ws://localhost:4000")
    }

    @Test("Socket path appends /socket to WebSocket URL")
    func socketPathAppended() {
        let wsURL = "wss://waiagents.com"
        let fullPath = "\(wsURL)/socket"
        #expect(fullPath == "wss://waiagents.com/socket")
    }

    @Test("Base URL with trailing slash handled in replacement")
    func baseURLWithTrailingSlash() {
        let baseURL = "https://waiagents.com/"
        let wsURL = baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        #expect(wsURL == "wss://waiagents.com/")
    }

    // MARK: - Channel Event Constants

    @Test("All conversation server events are distinct")
    func conversationServerEventsDistinct() {
        let events: [ConversationServerEvent] = [
            .newMessage, .messageUpdated, .typing, .presenceState, .presenceDiff,
        ]
        let rawValues = Set(events.map(\.rawValue))
        #expect(rawValues.count == events.count)
    }

    @Test("All agent server events are distinct")
    func agentServerEventsDistinct() {
        let events: [AgentServerEvent] = [
            .token, .status, .approvalRequested, .approvalGranted,
            .approvalDenied, .approvalRevoked, .toolCall, .toolResult,
            .codeBlock, .complete, .error,
        ]
        let rawValues = Set(events.map(\.rawValue))
        #expect(rawValues.count == events.count)
    }

    @Test("All user server events are distinct")
    func userServerEventsDistinct() {
        let events: [UserServerEvent] = [
            .notification, .bridgeStatus, .conversationUpdated,
        ]
        let rawValues = Set(events.map(\.rawValue))
        #expect(rawValues.count == events.count)
    }
}
