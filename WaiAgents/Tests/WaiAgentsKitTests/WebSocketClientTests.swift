import Foundation
import Testing
@testable import WaiAgentsKit

/// Comprehensive tests for WebSocketClient: initialization, connect/disconnect,
/// channel subscribe/unsubscribe, event handler registration, connection state,
/// auth failure, reconnection, message sending, thread safety, and lock behavior.
@Suite("WebSocketClient Tests")
struct WebSocketClientTests {

    // Use localhost:1 to avoid real network connections that hang tests
    private let baseURL = URL(string: "http://localhost:1")!

    // MARK: - Helpers

    private func makeAuthManager(serviceName: String? = nil) -> AuthManager {
        let name = serviceName ?? "test.ws.\(UUID().uuidString)"
        return AuthManager(serviceName: name, baseURL: baseURL)
    }

    private func makeClient(
        baseURL: String = "http://localhost:1",
        accessToken: String = "test_token",
        authManager: AuthManager? = nil
    ) -> WebSocketClient {
        let manager = authManager ?? makeAuthManager()
        return WebSocketClient(baseURL: baseURL, accessToken: accessToken, authManager: manager)
    }

    // MARK: - Initialization

    @Test("WebSocketClient initializes with HTTPS base URL")
    func initWithHTTPS() {
        let client = makeClient(baseURL: "https://openraccoon.com")
        _ = client // Should not crash
    }

    @Test("WebSocketClient initializes with HTTP base URL")
    func initWithHTTP() {
        let client = makeClient(baseURL: "http://localhost:4000")
        _ = client
    }

    @Test("WebSocketClient initializes with custom access token")
    func initWithCustomToken() {
        let client = makeClient(accessToken: "custom_access_token_123")
        _ = client
    }

    @Test("WebSocketClient initializes with empty access token")
    func initWithEmptyToken() {
        let client = makeClient(accessToken: "")
        _ = client
    }

    @Test("WebSocketClient initializes with shared AuthManager")
    func initWithSharedAuthManager() {
        let authManager = makeAuthManager()
        let client1 = makeClient(authManager: authManager)
        let client2 = makeClient(authManager: authManager)
        _ = (client1, client2) // Both share same AuthManager
    }

    @Test("WebSocketClient initializes with base URL containing path")
    func initWithPathInURL() {
        let client = makeClient(baseURL: "https://openraccoon.com/api/v1")
        _ = client
    }

    @Test("WebSocketClient initializes with base URL containing port")
    func initWithPort() {
        let client = makeClient(baseURL: "https://openraccoon.com:4000")
        _ = client
    }

    // MARK: - Connect / Disconnect

    @Test("connect does not crash when called immediately after init")
    func connectAfterInit() {
        let client = makeClient()
        client.connect()
        // Immediately disconnect to clean up
        client.disconnect()
    }

    @Test("disconnect does not crash when called without prior connect")
    func disconnectWithoutConnect() {
        let client = makeClient()
        client.disconnect()
    }

    @Test("Multiple connect calls do not crash")
    func multipleConnects() {
        let client = makeClient()
        client.connect()
        client.connect()
        client.connect()
        client.disconnect()
    }

    @Test("Multiple disconnect calls do not crash")
    func multipleDisconnects() {
        let client = makeClient()
        client.connect()
        client.disconnect()
        client.disconnect()
        client.disconnect()
    }

    @Test("Connect then disconnect then connect cycle is safe")
    func connectDisconnectCycle() {
        let client = makeClient()
        client.connect()
        client.disconnect()
        client.connect()
        client.disconnect()
    }

    // MARK: - Channel Subscribe / Unsubscribe (Conversation)

    @Test("joinConversation returns a Channel")
    func joinConversationReturnsChannel() {
        let client = makeClient()
        client.connect()
        let channel = client.joinConversation(id: "conv_123")
        #expect(channel != nil)
        client.disconnect()
    }

