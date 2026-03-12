import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for navigation-related logic: tab selection (via AppState),
/// deep linking to conversation/agent, navigation state management,
/// sidebar destination enum, sheet/modal presentation state,
/// navigation state preservation across logout/login, and macOS sidebar behavior.
@Suite("Navigation Tests")
struct NavigationTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    @MainActor
    private func makeAppState() -> AppState {
        AppState(baseURL: baseURL)
    }

    private func makeUser(
        id: String = "user_1",
        username: String = "testuser"
    ) -> User {
        User(id: id, username: username)
    }

    private func makeConversation(
        id: String = "conv_1",
        type: Conversation.ConversationType = .dm,
        title: String? = "Test Conversation"
    ) -> Conversation {
        Conversation(id: id, type: type, title: title)
    }

    private func makeAgent(
        id: String = "agent_1",
        name: String = "Test Agent",
        slug: String = "test-agent"
    ) -> Agent {
        Agent(id: id, creatorID: "user_1", name: name, slug: slug)
    }

    private func makeFeedItem(
        id: String = "feed_1",
        title: String? = "Test Feed Item"
    ) -> FeedItem {
        FeedItem(
            id: id,
            creatorID: "user_1",
            type: .agentShowcase,
            referenceID: "ref_\(id)",
            referenceType: .agent,
            title: title
        )
    }

    // MARK: - SidebarDestination Enum (macOS)

    #if os(macOS)
    @Test("SidebarDestination has three cases")
    func sidebarDestinationCases() {
        let allCases = SidebarDestination.allCases
        #expect(allCases.count == 3)
    }

    @Test("SidebarDestination raw values match expected strings")
    func sidebarDestinationRawValues() {
        #expect(SidebarDestination.chats.rawValue == "chats")
        #expect(SidebarDestination.feed.rawValue == "feed")
        #expect(SidebarDestination.marketplace.rawValue == "marketplace")
    }

    @Test("SidebarDestination id is its rawValue")
    func sidebarDestinationID() {
        for dest in SidebarDestination.allCases {
            #expect(dest.id == dest.rawValue)
        }
    }

    @Test("SidebarDestination equality works")
    func sidebarDestinationEquality() {
        #expect(SidebarDestination.chats == SidebarDestination.chats)
        #expect(SidebarDestination.chats != SidebarDestination.feed)
    }
    #endif

    // MARK: - Deep Linking to Conversation

    @Test("Setting selectedConversationID navigates to conversation")
    @MainActor
    func deepLinkToConversation() {
        let state = makeAppState()
        state.selectedConversationID = "conv_42"
        #expect(state.selectedConversationID == "conv_42")
    }

    @Test("Setting selectedConversationID to nil deselects")
    @MainActor
    func deselectConversation() {
        let state = makeAppState()
        state.selectedConversationID = "conv_42"
        state.selectedConversationID = nil
        #expect(state.selectedConversationID == nil)
    }

    @Test("Deep link to conversation with store lookup returns correct conversation")
    @MainActor
    func deepLinkConversationLookup() {
        let state = makeAppState()
        let conv = makeConversation(id: "conv_deep", type: .agent, title: "Deep Linked")
        state.conversationStore.upsert(conv)
        state.selectedConversationID = "conv_deep"

        let found = state.conversationStore.conversation(byID: state.selectedConversationID!)
        #expect(found?.id == "conv_deep")
        #expect(found?.title == "Deep Linked")
        #expect(found?.type == .agent)
    }

    @Test("Deep link to non-existent conversation returns nil from store")
    @MainActor
    func deepLinkNonExistentConversation() {
        let state = makeAppState()
        state.selectedConversationID = "conv_missing"
        let found = state.conversationStore.conversation(byID: "conv_missing")
        #expect(found == nil)
    }

    @Test("Changing selectedConversationID switches active conversation")
    @MainActor
    func switchConversation() {
        let state = makeAppState()
        state.conversationStore.upsert(makeConversation(id: "c1", title: "First"))
        state.conversationStore.upsert(makeConversation(id: "c2", title: "Second"))

        state.selectedConversationID = "c1"
        #expect(state.conversationStore.conversation(byID: state.selectedConversationID!)?.title == "First")

        state.selectedConversationID = "c2"
        #expect(state.conversationStore.conversation(byID: state.selectedConversationID!)?.title == "Second")
    }

    // MARK: - Deep Linking to Agent

    @Test("Setting selectedMarketplaceAgent navigates to agent profile")
    @MainActor
    func deepLinkToAgent() {
        let state = makeAppState()
        let agent = makeAgent(id: "agent_42", name: "AI Helper")
        state.selectedMarketplaceAgent = agent
        #expect(state.selectedMarketplaceAgent?.id == "agent_42")
        #expect(state.selectedMarketplaceAgent?.name == "AI Helper")
    }

    @Test("Clearing selectedMarketplaceAgent deselects agent")
    @MainActor
    func deselectAgent() {
        let state = makeAppState()
        state.selectedMarketplaceAgent = makeAgent()
        #expect(state.selectedMarketplaceAgent != nil)

        state.selectedMarketplaceAgent = nil
        #expect(state.selectedMarketplaceAgent == nil)
    }

    @Test("Switching between agents updates selection")
    @MainActor
    func switchAgent() {
        let state = makeAppState()
        state.selectedMarketplaceAgent = makeAgent(id: "a1", name: "First Agent")
        #expect(state.selectedMarketplaceAgent?.name == "First Agent")

        state.selectedMarketplaceAgent = makeAgent(id: "a2", name: "Second Agent")
        #expect(state.selectedMarketplaceAgent?.name == "Second Agent")
    }

    // MARK: - Deep Linking to Feed Item

    @Test("Setting selectedFeedItem navigates to feed detail")
    @MainActor
    func deepLinkToFeedItem() {
        let state = makeAppState()
        let item = makeFeedItem(id: "f_42", title: "Featured Item")
        state.selectedFeedItem = item
        #expect(state.selectedFeedItem?.id == "f_42")
        #expect(state.selectedFeedItem?.title == "Featured Item")
    }

    @Test("Setting selectedFeedItemID tracks selection")
    @MainActor
    func setSelectedFeedItemID() {
        let state = makeAppState()
        state.selectedFeedItemID = "f_42"
        #expect(state.selectedFeedItemID == "f_42")
    }

    @Test("Clearing selectedFeedItem and selectedFeedItemID deselects feed")
    @MainActor
    func deselectFeedItem() {
        let state = makeAppState()
        state.selectedFeedItem = makeFeedItem()
        state.selectedFeedItemID = "f_1"

        state.selectedFeedItem = nil
        state.selectedFeedItemID = nil

        #expect(state.selectedFeedItem == nil)
        #expect(state.selectedFeedItemID == nil)
    }

    // MARK: - Navigation State Management

    @Test("All navigation state starts as nil")
    @MainActor
    func allNavigationStateStartsNil() {
        let state = makeAppState()
        #expect(state.selectedConversationID == nil)
        #expect(state.selectedFeedItemID == nil)
        #expect(state.selectedFeedItem == nil)
        #expect(state.selectedMarketplaceAgent == nil)
    }

    @Test("Setting one selection does not affect others")
    @MainActor
    func selectionsAreIndependent() {
        let state = makeAppState()

        state.selectedConversationID = "conv_1"
        #expect(state.selectedFeedItemID == nil)
        #expect(state.selectedMarketplaceAgent == nil)

        state.selectedFeedItemID = "feed_1"
        #expect(state.selectedConversationID == "conv_1")
        #expect(state.selectedMarketplaceAgent == nil)

        state.selectedMarketplaceAgent = makeAgent()
        #expect(state.selectedConversationID == "conv_1")
        #expect(state.selectedFeedItemID == "feed_1")
    }

    // MARK: - Back Button / Deselection Behavior

    @Test("Deselecting conversation by setting nil simulates back button")
    @MainActor
    func backButtonConversation() {
        let state = makeAppState()
        state.selectedConversationID = "conv_1"
        #expect(state.selectedConversationID != nil)

        state.selectedConversationID = nil // "back"
        #expect(state.selectedConversationID == nil)
    }

    @Test("Deselecting agent by setting nil simulates back button")
    @MainActor
    func backButtonAgent() {
        let state = makeAppState()
        state.selectedMarketplaceAgent = makeAgent()
        state.selectedMarketplaceAgent = nil
        #expect(state.selectedMarketplaceAgent == nil)
    }

    @Test("Deselecting feed item by setting nil simulates back button")
    @MainActor
    func backButtonFeedItem() {
        let state = makeAppState()
        state.selectedFeedItem = makeFeedItem()
        state.selectedFeedItem = nil
        #expect(state.selectedFeedItem == nil)
    }

    // MARK: - Sheet / Modal Presentation State

    @Test("isWorkspaceOpen can be toggled to present workspace sheet")
    @MainActor
    func workspaceSheetPresentation() {
        let state = makeAppState()
        #expect(state.isWorkspaceOpen == false)

        state.isWorkspaceOpen = true
        #expect(state.isWorkspaceOpen == true)

        state.isWorkspaceOpen = false
        #expect(state.isWorkspaceOpen == false)
    }

    @Test("isWorkspaceOpen is independent of authentication state")
    @MainActor
    func workspaceIndependentOfAuth() {
        let state = makeAppState()
        state.isWorkspaceOpen = true
        #expect(state.isAuthenticated == false)
        #expect(state.isWorkspaceOpen == true)

        state.currentUser = makeUser()
        #expect(state.isAuthenticated == true)
        #expect(state.isWorkspaceOpen == true)
    }

    // MARK: - Navigation State Preservation

    @Test("Navigation selections survive connect/disconnect cycle")
    @MainActor
    func navigationSurvivesReconnect() {
        let state = makeAppState()
        state.selectedConversationID = "conv_persist"
        state.selectedFeedItemID = "feed_persist"

        state.connectWebSocket(accessToken: "token")
        state.disconnectWebSocket()

        #expect(state.selectedConversationID == "conv_persist")
        #expect(state.selectedFeedItemID == "feed_persist")
    }

    @Test("Logout clears selectedConversationID but not selectedFeedItemID")
    @MainActor
    func logoutClearsConversationOnly() async {
        let state = makeAppState()
        state.currentUser = makeUser()
        state.selectedConversationID = "conv_1"
        state.selectedFeedItemID = "feed_1"

        await state.logout()

        #expect(state.selectedConversationID == nil) // cleared by logout
        // selectedFeedItemID is NOT explicitly cleared by logout
        #expect(state.selectedFeedItemID == "feed_1")
    }

    @Test("Conversation store data persists after WebSocket disconnect")
    @MainActor
    func storeDataPersistsAfterDisconnect() {
        let state = makeAppState()
        state.conversationStore.upsert(makeConversation(id: "c1", title: "Persistent"))
        state.connectWebSocket(accessToken: "token")
        state.disconnectWebSocket()

        #expect(state.conversationStore.conversation(byID: "c1")?.title == "Persistent")
    }

    // MARK: - Agent Conversation Type Detection

    @Test("Agent conversation type routes to AgentChatView")
    @MainActor
    func agentConversationTypeDetection() {
        let state = makeAppState()
        state.conversationStore.upsert(makeConversation(id: "c_agent", type: .agent, title: "Agent Chat"))
        state.selectedConversationID = "c_agent"

        let conv = state.conversationStore.conversation(byID: "c_agent")
        #expect(conv?.type == .agent)
    }

    @Test("DM conversation type routes to ConversationDetailView")
    @MainActor
    func dmConversationTypeDetection() {
        let state = makeAppState()
        state.conversationStore.upsert(makeConversation(id: "c_dm", type: .dm, title: "Direct Message"))
        state.selectedConversationID = "c_dm"

        let conv = state.conversationStore.conversation(byID: "c_dm")
        #expect(conv?.type == .dm)
    }

    @Test("Group conversation type is detected correctly")
    @MainActor
    func groupConversationTypeDetection() {
        let state = makeAppState()
        state.conversationStore.upsert(makeConversation(id: "c_group", type: .group, title: "Group Chat"))
        state.selectedConversationID = "c_group"

        let conv = state.conversationStore.conversation(byID: "c_group")
        #expect(conv?.type == .group)
    }

    @Test("Bridge conversation type is detected correctly")
    @MainActor
    func bridgeConversationTypeDetection() {
        let state = makeAppState()
        state.conversationStore.upsert(makeConversation(id: "c_bridge", type: .bridge, title: "Bridge"))
        state.selectedConversationID = "c_bridge"

        let conv = state.conversationStore.conversation(byID: "c_bridge")
        #expect(conv?.type == .bridge)
    }

    // MARK: - Empty State Detection

    @Test("No selected conversation shows empty state")
    @MainActor
    func emptyStateWhenNoConversation() {
        let state = makeAppState()
        #expect(state.selectedConversationID == nil)
        // In the UI, nil selectedConversationID renders EmptyStateView
    }

    @Test("No selected feed item shows placeholder")
    @MainActor
    func emptyStateWhenNoFeedItem() {
        let state = makeAppState()
        #expect(state.selectedFeedItem == nil)
        // In the UI, nil selectedFeedItem renders SecondaryPanePlaceholder
    }

    @Test("No selected marketplace agent shows placeholder")
    @MainActor
    func emptyStateWhenNoAgent() {
        let state = makeAppState()
        #expect(state.selectedMarketplaceAgent == nil)
        // In the UI, nil selectedMarketplaceAgent renders SecondaryPanePlaceholder
    }
}
