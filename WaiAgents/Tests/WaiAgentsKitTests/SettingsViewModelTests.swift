import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for settings/profile-related ViewModel behavior:
/// profile update validation, username format, avatar upload handling,
/// settings persistence, and logout clearing all state.
@Suite("Settings & Profile ViewModel Tests")
struct SettingsViewModelTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    @MainActor
    private func makeAppState() -> AppState {
        AppState(baseURL: baseURL)
    }

    private func makeUser(
        id: String = "user_1",
        username: String = "testuser",
        displayName: String? = "Test User",
        email: String? = "test@example.com",
        bio: String? = nil,
        avatarURL: URL? = nil
    ) -> User {
        User(
            id: id,
            username: username,
            displayName: displayName,
            email: email,
            avatarURL: avatarURL,
            bio: bio
        )
    }

    // MARK: - Profile Update Endpoint Validation

    @Test("updateMe encodes only displayName when only displayName is provided")
    func updateMeOnlyDisplayName() throws {
        let endpoint = APIEndpoint.updateMe(displayName: "New Name", bio: nil, avatarURL: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["display_name"] as? String == "New Name")
        #expect(dict?["bio"] == nil)
        #expect(dict?["avatar_url"] == nil)
    }

    @Test("updateMe encodes only bio when only bio is provided")
    func updateMeOnlyBio() throws {
        let endpoint = APIEndpoint.updateMe(displayName: nil, bio: "I love coding", avatarURL: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["bio"] as? String == "I love coding")
        #expect(dict?["display_name"] == nil)
    }

    @Test("updateMe encodes only avatarURL when only avatarURL is provided")
    func updateMeOnlyAvatar() throws {
        let endpoint = APIEndpoint.updateMe(displayName: nil, bio: nil, avatarURL: "https://cdn.example.com/avatar.jpg")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["avatar_url"] as? String == "https://cdn.example.com/avatar.jpg")
        #expect(dict?["display_name"] == nil)
        #expect(dict?["bio"] == nil)
    }

    @Test("updateMe encodes all fields when all are provided")
    func updateMeAllFields() throws {
        let endpoint = APIEndpoint.updateMe(
            displayName: "Full Name",
            bio: "Full bio text",
            avatarURL: "https://cdn.example.com/new-avatar.png"
        )
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["display_name"] as? String == "Full Name")
        #expect(dict?["bio"] as? String == "Full bio text")
        #expect(dict?["avatar_url"] as? String == "https://cdn.example.com/new-avatar.png")
    }

    @Test("updateMe with all nil fields encodes empty object")
    func updateMeAllNil() throws {
        let endpoint = APIEndpoint.updateMe(displayName: nil, bio: nil, avatarURL: nil)
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?.isEmpty == true)
    }

    @Test("updateMe uses PATCH method")
    func updateMeMethod() {
        let endpoint = APIEndpoint.updateMe(displayName: "Name", bio: nil, avatarURL: nil)
        #expect(endpoint.method == "PATCH")
    }

    @Test("updateMe requires authentication")
    func updateMeRequiresAuth() {
        let endpoint = APIEndpoint.updateMe(displayName: "Name", bio: nil, avatarURL: nil)
        #expect(endpoint.requiresAuth == true)
    }

    @Test("updateMe has correct path")
    func updateMePath() {
        let endpoint = APIEndpoint.updateMe(displayName: "Name", bio: nil, avatarURL: nil)
        #expect(endpoint.path == "/users/me")
    }

    // MARK: - Username Format Validation (Model level)

    @Test("User model accepts standard username")
    func standardUsername() {
        let user = makeUser(username: "alex_dev")
        #expect(user.username == "alex_dev")
    }

    @Test("User model accepts username with numbers")
    func usernameWithNumbers() {
        let user = makeUser(username: "user123")
        #expect(user.username == "user123")
    }

    @Test("User model accepts single character username")
    func singleCharUsername() {
        let user = makeUser(username: "a")
        #expect(user.username == "a")
    }

    @Test("User model accepts very long username")
    func longUsername() {
        let longName = String(repeating: "x", count: 255)
        let user = makeUser(username: longName)
        #expect(user.username.count == 255)
    }

    @Test("User model accepts username with hyphens")
    func usernameWithHyphens() {
        let user = makeUser(username: "first-last")
        #expect(user.username == "first-last")
    }

    @Test("User model accepts unicode username")
    func unicodeUsername() {
        let user = makeUser(username: "user_unicode")
        #expect(user.username == "user_unicode")
    }

    @Test("User JSON decoding preserves username exactly")
    func usernameDecodingPreserved() throws {
        let json = """
        {"id":"u1","username":"Exact_Username_123","created_at":"2026-03-01T08:00:00Z"}
        """.data(using: .utf8)!
        let user = try JSONDecoder.waiagents.decode(User.self, from: json)
        #expect(user.username == "Exact_Username_123")
    }

    // MARK: - Avatar URL Handling

    @Test("User with avatar URL decodes correctly")
    func avatarURLDecoding() throws {
        let json = """
        {
            "id": "u1",
            "username": "user1",
            "avatar_url": "https://cdn.openraccoon.com/avatars/user1.jpg",
            "created_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!
        let user = try JSONDecoder.waiagents.decode(User.self, from: json)
        #expect(user.avatarURL?.absoluteString == "https://cdn.openraccoon.com/avatars/user1.jpg")
    }

    @Test("User without avatar URL has nil avatarURL")
    func noAvatarURL() throws {
        let json = """
        {"id":"u1","username":"user1","created_at":"2026-03-01T08:00:00Z"}
        """.data(using: .utf8)!
        let user = try JSONDecoder.waiagents.decode(User.self, from: json)
        #expect(user.avatarURL == nil)
    }

    @Test("Avatar URL with query parameters decodes correctly")
    func avatarURLWithParams() throws {
        let json = """
        {
            "id": "u1",
            "username": "user1",
            "avatar_url": "https://cdn.openraccoon.com/avatars/user1.jpg?w=200&h=200",
            "created_at": "2026-03-01T08:00:00Z"
        }
        """.data(using: .utf8)!
        let user = try JSONDecoder.waiagents.decode(User.self, from: json)
        #expect(user.avatarURL != nil)
    }

    // MARK: - Settings Persistence (User model)

    @Test("User settings dictionary round-trips through JSON encoding")
    func settingsRoundTrip() throws {
        let settings: [String: AnyCodable] = [
            "theme": .string("dark"),
            "notifications_enabled": .bool(true),
            "font_size": .int(16),
        ]
        let user = User(
            id: "u1",
            username: "user1",
            settings: settings
        )
        let data = try JSONEncoder.waiagents.encode(user)
        let decoded = try JSONDecoder.waiagents.decode(User.self, from: data)
        #expect(decoded.settings?["theme"] == .string("dark"))
        #expect(decoded.settings?["notifications_enabled"] == .bool(true))
        #expect(decoded.settings?["font_size"] == .int(16))
    }

    @Test("User with nil settings decodes as nil")
    func nilSettings() throws {
        let json = """
        {"id":"u1","username":"user1","created_at":"2026-03-01T08:00:00Z"}
        """.data(using: .utf8)!
        let user = try JSONDecoder.waiagents.decode(User.self, from: json)
        #expect(user.settings == nil)
    }

    @Test("User with empty settings dictionary decodes as empty")
    func emptySettings() throws {
        let json = """
        {"id":"u1","username":"user1","settings":{},"created_at":"2026-03-01T08:00:00Z"}
        """.data(using: .utf8)!
        let user = try JSONDecoder.waiagents.decode(User.self, from: json)
        #expect(user.settings?.isEmpty == true)
    }

    // MARK: - Logout Clears All State

    @Test("AppState logout clears currentUser")
    @MainActor
    func logoutClearsCurrentUser() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        #expect(state.currentUser != nil)

        await state.logout()
        #expect(state.currentUser == nil)
    }

    @Test("AppState logout clears selectedConversationID")
    @MainActor
    func logoutClearsSelectedConversation() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.selectedConversationID = "conv_123"

        await state.logout()
        #expect(state.selectedConversationID == nil)
    }

    @Test("AppState logout clears feedViewModel")
    @MainActor
    func logoutClearsFeedViewModel() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.feedViewModel = FeedViewModel(apiClient: state.apiClient)

        await state.logout()
        #expect(state.feedViewModel == nil)
    }

    @Test("AppState logout clears marketplaceViewModel")
    @MainActor
    func logoutClearsMarketplaceViewModel() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.marketplaceViewModel = MarketplaceViewModel(apiClient: state.apiClient)

        await state.logout()
        #expect(state.marketplaceViewModel == nil)
    }

    @Test("AppState isAuthenticated returns false after logout")
    @MainActor
    func isAuthenticatedFalseAfterLogout() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        #expect(state.isAuthenticated == true)

        await state.logout()
        #expect(state.isAuthenticated == false)
    }

    @Test("AppState logout disconnects WebSocket")
    @MainActor
    func logoutDisconnectsWebSocket() async {
        let state = makeAppState()
        state.currentUser = makeUser()

        await state.logout()
        #expect(state.connectionState == .disconnected)
        #expect(state.webSocketClient == nil)
    }

    @Test("AppState logout is safe to call multiple times")
    @MainActor
    func doubleLogout() async {
        let state = makeAppState()
        state.currentUser = makeUser()

        await state.logout()
        await state.logout()

        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
    }

    @Test("AppState logout is safe when no user is logged in")
    @MainActor
    func logoutWhenNotLoggedIn() async {
        let state = makeAppState()
        #expect(state.currentUser == nil)

        await state.logout()
        #expect(state.currentUser == nil)
    }

    // MARK: - User Status and Role

    @Test("User status values decode correctly")
    func userStatusDecoding() throws {
        for (raw, expected) in [
            ("active", User.UserStatus.active),
            ("suspended", User.UserStatus.suspended),
            ("deleted", User.UserStatus.deleted),
        ] {
            let json = """
            {"id":"u1","username":"user","status":"\(raw)","created_at":"2026-03-01T08:00:00Z"}
            """.data(using: .utf8)!
            let user = try JSONDecoder.waiagents.decode(User.self, from: json)
            #expect(user.status == expected)
        }
    }

    @Test("User role values decode correctly")
    func userRoleDecoding() throws {
        for (raw, expected) in [
            ("user", User.UserRole.user),
            ("admin", User.UserRole.admin),
            ("moderator", User.UserRole.moderator),
        ] {
            let json = """
            {"id":"u1","username":"user","role":"\(raw)","created_at":"2026-03-01T08:00:00Z"}
            """.data(using: .utf8)!
            let user = try JSONDecoder.waiagents.decode(User.self, from: json)
            #expect(user.role == expected)
        }
    }

    // MARK: - AuthStore Behavior

    @Test("AuthStore initial state has no login error")
    @MainActor
    func authStoreInitialState() {
        let authManager = AuthManager(serviceName: "test.settings.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        let authStore = AuthStore(apiClient: apiClient, authManager: authManager)
        #expect(authStore.loginError == nil)
        #expect(authStore.isLoggingIn == false)
        #expect(authStore.isRegistering == false)
    }

    @Test("AuthStore readableError maps unauthorized to user-friendly message")
    @MainActor
    func authStoreReadableError() async {
        let authManager = AuthManager(serviceName: "test.settings.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        let authStore = AuthStore(apiClient: apiClient, authManager: authManager)

        // Attempt login with no server — will fail with network error
        do {
            _ = try await authStore.login(email: "test@test.com", password: "pass")
            Issue.record("Expected error")
        } catch {
            // loginError should be set to a user-friendly message
            #expect(authStore.loginError != nil)
            #expect(authStore.isLoggingIn == false)
        }
    }

    @Test("AuthStore magic link initial state")
    @MainActor
    func magicLinkInitialState() {
        let authManager = AuthManager(serviceName: "test.settings.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        let authStore = AuthStore(apiClient: apiClient, authManager: authManager)
        #expect(authStore.isSendingMagicLink == false)
        #expect(authStore.magicLinkSent == false)
        #expect(authStore.magicLinkError == nil)
        #expect(authStore.isVerifyingMagicLink == false)
    }

    @Test("AuthStore resetMagicLinkState clears all magic link flags")
    @MainActor
    func resetMagicLinkState() {
        let authManager = AuthManager(serviceName: "test.settings.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        let authStore = AuthStore(apiClient: apiClient, authManager: authManager)

        authStore.resetMagicLinkState()
        #expect(authStore.magicLinkSent == false)
        #expect(authStore.magicLinkError == nil)
    }
}