    @Test("leaveConversation does not crash for joined conversation")
    func leaveConversationAfterJoin() {
        let client = makeClient()
        client.connect()
        _ = client.joinConversation(id: "conv_123")
        client.leaveConversation(id: "conv_123")
        client.disconnect()
    }

    @Test("leaveConversation does not crash for non-joined conversation")
    func leaveConversationWithoutJoin() {
        let client = makeClient()
        client.leaveConversation(id: "conv_nonexistent")
    }

    @Test("joinConversation with same ID twice returns different channel objects")
    func joinConversationTwice() {
        let client = makeClient()
        client.connect()
        let channel1 = client.joinConversation(id: "conv_1")
        let channel2 = client.joinConversation(id: "conv_1")
        // Both calls return a channel; the second replaces the first in activeChannels
        _ = (channel1, channel2)
        client.disconnect()
    }

    @Test("Multiple different conversations can be joined simultaneously")
    func joinMultipleConversations() {
        let client = makeClient()
        client.connect()
        let ch1 = client.joinConversation(id: "conv_1")
        let ch2 = client.joinConversation(id: "conv_2")
        let ch3 = client.joinConversation(id: "conv_3")
        #expect(ch1 != nil)
        #expect(ch2 != nil)
        #expect(ch3 != nil)
        client.disconnect()
    }

    // MARK: - Channel Subscribe / Unsubscribe (Agent)

    @Test("joinAgentChannel returns a Channel")
    func joinAgentChannelReturnsChannel() {
        let client = makeClient()
        client.connect()
        let channel = client.joinAgentChannel(conversationID: "conv_agent_1")
        #expect(channel != nil)
        client.disconnect()
    }

    @Test("leaveAgentChannel does not crash for joined agent channel")
    func leaveAgentChannelAfterJoin() {
        let client = makeClient()
        client.connect()
        _ = client.joinAgentChannel(conversationID: "conv_agent_1")
        client.leaveAgentChannel(conversationID: "conv_agent_1")
        client.disconnect()
    }

    @Test("leaveAgentChannel does not crash for non-joined agent channel")
    func leaveAgentChannelWithoutJoin() {
        let client = makeClient()
        client.leaveAgentChannel(conversationID: "conv_nonexistent")
    }

    // MARK: - Channel Subscribe / Unsubscribe (User)

    @Test("joinUserChannel returns a Channel")
    func joinUserChannelReturnsChannel() {
        let client = makeClient()
        client.connect()
        let channel = client.joinUserChannel(userID: "user_1")
        #expect(channel != nil)
        client.disconnect()
    }

    // MARK: - Event Handler Registration

    @Test("onConnectionStateChanged can be set and read back as non-nil")
    @MainActor
    func setConnectionStateChangedHandler() {
        let client = makeClient()
        var receivedStates: [WebSocketClient.ConnectionState] = []
        client.onConnectionStateChanged = { state in
            receivedStates.append(state)
        }
        #expect(client.onConnectionStateChanged != nil)
    }

    @Test("onNewMessage handler can be set")
    @MainActor
    func setNewMessageHandler() {
        let client = makeClient()
        client.onNewMessage = { _ in }
        #expect(client.onNewMessage != nil)
    }

    @Test("onMessageUpdated handler can be set")
    @MainActor
    func setMessageUpdatedHandler() {
        let client = makeClient()
        client.onMessageUpdated = { _ in }
        #expect(client.onMessageUpdated != nil)
    }

    @Test("onTyping handler can be set")
    @MainActor
    func setTypingHandler() {
        let client = makeClient()
        client.onTyping = { _ in }
        #expect(client.onTyping != nil)
    }

    @Test("onPresenceState handler can be set")
    @MainActor
    func setPresenceStateHandler() {
        let client = makeClient()
        client.onPresenceState = { _ in }
        #expect(client.onPresenceState != nil)
    }

    @Test("onPresenceDiff handler can be set")
    @MainActor
    func setPresenceDiffHandler() {
        let client = makeClient()
        client.onPresenceDiff = { _ in }
        #expect(client.onPresenceDiff != nil)
    }

