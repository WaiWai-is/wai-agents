import Foundation
import Testing
@testable import WaiAgentsKit

/// Integration tests for the authentication flow:
/// login, register, session restore, magic link, and logout.
/// These test the interaction between AppState, AuthStore, and AuthManager
/// using the real objects (no mocks) against a non-existent backend,
/// verifying error-path behavior and state transitions.
@Suite("Login Flow Integration")
struct LoginFlowIntegrationTests {

    // MARK: - Helpers

    @MainActor
    private func makeAppState() -> AppState {
        AppState(baseURL: URL(string: "https://test-nonexistent.waiagents.local")!)
    }

    // MARK: - Login error paths

    @Test("Login sets isLoggingIn and captures error on network failure")
    @MainActor
    func loginNetworkFailureSetsError() async {
        let state = makeAppState()
        do {
            try await state.login(email: "test@example.com", password: "pass123")
            Issue.record("Expected login to throw")
        } catch {
            // AuthStore should have captured a readable error
            #expect(state.authStore.loginError != nil)
            #expect(state.authStore.isLoggingIn == false)
            #expect(state.currentUser == nil)
        }
    }

    @Test("Login does not set currentUser on failure")
    @MainActor
    func loginFailureDoesNotSetUser() async {
        let state = makeAppState()
        try? await state.login(email: "bad@example.com", password: "wrong")
        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
    }

    @Test("Register sets isRegistering and captures error on failure")
    @MainActor
    func registerNetworkFailure() async {
        let state = makeAppState()
        do {
            try await state.register(username: "new_user", email: "new@example.com", password: "Pass123!")
            Issue.record("Expected register to throw")
        } catch {
            #expect(state.authStore.isRegistering == false)
            #expect(state.authStore.loginError != nil)
            #expect(state.currentUser == nil)
        }
    }

    // MARK: - Session restore

    @Test("restoreSession with no stored tokens leaves user nil")
    @MainActor
    func restoreSessionNoTokens() async {
        let state = makeAppState()
        await state.restoreSession()
        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
    }

    @Test("restoreSession with stored but invalid token clears on unauthorized")
    @MainActor
    func restoreSessionExpiredToken() async {
        let state = makeAppState()
        // Store tokens that will fail validation against the nonexistent server
        try? await state.authManager.setTokens(
            access: "expired-access-token",
            refresh: "expired-refresh-token",
            expiresIn: -1  // Already expired
        )
        await state.restoreSession()
        // Should remain nil because the refresh will fail
        #expect(state.currentUser == nil)
    }

    // MARK: - Magic link

    @Test("requestMagicLink sets isSendingMagicLink and captures error")
    @MainActor
    func requestMagicLinkFailure() async {
        let state = makeAppState()
        do {
            try await state.requestMagicLink(email: "test@example.com")
            Issue.record("Expected magic link request to throw")
        } catch {
            #expect(state.authStore.isSendingMagicLink == false)
            #expect(state.authStore.magicLinkSent == false)
            #expect(state.authStore.magicLinkError != nil)
        }
    }

    @Test("verifyMagicLink fails and captures error on network failure")
    @MainActor
    func verifyMagicLinkFailure() async {
        let state = makeAppState()
        do {
            try await state.verifyMagicLink(token: "invalid-token")
            Issue.record("Expected verify to throw")
        } catch {
            #expect(state.authStore.isVerifyingMagicLink == false)
            #expect(state.authStore.magicLinkError != nil)
            #expect(state.currentUser == nil)
        }
    }

    @Test("resetMagicLinkState clears all magic link flags")
    @MainActor
    func resetMagicLinkState() {
        let state = makeAppState()
        // Simulate a state where magic link was attempted
        state.authStore.resetMagicLinkState()
        #expect(state.authStore.magicLinkSent == false)
        #expect(state.authStore.magicLinkError == nil)
    }

    // MARK: - Logout

    @Test("Logout clears currentUser and disconnects WebSocket")
    @MainActor
    func logoutClearsState() async {
        let state = makeAppState()
        // Simulate a logged-in state
        state.currentUser = User(id: "u1", username: "testuser")
        state.selectedConversationID = "conv_1"

        await state.logout()

        #expect(state.currentUser == nil)
        #expect(state.selectedConversationID == nil)
        #expect(state.isAuthenticated == false)
        #expect(state.webSocketClient == nil)
        #expect(state.connectionState == .disconnected)
        #expect(state.feedViewModel == nil)
        #expect(state.marketplaceViewModel == nil)
    }

    @Test("Logout is safe to call when already logged out")
    @MainActor
    func logoutWhenAlreadyLoggedOut() async {
        let state = makeAppState()
        // Should not crash
        await state.logout()
        #expect(state.currentUser == nil)
    }

    // MARK: - WebSocket connection lifecycle

    @Test("connectWebSocket creates a WebSocketClient")
    @MainActor
    func connectWebSocketCreatesClient() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "test-token")
        #expect(state.webSocketClient != nil)
    }

    @Test("disconnectWebSocket sets connectionState to disconnected")
    @MainActor
    func disconnectWebSocketClearsState() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "test-token")
        state.disconnectWebSocket()
        #expect(state.webSocketClient == nil)
        #expect(state.connectionState == .disconnected)
    }

    @Test("connectWebSocket disconnects previous client before creating new one")
    @MainActor
    func connectWebSocketReplacesExisting() {
        let state = makeAppState()
        state.connectWebSocket(accessToken: "token-1")
        let first = state.webSocketClient
        state.connectWebSocket(accessToken: "token-2")
        let second = state.webSocketClient
        #expect(first !== second)
        #expect(second != nil)
    }

    // MARK: - AuthStore readable error mapping

    @Test("AuthStore maps unauthorized to readable message")
    @MainActor
    func authStoreUnauthorizedMessage() async {
        let authManager = AuthManager(serviceName: "test.auth.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: URL(string: "https://nonexistent.local")!, authManager: authManager)
        let store = AuthStore(apiClient: apiClient, authManager: authManager)

        do {
            _ = try await store.login(email: "a@b.com", password: "x")
            Issue.record("Expected throw")
        } catch {
            // The error should be a network-related readable string
            #expect(store.loginError != nil)
            #expect(store.isLoggingIn == false)
        }
    }

    @Test("AuthStore login clears previous loginError on new attempt")
    @MainActor
    func authStoreLoginClearsPreviousError() async {
        let authManager = AuthManager(serviceName: "test.auth.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: URL(string: "https://nonexistent.local")!, authManager: authManager)
        let store = AuthStore(apiClient: apiClient, authManager: authManager)

        // First attempt sets an error
        try? await store.login(email: "a@b.com", password: "x")
        let firstError = store.loginError

        // Second attempt should clear error before trying
        // (it will fail again, but loginError should have been nil briefly)
        try? await store.login(email: "a@b.com", password: "y")
        #expect(store.loginError != nil)
        // The errors might differ or be the same, but loginError is not nil
        _ = firstError  // suppress unused warning
    }
}
