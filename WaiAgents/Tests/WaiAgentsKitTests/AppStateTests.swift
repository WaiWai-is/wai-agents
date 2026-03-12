import Foundation
import Testing
@testable import WaiAgentsKit

@Suite("AppState")
struct AppStateTests {

    // MARK: - Initial State

    @Test("Initial state has nil currentUser")
    @MainActor
    func initialCurrentUserNil() {
        let state = AppState()
        #expect(state.currentUser == nil)
    }

    @Test("Initial state has isAuthenticated false")
    @MainActor
    func initialIsAuthenticatedFalse() {
        let state = AppState()
        #expect(state.isAuthenticated == false)
    }

    @Test("Initial state has nil selectedConversationID")
    @MainActor
    func initialSelectedConversationNil() {
        let state = AppState()
        #expect(state.selectedConversationID == nil)
    }

    @Test("Initial state has disconnected connectionState")
    @MainActor
    func initialConnectionStateDisconnected() {
        let state = AppState()
        #expect(state.connectionState == .disconnected)
    }

    @Test("Initial state has nil webSocketClient")
    @MainActor
    func initialWebSocketClientNil() {
        let state = AppState()
        #expect(state.webSocketClient == nil)
    }

    @Test("Initial state has nil feedViewModel")
    @MainActor
    func initialFeedViewModelNil() {
        let state = AppState()
        #expect(state.feedViewModel == nil)
    }

    @Test("Initial state has nil marketplaceViewModel")
    @MainActor
    func initialMarketplaceViewModelNil() {
        let state = AppState()
        #expect(state.marketplaceViewModel == nil)
    }

    @Test("Initial state has empty conversationStore")
    @MainActor
    func initialConversationStoreEmpty() {
        let state = AppState()
        #expect(state.conversationStore.conversations.isEmpty)
    }

    @Test("Initial state has empty messageStore")
    @MainActor
    func initialMessageStoreEmpty() {
        let state = AppState()
        #expect(state.messageStore.messages.isEmpty)
    }

    @Test("Initial state has isWorkspaceOpen false")
    @MainActor
    func initialIsWorkspaceOpenFalse() {
        let state = AppState()
        #expect(state.isWorkspaceOpen == false)
    }

    // MARK: - isAuthenticated Computed Property

    @Test("isAuthenticated returns true when currentUser is set")
    @MainActor
    func isAuthenticatedTrueWhenUserSet() {
        let state = AppState()
        state.currentUser = User(id: "u1", username: "alice")
        #expect(state.isAuthenticated == true)
    }

    @Test("isAuthenticated returns false when currentUser is nil")
    @MainActor
    func isAuthenticatedFalseWhenUserNil() {
        let state = AppState()
        state.currentUser = User(id: "u1", username: "alice")
        #expect(state.isAuthenticated == true)

        state.currentUser = nil
        #expect(state.isAuthenticated == false)
    }

    // MARK: - currentUserID

    @Test("currentUserID returns user ID when authenticated")
    @MainActor
    func currentUserIDWhenAuthenticated() {
        let state = AppState()
        state.currentUser = User(id: "user_42", username: "bob")
        #expect(state.currentUserID == "user_42")
    }

    @Test("currentUserID returns nil when not authenticated")
    @MainActor
    func currentUserIDNilWhenNotAuthenticated() {
        let state = AppState()
        #expect(state.currentUserID == nil)
    }

    // MARK: - Logout State Changes

    @Test("logout clears currentUser and selectedConversationID")
    @MainActor
    func logoutClearsState() async {
        let state = AppState()
        state.currentUser = User(id: "u1", username: "alice")
        state.selectedConversationID = "conv_1"

        await state.logout()

        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
        #expect(state.selectedConversationID == nil)
    }

    @Test("logout clears feedViewModel and marketplaceViewModel")
    @MainActor
    func logoutClearsViewModels() async {
        let state = AppState()
        state.currentUser = User(id: "u1", username: "alice")
        state.feedViewModel = FeedViewModel(apiClient: state.apiClient)
        state.marketplaceViewModel = MarketplaceViewModel(apiClient: state.apiClient)

        await state.logout()

        #expect(state.feedViewModel == nil)
        #expect(state.marketplaceViewModel == nil)
    }

    @Test("logout sets connectionState to disconnected")
    @MainActor
    func logoutDisconnectsWebSocket() async {
        let state = AppState()
        state.currentUser = User(id: "u1", username: "alice")
        state.connectionState = .connected

        await state.logout()

        #expect(state.connectionState == .disconnected)
    }

    // MARK: - Selected State

    @Test("selectedConversationID can be set and read")
    @MainActor
    func selectedConversationID() {
        let state = AppState()
        state.selectedConversationID = "conv_42"
        #expect(state.selectedConversationID == "conv_42")
    }

    @Test("selectedFeedItemID can be set and read")
    @MainActor
    func selectedFeedItemID() {
        let state = AppState()
        state.selectedFeedItemID = "feed_1"
        #expect(state.selectedFeedItemID == "feed_1")
    }

    @Test("isWorkspaceOpen can be toggled")
    @MainActor
    func isWorkspaceOpenToggle() {
        let state = AppState()
        #expect(state.isWorkspaceOpen == false)
        state.isWorkspaceOpen = true
        #expect(state.isWorkspaceOpen == true)
    }

    // MARK: - Sub-stores

    @Test("conversationStore is accessible and functional")
    @MainActor
    func conversationStoreAccessible() {
        let state = AppState()
        let conv = Conversation(id: "c1", type: .dm, title: "Test")
        state.conversationStore.upsert(conv)
        #expect(state.conversationStore.conversations.count == 1)
        #expect(state.conversationStore.conversation(byID: "c1")?.title == "Test")
    }

    @Test("messageStore is accessible and functional")
    @MainActor
    func messageStoreAccessible() {
        let state = AppState()
        let msg = Message(
            id: "m1",
            conversationID: "c1",
            senderType: .human,
            type: .text,
            content: MessageContent(text: "Hello")
        )
        state.messageStore.appendMessage(msg, to: "c1")
        #expect(state.messageStore.messages(for: "c1").count == 1)
    }

    @Test("authStore is accessible")
    @MainActor
    func authStoreAccessible() {
        let state = AppState()
        #expect(state.authStore.isLoggingIn == false)
        #expect(state.authStore.isRegistering == false)
        #expect(state.authStore.loginError == nil)
    }

    // MARK: - AppState Custom BaseURL

    @Test("AppState can be initialized with custom base URL")
    @MainActor
    func customBaseURL() {
        let customURL = URL(string: "https://staging.openraccoon.com")!
        let state = AppState(baseURL: customURL)
        #expect(state.currentUser == nil)
        #expect(state.isAuthenticated == false)
    }
}