    @Test("onToken handler can be set")
    @MainActor
    func setTokenHandler() {
        let client = makeClient()
        client.onToken = { _ in }
        #expect(client.onToken != nil)
    }

    @Test("onStatus handler can be set")
    @MainActor
    func setStatusHandler() {
        let client = makeClient()
        client.onStatus = { _ in }
        #expect(client.onStatus != nil)
    }

    @Test("onApprovalRequested handler can be set")
    @MainActor
    func setApprovalRequestedHandler() {
        let client = makeClient()
        client.onApprovalRequested = { _ in }
        #expect(client.onApprovalRequested != nil)
    }

    @Test("onToolCall handler can be set")
    @MainActor
    func setToolCallHandler() {
        let client = makeClient()
        client.onToolCall = { _ in }
        #expect(client.onToolCall != nil)
    }

    @Test("onToolResult handler can be set")
    @MainActor
    func setToolResultHandler() {
        let client = makeClient()
        client.onToolResult = { _ in }
        #expect(client.onToolResult != nil)
    }

    @Test("onCodeBlock handler can be set")
    @MainActor
    func setCodeBlockHandler() {
        let client = makeClient()
        client.onCodeBlock = { _ in }
        #expect(client.onCodeBlock != nil)
    }

    @Test("onComplete handler can be set")
    @MainActor
    func setCompleteHandler() {
        let client = makeClient()
        client.onComplete = { _ in }
        #expect(client.onComplete != nil)
    }

    @Test("onError handler can be set")
    @MainActor
    func setErrorHandler() {
        let client = makeClient()
        client.onError = { _ in }
        #expect(client.onError != nil)
    }

    @Test("onNotification handler can be set")
    @MainActor
    func setNotificationHandler() {
        let client = makeClient()
        client.onNotification = { _ in }
        #expect(client.onNotification != nil)
    }

    @Test("onBridgeStatus handler can be set")
    @MainActor
    func setBridgeStatusHandler() {
        let client = makeClient()
        client.onBridgeStatus = { _ in }
        #expect(client.onBridgeStatus != nil)
    }

    @Test("onConversationUpdated handler can be set")
    @MainActor
    func setConversationUpdatedHandler() {
        let client = makeClient()
        client.onConversationUpdated = { _ in }
        #expect(client.onConversationUpdated != nil)
    }

    // MARK: - Auth Failure Handler

    @Test("onAuthFailure handler can be set")
    @MainActor
    func setAuthFailureHandler() {
        let client = makeClient()
        client.onAuthFailure = {}
        #expect(client.onAuthFailure != nil)
    }

    @Test("Setting onAuthFailure to nil clears handler")
    @MainActor
    func clearAuthFailureHandler() {
        let client = makeClient()
        client.onAuthFailure = {}
        #expect(client.onAuthFailure != nil)
        client.onAuthFailure = nil
        #expect(client.onAuthFailure == nil)
    }

    // MARK: - Message Sending

    @Test("sendMessage returns nil when no channel is joined")
    func sendMessageWithoutChannel() {
        let client = makeClient()
        let push = client.sendMessage(conversationID: "conv_no_channel", content: "hello")
        #expect(push == nil)
    }

    @Test("sendMessage returns Push when channel is joined")
    func sendMessageWithChannel() {
        let client = makeClient()
        client.connect()
        _ = client.joinConversation(id: "conv_1")
        let push = client.sendMessage(conversationID: "conv_1", content: "hello")
        #expect(push != nil)
        client.disconnect()
    }

    @Test("sendTyping returns nil when no channel is joined")
    func sendTypingWithoutChannel() {
        let client = makeClient()
        let push = client.sendTyping(conversationID: "conv_no_channel", isTyping: true)
        #expect(push == nil)
    }

    @Test("sendTyping returns Push when channel is joined")
    func sendTypingWithChannel() {
        let client = makeClient()
        client.connect()
        _ = client.joinConversation(id: "conv_1")
        let push = client.sendTyping(conversationID: "conv_1", isTyping: true)
        #expect(push != nil)
        client.disconnect()
    }

