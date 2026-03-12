import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for AuthStore state transitions that drive LoginView and RegisterView UI.
@Suite("AuthStore UI State")
struct AuthStoreUITests {

    // MARK: - Helpers

    @MainActor
    private func makeAuthStore() -> AuthStore {
        let authManager = AuthManager(serviceName: "test.authstore.ui.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
        return AuthStore(apiClient: apiClient, authManager: authManager)
    }

    // MARK: - Initial State (LoginView depends on these)

    @Test("Initial state: isLoggingIn is false")
    @MainActor
    func initialIsLoggingInFalse() {
        let store = makeAuthStore()
        #expect(store.isLoggingIn == false)
    }

    @Test("Initial state: isRegistering is false")
    @MainActor
    func initialIsRegisteringFalse() {
        let store = makeAuthStore()
        #expect(store.isRegistering == false)
    }

    @Test("Initial state: loginError is nil")
    @MainActor
    func initialLoginErrorNil() {
        let store = makeAuthStore()
        #expect(store.loginError == nil)
    }

    @Test("Initial state: isSendingMagicLink is false")
    @MainActor
    func initialIsSendingMagicLinkFalse() {
        let store = makeAuthStore()
        #expect(store.isSendingMagicLink == false)
    }

    @Test("Initial state: magicLinkSent is false")
    @MainActor
    func initialMagicLinkSentFalse() {
        let store = makeAuthStore()
        #expect(store.magicLinkSent == false)
    }

    @Test("Initial state: magicLinkError is nil")
    @MainActor
    func initialMagicLinkErrorNil() {
        let store = makeAuthStore()
        #expect(store.magicLinkError == nil)
    }

    @Test("Initial state: isVerifyingMagicLink is false")
    @MainActor
    func initialIsVerifyingMagicLinkFalse() {
        let store = makeAuthStore()
        #expect(store.isVerifyingMagicLink == false)
    }

    // MARK: - Magic Link State Machine

    @Test("resetMagicLinkState clears magicLinkSent")
    @MainActor
    func resetMagicLinkStateClearsSent() {
        let store = makeAuthStore()
        // Simulate sent state
        store.magicLinkSent = true
        store.magicLinkError = "Some error"

        store.resetMagicLinkState()

        #expect(store.magicLinkSent == false)
        #expect(store.magicLinkError == nil)
    }

    @Test("resetMagicLinkState clears magicLinkError")
    @MainActor
    func resetMagicLinkStateClearsError() {
        let store = makeAuthStore()
        store.magicLinkError = "Network error"

        store.resetMagicLinkState()

        #expect(store.magicLinkError == nil)
    }

    @Test("resetMagicLinkState can be called multiple times safely")
    @MainActor
    func resetMagicLinkStateIdempotent() {
        let store = makeAuthStore()
        store.resetMagicLinkState()
        store.resetMagicLinkState()
        store.resetMagicLinkState()

        #expect(store.magicLinkSent == false)
        #expect(store.magicLinkError == nil)
    }

    // MARK: - Login Error Display (LoginView shows this)

    @Test("loginError can be set directly for UI display")
    @MainActor
    func loginErrorCanBeSet() {
        let store = makeAuthStore()
        store.loginError = "Invalid email or password."
        #expect(store.loginError == "Invalid email or password.")
    }

    @Test("loginError can be cleared")
    @MainActor
    func loginErrorCanBeCleared() {
        let store = makeAuthStore()
        store.loginError = "Error"
        store.loginError = nil
        #expect(store.loginError == nil)
    }

    // MARK: - Login Attempt (Network will fail, but state transitions should be correct)

    @Test("login sets isLoggingIn true then false after failure")
    @MainActor
    func loginStateTransitionOnFailure() async {
        let store = makeAuthStore()

        #expect(store.isLoggingIn == false)

        // Attempt login -- will fail because no real server
        do {
            _ = try await store.login(email: "test@example.com", password: "password")
        } catch {
            // Expected failure
        }

        // After the call completes, isLoggingIn should be false again
        #expect(store.isLoggingIn == false)
        // loginError should be set since the request failed
        #expect(store.loginError != nil)
    }

    @Test("login clears previous loginError before attempting")
    @MainActor
    func loginClearsPreviousError() async {
        let store = makeAuthStore()
        store.loginError = "Previous error"

        do {
            _ = try await store.login(email: "test@example.com", password: "password")
        } catch {
            // Expected
        }

        // The error should be a new error from the failed request, not the old one
        #expect(store.loginError != "Previous error")
    }

    // MARK: - Register Attempt

    @Test("register sets isRegistering true then false after failure")
    @MainActor
    func registerStateTransitionOnFailure() async {
        let store = makeAuthStore()

        #expect(store.isRegistering == false)

        do {
            _ = try await store.register(username: "testuser", email: "test@example.com", password: "password")
        } catch {
            // Expected
        }

        #expect(store.isRegistering == false)
        #expect(store.loginError != nil)
    }

    // MARK: - Magic Link Request

    @Test("requestMagicLink sets isSendingMagicLink true then false after failure")
    @MainActor
    func requestMagicLinkStateTransition() async {
        let store = makeAuthStore()

        #expect(store.isSendingMagicLink == false)

        do {
            try await store.requestMagicLink(email: "test@example.com")
        } catch {
            // Expected
        }

        #expect(store.isSendingMagicLink == false)
        // magicLinkSent should remain false on failure
        #expect(store.magicLinkSent == false)
        // magicLinkError should be set
        #expect(store.magicLinkError != nil)
    }

    @Test("requestMagicLink resets magicLinkSent before attempting")
    @MainActor
    func requestMagicLinkResetsSent() async {
        let store = makeAuthStore()
        store.magicLinkSent = true

        do {
            try await store.requestMagicLink(email: "test@example.com")
        } catch {
            // Expected
        }

        // Should have been reset at the start of the call
        #expect(store.magicLinkSent == false)
    }

    // MARK: - Magic Link Verify

    @Test("verifyMagicLink sets isVerifyingMagicLink true then false after failure")
    @MainActor
    func verifyMagicLinkStateTransition() async {
        let store = makeAuthStore()

        #expect(store.isVerifyingMagicLink == false)

        do {
            _ = try await store.verifyMagicLink(token: "invalid_token")
        } catch {
            // Expected
        }

        #expect(store.isVerifyingMagicLink == false)
        #expect(store.magicLinkError != nil)
    }

    @Test("verifyMagicLink clears previous magicLinkError before attempting")
    @MainActor
    func verifyMagicLinkClearsPreviousError() async {
        let store = makeAuthStore()
        store.magicLinkError = "Old error"

        do {
            _ = try await store.verifyMagicLink(token: "invalid")
        } catch {
            // Expected
        }

        // Error should be a new one, not the old one
        #expect(store.magicLinkError != "Old error")
    }
}
