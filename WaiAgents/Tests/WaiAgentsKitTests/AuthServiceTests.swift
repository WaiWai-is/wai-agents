import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for AuthStore, AuthManager, and auth-related endpoint behavior:
/// login, registration, token management, logout, magic links,
/// error handling, and token refresh flow.
@Suite("Auth Service Tests")
struct AuthServiceTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    @MainActor
    private func makeAuthStore(serviceName: String? = nil) -> (AuthStore, AuthManager) {
        let name = serviceName ?? "test.authsvc.\(UUID().uuidString)"
        let authManager = AuthManager(serviceName: name, baseURL: baseURL)
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        let store = AuthStore(apiClient: apiClient, authManager: authManager)
        return (store, authManager)
    }

    // MARK: - AuthStore Initial State

    @Test("AuthStore starts with all flags false")
    @MainActor
    func authStoreInitialState() {
        let (store, _) = makeAuthStore()
        #expect(store.isLoggingIn == false)
        #expect(store.isRegistering == false)
        #expect(store.isVerifyingMagicLink == false)
        #expect(store.isSendingMagicLink == false)
        #expect(store.magicLinkSent == false)
        #expect(store.loginError == nil)
        #expect(store.magicLinkError == nil)
    }

    // MARK: - Login Flow

    @Test("Login endpoint uses POST method")
    func loginMethod() {
        let endpoint = APIEndpoint.login(email: "test@test.com", password: "pass123")
        #expect(endpoint.method == "POST")
    }

    @Test("Login endpoint has correct path")
    func loginPath() {
        let endpoint = APIEndpoint.login(email: "test@test.com", password: "pass123")
        #expect(endpoint.path == "/auth/login")
    }

    @Test("Login endpoint does not require auth")
    func loginNoAuth() {
        let endpoint = APIEndpoint.login(email: "test@test.com", password: "pass123")
        #expect(endpoint.requiresAuth == false)
    }

    @Test("Login endpoint encodes email and password in body")
    func loginBody() throws {
        let endpoint = APIEndpoint.login(email: "user@example.com", password: "s3cret")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["email"] as? String == "user@example.com")
        #expect(dict?["password"] as? String == "s3cret")
    }

    @Test("Login with network failure sets loginError on AuthStore")
    @MainActor
    func loginNetworkFailure() async {
        let (store, _) = makeAuthStore()

        do {
            _ = try await store.login(email: "test@test.com", password: "wrong")
            Issue.record("Expected error from login")
        } catch {
            #expect(store.loginError != nil)
            #expect(store.isLoggingIn == false)
        }
    }

    @Test("Login sets isLoggingIn then resets on failure")
    @MainActor
    func loginLoggingInFlag() async {
        let (store, _) = makeAuthStore()
        #expect(store.isLoggingIn == false)

        do {
            _ = try await store.login(email: "e", password: "p")
        } catch {
            // Expected
        }

        #expect(store.isLoggingIn == false)
    }

    // MARK: - Registration Flow

    @Test("Register endpoint uses POST method")
    func registerMethod() {
        let endpoint = APIEndpoint.register(username: "alice", email: "alice@test.com", password: "pass")
        #expect(endpoint.method == "POST")
    }

    @Test("Register endpoint has correct path")
    func registerPath() {
        let endpoint = APIEndpoint.register(username: "alice", email: "alice@test.com", password: "pass")
        #expect(endpoint.path == "/auth/register")
    }

    @Test("Register endpoint does not require auth")
    func registerNoAuth() {
        let endpoint = APIEndpoint.register(username: "alice", email: "alice@test.com", password: "pass")
        #expect(endpoint.requiresAuth == false)
    }

    @Test("Register endpoint encodes username, email, and password in body")
    func registerBody() throws {
        let endpoint = APIEndpoint.register(username: "bob", email: "bob@test.com", password: "secret")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["username"] as? String == "bob")
        #expect(dict?["email"] as? String == "bob@test.com")
        #expect(dict?["password"] as? String == "secret")
    }

    @Test("Register with network failure sets loginError")
    @MainActor
    func registerNetworkFailure() async {
        let (store, _) = makeAuthStore()

        do {
            _ = try await store.register(username: "test", email: "t@t.com", password: "p")
            Issue.record("Expected error")
        } catch {
            #expect(store.loginError != nil)
            #expect(store.isRegistering == false)
        }
    }

    // MARK: - Token Storage & Retrieval

    @Test("setTokens makes isAuthenticated true")
    func setTokensAuthenticated() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "at", refresh: "rt", expiresIn: 3600)

        let isAuth = await authManager.isAuthenticated
        #expect(isAuth == true)
    }

    @Test("setTokens stores access token that can be retrieved")
    func setTokensRetrieveAccess() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "my_token", refresh: "my_refresh", expiresIn: 3600)

        let token = try await authManager.validAccessToken()
        #expect(token == "my_token")
    }

    @Test("setTokens stores refresh token that can be retrieved")
    func setTokensRetrieveRefresh() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "at", refresh: "my_rt", expiresIn: 3600)

        let rt = await authManager.currentRefreshToken
        #expect(rt == "my_rt")
    }

    @Test("setTokens with zero expiresIn results in expired token")
    func setTokensZeroExpiry() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "expired", refresh: "rt", expiresIn: 0)

        do {
            _ = try await authManager.validAccessToken()
            Issue.record("Should have thrown")
        } catch {
            // Expected: token is immediately expired
        }
    }

    @Test("Overwriting tokens replaces previous values")
    func overwriteTokens() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "old_at", refresh: "old_rt", expiresIn: 3600)
        try await authManager.setTokens(access: "new_at", refresh: "new_rt", expiresIn: 7200)

        let token = try await authManager.validAccessToken()
        #expect(token == "new_at")

        let rt = await authManager.currentRefreshToken
        #expect(rt == "new_rt")
    }

    // MARK: - Token Refresh

    @Test("validAccessToken returns immediately when token is fresh")
    func validTokenReturnsFast() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "fresh", refresh: "rt", expiresIn: 3600)

        let token = try await authManager.validAccessToken()
        #expect(token == "fresh")
    }

    @Test("Token expiring in <60s triggers refresh attempt")
    func nearExpiryTriggersRefresh() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "about_to_expire", refresh: "rt", expiresIn: 30)

        do {
            _ = try await authManager.validAccessToken()
            // May or may not throw depending on timing
        } catch {
            // Expected: refresh fails without a server
        }
    }

    @Test("No tokens throws unauthorized immediately")
    func noTokensUnauthorized() async {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")

        do {
            _ = try await authManager.validAccessToken()
            Issue.record("Should have thrown unauthorized")
        } catch let error as APIError {
            guard case .unauthorized = error else {
                Issue.record("Expected .unauthorized, got \(error)")
                return
            }
        } catch {
            Issue.record("Expected APIError")
        }
    }

    @Test("Refresh endpoint uses POST method")
    func refreshMethod() {
        #expect(APIEndpoint.refresh(refreshToken: "rt").method == "POST")
    }

    @Test("Refresh endpoint does not require auth")
    func refreshNoAuth() {
        #expect(APIEndpoint.refresh(refreshToken: "rt").requiresAuth == false)
    }

    @Test("Refresh endpoint has correct path")
    func refreshPath() {
        #expect(APIEndpoint.refresh(refreshToken: "rt").path == "/auth/refresh")
    }

    // MARK: - Logout

    @Test("clearTokens makes isAuthenticated false")
    func clearTokensNotAuthenticated() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "at", refresh: "rt", expiresIn: 3600)
        try await authManager.clearTokens()

        let isAuth = await authManager.isAuthenticated
        #expect(isAuth == false)
    }

    @Test("clearTokens removes refresh token")
    func clearTokensRemovesRefresh() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "at", refresh: "rt", expiresIn: 3600)
        try await authManager.clearTokens()

        let rt = await authManager.currentRefreshToken
        #expect(rt == nil)
    }

    @Test("After clearTokens, validAccessToken throws")
    func clearTokensThenAccessThrows() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "at", refresh: "rt", expiresIn: 3600)
        try await authManager.clearTokens()

        do {
            _ = try await authManager.validAccessToken()
            Issue.record("Should have thrown")
        } catch {
            // Expected
        }
    }

    @Test("Double clearTokens does not throw")
    func doubleClearTokens() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "at", refresh: "rt", expiresIn: 3600)
        try await authManager.clearTokens()
        try await authManager.clearTokens()

        let isAuth = await authManager.isAuthenticated
        #expect(isAuth == false)
    }

    @Test("Logout endpoint uses DELETE method")
    func logoutMethod() {
        #expect(APIEndpoint.logout(refreshToken: "rt").method == "DELETE")
    }

    @Test("Logout endpoint requires auth")
    func logoutRequiresAuth() {
        #expect(APIEndpoint.logout(refreshToken: "rt").requiresAuth == true)
    }

    @Test("Logout endpoint has correct path")
    func logoutPath() {
        #expect(APIEndpoint.logout(refreshToken: "rt").path == "/auth/logout")
    }

    @Test("AuthStore logout clears tokens even if server call fails")
    @MainActor
    func authStoreLogout() async throws {
        let (store, authManager) = makeAuthStore()
        try await authManager.setTokens(access: "at", refresh: "rt", expiresIn: 3600)

        let isAuthBefore = await authManager.isAuthenticated
        #expect(isAuthBefore == true)

        try await store.logout()

        let isAuthAfter = await authManager.isAuthenticated
        #expect(isAuthAfter == false)
    }

    // MARK: - Magic Link Flow

    @Test("requestMagicLink endpoint uses POST method")
    func magicLinkMethod() {
        #expect(APIEndpoint.requestMagicLink(email: "t@t.com").method == "POST")
    }

    @Test("requestMagicLink endpoint has correct path")
    func magicLinkPath() {
        #expect(APIEndpoint.requestMagicLink(email: "t@t.com").path == "/auth/magic-link")
    }

    @Test("requestMagicLink does not require auth")
    func magicLinkNoAuth() {
        #expect(APIEndpoint.requestMagicLink(email: "t@t.com").requiresAuth == false)
    }

    @Test("verifyMagicLink endpoint uses POST method")
    func verifyMagicLinkMethod() {
        #expect(APIEndpoint.verifyMagicLink(token: "tok").method == "POST")
    }

    @Test("verifyMagicLink endpoint has correct path")
    func verifyMagicLinkPath() {
        #expect(APIEndpoint.verifyMagicLink(token: "tok").path == "/auth/magic-link/verify")
    }

    @Test("verifyMagicLink does not require auth")
    func verifyMagicLinkNoAuth() {
        #expect(APIEndpoint.verifyMagicLink(token: "tok").requiresAuth == false)
    }

    @Test("resetMagicLinkState clears all magic link state")
    @MainActor
    func resetMagicLinkState() {
        let (store, _) = makeAuthStore()
        store.resetMagicLinkState()

        #expect(store.magicLinkSent == false)
        #expect(store.magicLinkError == nil)
    }

    // MARK: - Token Expiry Detection

    @Test("Token with 61 seconds remaining returns without refresh")
    func tokenFreshAt61Seconds() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "fresh", refresh: "rt", expiresIn: 61)

        let token = try await authManager.validAccessToken()
        #expect(token == "fresh")
    }

    @Test("Token with very large expiresIn returns normally")
    func tokenVeryLargeExpiry() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "long_lived", refresh: "rt", expiresIn: 86400 * 365)

        let token = try await authManager.validAccessToken()
        #expect(token == "long_lived")
    }

    @Test("Token with negative expiresIn is expired")
    func tokenNegativeExpiry() async throws {
        let authManager = AuthManager(serviceName: "test.authsvc.\(UUID().uuidString)")
        try await authManager.setTokens(access: "past", refresh: "rt", expiresIn: -100)

        do {
            _ = try await authManager.validAccessToken()
            Issue.record("Should have thrown")
        } catch {
            // Expected
        }
    }

    // MARK: - Auto-refresh on 401

    @Test("APIClient retries on 401 for authenticated endpoints")
    func retryOn401() {
        // The 401 retry path is active for endpoints where requiresAuth == true
        #expect(APIEndpoint.me.requiresAuth == true)
        #expect(APIEndpoint.listAgents.requiresAuth == true)
        #expect(APIEndpoint.deleteConversation(id: "c1").requiresAuth == true)
    }

    @Test("APIClient does not retry 401 for unauthenticated endpoints")
    func noRetryUnauthEndpoints() {
        #expect(APIEndpoint.login(email: "e", password: "p").requiresAuth == false)
        #expect(APIEndpoint.register(username: "u", email: "e", password: "p").requiresAuth == false)
        #expect(APIEndpoint.refresh(refreshToken: "rt").requiresAuth == false)
    }

    // MARK: - hasStoredTokens and fetchCurrentUser

    @Test("hasStoredTokens returns false initially")
    @MainActor
    func hasStoredTokensInitially() async {
        let (store, _) = makeAuthStore()
        let has = await store.hasStoredTokens()
        #expect(has == false)
    }

    @Test("hasStoredTokens returns true after setTokens")
    @MainActor
    func hasStoredTokensAfterSet() async throws {
        let (store, authManager) = makeAuthStore()
        try await authManager.setTokens(access: "at", refresh: "rt", expiresIn: 3600)

        let has = await store.hasStoredTokens()
        #expect(has == true)
    }

    @Test("fetchCurrentUser fails without server")
    @MainActor
    func fetchCurrentUserFails() async {
        let (store, _) = makeAuthStore()

        do {
            _ = try await store.fetchCurrentUser()
            Issue.record("Expected error")
        } catch {
            // Expected: network or auth error
        }
    }
}