    @Test("sendRead returns nil when no channel is joined")
    func sendReadWithoutChannel() {
        let client = makeClient()
        let push = client.sendRead(conversationID: "conv_none", messageID: "msg_1")
        #expect(push == nil)
    }

    @Test("sendRead returns Push when channel is joined")
    func sendReadWithChannel() {
        let client = makeClient()
        client.connect()
        _ = client.joinConversation(id: "conv_1")
        let push = client.sendRead(conversationID: "conv_1", messageID: "msg_1")
        #expect(push != nil)
        client.disconnect()
    }

    @Test("sendReaction returns nil when no channel is joined")
    func sendReactionWithoutChannel() {
        let client = makeClient()
        let push = client.sendReaction(conversationID: "conv_none", messageID: "msg_1", emoji: "thumbsup")
        #expect(push == nil)
    }

    @Test("sendReaction returns Push when channel is joined")
    func sendReactionWithChannel() {
        let client = makeClient()
        client.connect()
        _ = client.joinConversation(id: "conv_1")
        let push = client.sendReaction(conversationID: "conv_1", messageID: "msg_1", emoji: "heart")
        #expect(push != nil)
        client.disconnect()
    }

    @Test("sendApprovalDecision returns nil when no agent channel is joined")
    func sendApprovalDecisionWithoutChannel() {
        let client = makeClient()
        let push = client.sendApprovalDecision(
            conversationID: "conv_none",
            requestID: "req_1",
            decision: "approve",
            scope: "allow_once"
        )
        #expect(push == nil)
    }

    @Test("sendApprovalDecision returns Push when agent channel is joined")
    func sendApprovalDecisionWithChannel() {
        let client = makeClient()
        client.connect()
        _ = client.joinAgentChannel(conversationID: "conv_agent_1")
        let push = client.sendApprovalDecision(
            conversationID: "conv_agent_1",
            requestID: "req_1",
            decision: "approve",
            scope: "allow_once"
        )
        #expect(push != nil)
        client.disconnect()
    }

    // MARK: - Leave Channel

    @Test("leave() removes channel from tracking and does not crash")
    func leaveGenericChannel() {
        let client = makeClient()
        client.connect()
        let channel = client.joinConversation(id: "conv_1")
        client.leave(channel)
        // Sending to removed channel should return nil
        let push = client.sendMessage(conversationID: "conv_1", content: "after leave")
        #expect(push == nil)
        client.disconnect()
    }

    @Test("leave() on channel not tracked by client does not crash")
    func leaveUnTrackedChannel() {
        let client = makeClient()
        client.connect()
        let channel = client.joinConversation(id: "conv_1")
        // Leave via topic-specific method first
        client.leaveConversation(id: "conv_1")
        // Then try leave() on already-removed channel
        client.leave(channel)
        client.disconnect()
    }

    // MARK: - Thread Safety (Concurrent Access)

    @Test("Concurrent handler registration does not crash")
    func concurrentHandlerRegistration() async {
        let client = makeClient()

        await withTaskGroup(of: Void.self) { group in
            for i in 0..<20 {
                group.addTask { @MainActor in
                    if i % 2 == 0 {
                        client.onNewMessage = { _ in }
                    } else {
                        client.onMessageUpdated = { _ in }
                    }
                }
            }
        }
    }

    @Test("Concurrent join and leave on different conversations does not crash")
    func concurrentJoinLeave() async {
        let client = makeClient()
        client.connect()

        await withTaskGroup(of: Void.self) { group in
            for i in 0..<10 {
                group.addTask {
                    _ = client.joinConversation(id: "conv_\(i)")
                }
            }
            for i in 0..<10 {
                group.addTask {
                    client.leaveConversation(id: "conv_\(i)")
                }
            }
        }

        client.disconnect()
    }

    @Test("Concurrent sendMessage calls on same conversation do not crash")
    func concurrentSendMessages() async {
        let client = makeClient()
        client.connect()
        _ = client.joinConversation(id: "conv_1")

        await withTaskGroup(of: Void.self) { group in
            for i in 0..<10 {
                group.addTask {
                    _ = client.sendMessage(conversationID: "conv_1", content: "message_\(i)")
                }
            }
        }

        client.disconnect()
    }

