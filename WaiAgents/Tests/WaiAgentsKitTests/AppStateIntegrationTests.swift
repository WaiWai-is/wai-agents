import Foundation
import Testing
@testable import WaiAgentsKit

/// Integration-level tests for AppState: initialization, connectWebSocket,
/// disconnectWebSocket, login/logout flow, WebSocket reconnection on auth failure,
/// rapid connect/disconnect, state persistence, error handling, and restore session.
@Suite("AppState Integration Tests")
struct AppStateIntegrationTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    @MainActor
    private func makeAppState(baseURL: URL? = nil) -> AppState {
        AppState(baseURL: baseURL ?? self.baseURL)
    }

    private func makeUser(
        id: String = "user_1",
        username: String = "testuser"
    ) -> User {
        User(id: id, username: username)
    }

    // MARK: - Initialization

    @Test("AppState initializes with nil currentUser")
    @MainActor
    func initCurrentUserNil() {
        let state = makeAppState()
        #expect(state.currentUser == nil)
    }

    @Test("AppState initializes with isAuthenticated false")
    @MainActor
    func initIsAuthenticatedFalse() {
        let state = makeAppState()
        #expect(state.isAuthenticated == false)
    }

    @Test("AppState initializes with disconnected connectionState")
    @MainActor
    func initConnectionDisconnected() {
        let state = makeAppState()
        #expect(state.connectionState == .disconnected)
    }

    @Test("AppState initializes with nil webSocketClient")
    @MainActor
    func initWebSocketClientNil() {
        let state = makeAppState()
        #expect(state.webSocketClient == nil)
    }

    @Test("AppState initializes with nil selectedConversationID")
    @MainActor
    func initSelectedConversationNil() {
        let state = makeAppState()
        #expect(state.selectedConversationID == nil)
    }

    @Test("AppState initializes with nil selectedFeedItemID")
    @MainActor
    func initSelectedFeedItemIDNil() {
        let state = makeAppState()
        #expect(state.selectedFeedItemID == nil)
    }

    @Test("AppState initializes with nil selectedFeedItem")
    @MainActor
    func initSelectedFeedItemNil() {
        let state = makeAppState()
        #expect(state.selectedFeedItem == nil)
    }

    @Test("AppState initializes with nil selectedMarketplaceAgent")
    @MainActor
    func initSelectedMarketplaceAgentNil() {
        let state = makeAppState()
        #expect(state.selectedMarketplaceAgent == nil)
    }

    @Test("AppState initializes with isWorkspaceOpen false")
    @MainActor
    func initIsWorkspaceOpenFalse() {
        let state = makeAppState()
        #expect(state.isWorkspaceOpen == false)
    }

    @Test("AppState initializes with nil feedViewModel")
    @MainActor
    func initFeedViewModelNil() {
        let state = makeAppState()
        #expect(state.feedViewModel == nil)
    }

    @Test("AppState initializes with nil marketplaceViewModel")
    @MainActor
    func initMarketplaceViewModelNil() {
        let state = makeAppState()
        #expect(state.marketplaceViewModel == nil)
    }

    @Test("AppState can be initialized with custom base URL")
    @MainActor
    func initCustomBaseURL() {
        let state = makeAppState(baseURL: URL(string: "https://staging.openraccoon.com")!)
        #expect(state.currentUser == nil)
    }

    // MARK: - connectWebSocket

    @Test("connectWebSocket creates a webSocketClient")
    @MainActor
    func connectCreatesClient() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "test_token")
        #expect(state.webSocketClient != nil)
        state.disconnectWebSocket()
    }

    @Test("connectWebSocket sets onConnectionStateChanged handler")
    @MainActor
    func connectSetsStateHandler() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "test_token")
        #expect(state.webSocketClient?.onConnectionStateChanged != nil)
        state.disconnectWebSocket()
    }

    @Test("connectWebSocket sets onAuthFailure handler")
    @MainActor
    func connectSetsAuthFailureHandler() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "test_token")
        #expect(state.webSocketClient?.onAuthFailure != nil)
        state.disconnectWebSocket()
    }

    @Test("connectWebSocket disconnects existing client before creating new one")
    @MainActor
    func connectDisconnectsExisting() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "token_1")
        let firstClient = state.webSocketClient
        #expect(firstClient != nil)

        state.connectWebSocket(accessToken: "token_2")
        let secondClient = state.webSocketClient
        #expect(secondClient != nil)
        // The second client should be different from the first
        #expect(firstClient !== secondClient)
        state.disconnectWebSocket()
    }

    @Test("connectWebSocket with empty token does not crash")
    @MainActor
    func connectWithEmptyToken() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "")
        #expect(state.webSocketClient != nil)
        state.disconnectWebSocket()
    }

    // MARK: - disconnectWebSocket

    @Test("disconnectWebSocket nils out webSocketClient")
    @MainActor
    func disconnectNilsClient() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "token")
        #expect(state.webSocketClient != nil)

        state.disconnectWebSocket()
        #expect(state.webSocketClient == nil)
    }

    @Test("disconnectWebSocket sets connectionState to disconnected")
    @MainActor
    func disconnectSetsDisconnected() {
        let state = makeAppState()
        state.connectionState = .connected
        state.disconnectWebSocket()
        #expect(state.connectionState == .disconnected)
    }

    @Test("disconnectWebSocket without prior connect does not crash")
    @MainActor
    func disconnectWithoutConnect() {
        let state = makeAppState()
        state.disconnectWebSocket()
        #expect(state.webSocketClient == nil)
        #expect(state.connectionState == .disconnected)
    }

    @Test("Multiple disconnectWebSocket calls are safe")
    @MainActor
    func multipleDisconnects() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "token")
        state.disconnectWebSocket()
        state.disconnectWebSocket()
        state.disconnectWebSocket()
        #expect(state.webSocketClient == nil)
    }

    // MARK: - Login Flow

    @Test("login with network failure sets loginError")
    @MainActor
    func loginNetworkFailure() async {
        let state = makeAppState()
        do {
            try await state.login(email: "test@test.com", password: "password")
            Issue.record("Expected error")
        } catch {
            #expect(state.currentUser == nil)
            #expect(state.isAuthenticated == false)
            #expect(state.authStore.loginError != nil)
        }
    }

    @Test("Failed login does not create webSocketClient")
    @MainActor
    func failedLoginNoWebSocket() async {
        let state = makeAppState()
        do {
            try await state.login(email: "test@test.com", password: "wrong")
        } catch {
            // Expected
        }
        #expect(state.webSocketClient == nil)
    }

    @Test("Failed login preserves disconnected connectionState")
    @MainActor
    func failedLoginKeepsDisconnected() async {
        let state = makeAppState()
        do {
            try await state.login(email: "test@test.com", password: "wrong")
        } catch {
            // Expected
        }
        #expect(state.connectionState == .disconnected)
    }

    // MARK: - Logout Flow

    @Test("logout clears currentUser")
    @MainActor
    func logoutClearsCurrentUser() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        #expect(state.isAuthenticated == true)

        await state.logout()
        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
    }

    @Test("logout clears selectedConversationID")
    @MainActor
    func logoutClearsSelectedConversation() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.selectedConversationID = "conv_1"

        await state.logout()
        #expect(state.selectedConversationID == nil)
    }

    @Test("logout nils feedViewModel")
    @MainActor
    func logoutNilsFeedViewModel() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.feedViewModel = FeedViewModel(apiClient: state.apiClient)

        await state.logout()
        #expect(state.feedViewModel == nil)
    }

    @Test("logout nils marketplaceViewModel")
    @MainActor
    func logoutNilsMarketplaceViewModel() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.marketplaceViewModel = MarketplaceViewModel(apiClient: state.apiClient)

        await state.logout()
        #expect(state.marketplaceViewModel == nil)
    }

    @Test("logout disconnects webSocket")
    @MainActor
    func logoutDisconnectsWebSocket() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.connectWebSocket(accessToken: "token")
        #expect(state.webSocketClient != nil)

        await state.logout()
        #expect(state.webSocketClient == nil)
        #expect(state.connectionState == .disconnected)
    }

    @Test("logout sets connectionState to disconnected")
    @MainActor
    func logoutSetsDisconnected() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.connectionState = .connected

        await state.logout()
        #expect(state.connectionState == .disconnected)
    }

    @Test("logout without prior login does not crash")
    @MainActor
    func logoutWithoutLogin() async {
        let state = makeAppState()
        await state.logout()
        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
    }

    // MARK: - Multiple Rapid Connect / Disconnect

    @Test("Rapid connect-disconnect cycles do not crash")
    @MainActor
    func rapidConnectDisconnect() {
        let state = makeAppState()
        for i in 0..<10 {
            state.connectWebSocket(accessToken: "token_\(i)")
            state.disconnectWebSocket()
        }
        #expect(state.webSocketClient == nil)
        #expect(state.connectionState == .disconnected)
    }

    @Test("Rapid connect without disconnect replaces client each time")
    @MainActor
    func rapidConnectWithoutDisconnect() {
        let state = makeAppState()
        var previousClient: WebSocketClient?
        for i in 0..<5 {
            state.connectWebSocket(accessToken: "token_\(i)")
            if let prev = previousClient {
                #expect(prev !== state.webSocketClient)
            }
            previousClient = state.webSocketClient
        }
        state.disconnectWebSocket()
    }

    @Test("Multiple logouts in sequence do not crash")
    @MainActor
    func multipleLogouts() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.connectWebSocket(accessToken: "token")

        await state.logout()
        await state.logout()
        await state.logout()

        #expect(state.isAuthenticated == false)
        #expect(state.webSocketClient == nil)
    }

    // MARK: - State Persistence Across Reconnection

    @Test("conversationStore persists across connect/disconnect cycles")
    @MainActor
    func conversationStorePersistsAcrossReconnect() {
        let state = makeAppState()
        state.conversationStore.upsert(Conversation(id: "c1", type: .dm, title: "Persisted"))

        state.connectWebSocket(accessToken: "token")
        state.disconnectWebSocket()

        #expect(state.conversationStore.conversations.count == 1)
        #expect(state.conversationStore.conversation(byID: "c1")?.title == "Persisted")
    }

    @Test("messageStore persists across connect/disconnect cycles")
    @MainActor
    func messageStorePersistsAcrossReconnect() {
        let state = makeAppState()
        let msg = Message(
            id: "m1", conversationID: "c1",
            senderType: .human, type: .text,
            content: MessageContent(text: "Hello")
        )
        state.messageStore.appendMessage(msg, to: "c1")

        state.connectWebSocket(accessToken: "token")
        state.disconnectWebSocket()

        #expect(state.messageStore.messages(for: "c1").count == 1)
    }

    @Test("Stores persist through logout")
    @MainActor
    func storesPersistThroughLogout() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.conversationStore.upsert(Conversation(id: "c1", type: .agent, title: "Test"))
        state.messageStore.appendMessage(
            Message(id: "m1", conversationID: "c1", senderType: .human, type: .text, content: MessageContent(text: "Hello")),
            to: "c1"
        )

        await state.logout()

        // Stores are NOT cleared by logout (they persist until explicit cleanup)
        #expect(state.conversationStore.conversations.count == 1)
        #expect(state.messageStore.messages(for: "c1").count == 1)
    }

    // MARK: - Error Handling in State Transitions

    @Test("Register with network failure does not set currentUser")
    @MainActor
    func registerNetworkFailure() async {
        let state = makeAppState()
        do {
            try await state.register(username: "alice", email: "alice@test.com", password: "pass")
            Issue.record("Expected error")
        } catch {
            #expect(state.currentUser == nil)
            #expect(state.isAuthenticated == false)
        }
    }

    @Test("Failed register does not create webSocketClient")
    @MainActor
    func failedRegisterNoWebSocket() async {
        let state = makeAppState()
        do {
            try await state.register(username: "bob", email: "bob@test.com", password: "pass")
        } catch {
            // Expected
        }
        #expect(state.webSocketClient == nil)
    }

    @Test("requestMagicLink with network failure throws")
    @MainActor
    func requestMagicLinkFailure() async {
        let state = makeAppState()
        do {
            try await state.requestMagicLink(email: "test@test.com")
            Issue.record("Expected error")
        } catch {
            // Expected: network error
        }
    }

    @Test("verifyMagicLink with network failure does not set currentUser")
    @MainActor
    func verifyMagicLinkFailure() async {
        let state = makeAppState()
        do {
            try await state.verifyMagicLink(token: "invalid_token")
            Issue.record("Expected error")
        } catch {
            #expect(state.currentUser == nil)
        }
    }

    @Test("restoreSession without stored tokens is a no-op")
    @MainActor
    func restoreSessionNoTokens() async {
        let state = makeAppState()
        await state.restoreSession()
        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
        #expect(state.webSocketClient == nil)
    }

    // MARK: - isAuthenticated Computed Property

    @Test("isAuthenticated toggles with currentUser")
    @MainActor
    func isAuthenticatedToggles() {
        let state = makeAppState()
        #expect(state.isAuthenticated == false)

        state.currentUser = makeUser()
        #expect(state.isAuthenticated == true)

        state.currentUser = nil
        #expect(state.isAuthenticated == false)
    }

    // MARK: - currentUserID Computed Property

    @Test("currentUserID reflects currentUser.id")
    @MainActor
    func currentUserIDReflectsUser() {
        let state = makeAppState()
        #expect(state.currentUserID == nil)

        state.currentUser = makeUser(id: "u_42")
        #expect(state.currentUserID == "u_42")
    }

    @Test("currentUserID returns nil after logout")
    @MainActor
    func currentUserIDNilAfterLogout() async {
        let state = makeAppState()
        state.currentUser = makeUser(id: "u_42")
        #expect(state.currentUserID == "u_42")

        await state.logout()
        #expect(state.currentUserID == nil)
    }

    // MARK: - Sub-store Accessibility

    @Test("authStore is accessible from AppState")
    @MainActor
    func authStoreAccessible() {
        let state = makeAppState()
        #expect(state.authStore.isLoggingIn == false)
        #expect(state.authStore.isRegistering == false)
    }

    @Test("apiClient is accessible from AppState")
    @MainActor
    func apiClientAccessible() {
        let state = makeAppState()
        _ = state.apiClient // Should not crash
    }

    @Test("authManager is accessible from AppState")
    @MainActor
    func authManagerAccessible() {
        let state = makeAppState()
        _ = state.authManager // Should not crash
    }
}