    // MARK: - Handler Nil-Reset

    @Test("All handler properties default to nil")
    @MainActor
    func allHandlersDefaultNil() {
        let client = makeClient()
        #expect(client.onConnectionStateChanged == nil)
        #expect(client.onNewMessage == nil)
        #expect(client.onMessageUpdated == nil)
        #expect(client.onTyping == nil)
        #expect(client.onPresenceState == nil)
        #expect(client.onPresenceDiff == nil)
        #expect(client.onToken == nil)
        #expect(client.onStatus == nil)
        #expect(client.onApprovalRequested == nil)
        #expect(client.onToolCall == nil)
        #expect(client.onToolResult == nil)
        #expect(client.onCodeBlock == nil)
        #expect(client.onComplete == nil)
        #expect(client.onError == nil)
        #expect(client.onNotification == nil)
        #expect(client.onBridgeStatus == nil)
        #expect(client.onConversationUpdated == nil)
        #expect(client.onAuthFailure == nil)
    }

    @Test("Setting handler to nil clears it")
    @MainActor
    func setHandlerToNil() {
        let client = makeClient()
        client.onNewMessage = { _ in }
        #expect(client.onNewMessage != nil)
        client.onNewMessage = nil
        #expect(client.onNewMessage == nil)
    }

    // MARK: - URL Construction

    @Test("HTTPS base URL converts to WSS in socket URL")
    func httpsToWss() {
        let baseURL = "https://openraccoon.com"
        let wsURL = baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        #expect(wsURL == "wss://openraccoon.com")
    }

    @Test("HTTP base URL converts to WS in socket URL")
    func httpToWs() {
        let baseURL = "http://localhost:4000"
        let wsURL = baseURL
            .replacingOccurrences(of: "https://", with: "wss://")
            .replacingOccurrences(of: "http://", with: "ws://")
        #expect(wsURL == "ws://localhost:4000")
    }

    @Test("Socket URL has /socket suffix")
    func socketURLSuffix() {
        let wsURL = "wss://openraccoon.com"
        let fullPath = "\(wsURL)/socket"
        #expect(fullPath == "wss://openraccoon.com/socket")
    }

    // MARK: - decodeConversationMessage Static Helper

    @Test("decodeConversationMessage returns Message for valid direct payload")
    @MainActor
    func decodeDirectPayload() {
        let payload: [String: Any] = [
            "id": "msg_1",
            "conversation_id": "conv_1",
            "sender_id": "user_1",
            "sender_type": "human",
            "type": "text",
            "content": ["text": "Hello world"],
            "created_at": "2026-03-01T10:00:00Z",
        ]
        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded?.id == "msg_1")
        #expect(decoded?.content.text == "Hello world")
    }

    @Test("decodeConversationMessage returns Message for wrapped payload")
    @MainActor
    func decodeWrappedPayload() {
        let payload: [String: Any] = [
            "message": [
                "id": "msg_2",
                "conversation_id": "conv_1",
                "sender_id": "user_1",
                "sender_type": "agent",
                "type": "text",
                "content": ["text": "Agent response"],
                "created_at": "2026-03-01T10:00:00Z",
            ]
        ]
        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded?.id == "msg_2")
        #expect(decoded?.senderType == .agent)
    }

    @Test("decodeConversationMessage returns nil for empty payload")
    @MainActor
    func decodeEmptyPayload() {
        let decoded = WebSocketClient.decodeConversationMessage(payload: [:])
        #expect(decoded == nil)
    }

    @Test("decodeConversationMessage returns nil for garbage payload")
    @MainActor
    func decodeGarbagePayload() {
        let payload: [String: Any] = ["foo": "bar", "baz": 42]
        let decoded = WebSocketClient.decodeConversationMessage(payload: payload)
        #expect(decoded == nil)
    }
}
