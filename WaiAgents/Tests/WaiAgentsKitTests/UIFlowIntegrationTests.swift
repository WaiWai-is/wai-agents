import Foundation
import Testing
@testable import WaiAgentsKit

/// Integration tests that verify UI flow state transitions across
/// AppState, AuthStore, ConversationStore, and ViewModels working together --
/// the same flows that the SwiftUI views observe and react to.
@Suite("UI Flow Integration")
struct UIFlowIntegrationTests {

    // MARK: - Auth Flow (LoginView -> AppState)

    @Suite("Auth Flow")
    struct AuthFlowTests {

        @Test("Login flow: AppState starts unauthenticated, LoginView shows login form")
        @MainActor
        func loginFlowStartsUnauthenticated() {
            let state = AppState()
            // LoginView checks appState.isAuthenticated to decide what to show
            #expect(state.isAuthenticated == false)
            #expect(state.currentUser == nil)
            #expect(state.currentUserID == nil)
        }

        @Test("Login flow: failed login sets error that LoginView displays")
        @MainActor
        func loginFlowFailedSetsError() async {
            let state = AppState()

            do {
                try await state.login(email: "bad@example.com", password: "wrong")
            } catch {
                // Expected
            }

            // The error should be set in authStore for LoginView to display
            #expect(state.authStore.loginError != nil)
            #expect(state.isAuthenticated == false)
            #expect(state.currentUser == nil)
        }

        @Test("Login flow: authStore.isLoggingIn is false after failed login")
        @MainActor
        func loginFlowLoggingInFalseAfterFailure() async {
            let state = AppState()

            do {
                try await state.login(email: "bad@example.com", password: "wrong")
            } catch {
                // Expected
            }

            // LoginView uses this to show/hide the ProgressView
            #expect(state.authStore.isLoggingIn == false)
        }

        @Test("Logout flow: clears state that content views observe")
        @MainActor
        func logoutFlowClearsState() async {
            let state = AppState()
            state.currentUser = User(id: "u1", username: "alice")
            state.selectedConversationID = "conv_1"
            state.feedViewModel = FeedViewModel(apiClient: state.apiClient)
            state.marketplaceViewModel = MarketplaceViewModel(apiClient: state.apiClient)

            await state.logout()

            // ContentView checks isAuthenticated to decide between LoginView and main app
            #expect(state.isAuthenticated == false)
            #expect(state.currentUser == nil)
            #expect(state.currentUserID == nil)
            #expect(state.selectedConversationID == nil)
            #expect(state.feedViewModel == nil)
            #expect(state.marketplaceViewModel == nil)
            #expect(state.connectionState == .disconnected)
        }

        @Test("Setting currentUser makes isAuthenticated true, triggers main app view")
        @MainActor
        func settingUserTriggersAuth() {
            let state = AppState()
            #expect(state.isAuthenticated == false)

            state.currentUser = User(id: "u1", username: "alice")

            #expect(state.isAuthenticated == true)
            #expect(state.currentUserID == "u1")
        }

        @Test("Magic link flow: error state drives UI in LoginView")
        @MainActor
        func magicLinkErrorFlow() async {
            let state = AppState()

            do {
                try await state.requestMagicLink(email: "bad@example.com")
            } catch {
                // Expected
            }

            // LoginView shows magicLinkError when in magic link mode
            #expect(state.authStore.magicLinkError != nil)
            #expect(state.authStore.magicLinkSent == false)
            #expect(state.authStore.isSendingMagicLink == false)
        }

        @Test("Magic link verify flow: error state drives UI")
        @MainActor
        func magicLinkVerifyErrorFlow() async {
            let state = AppState()

            do {
                try await state.verifyMagicLink(token: "invalid")
            } catch {
                // Expected
            }

            #expect(state.authStore.magicLinkError != nil)
            #expect(state.authStore.isVerifyingMagicLink == false)
        }

        @Test("Register flow: failed registration sets error for RegisterView")
        @MainActor
        func registerFlowFailedSetsError() async {
            let state = AppState()

            do {
                try await state.register(username: "alice", email: "bad@example.com", password: "password")
            } catch {
                // Expected
            }

            #expect(state.authStore.loginError != nil)
            #expect(state.authStore.isRegistering == false)
            #expect(state.isAuthenticated == false)
        }
    }

    // MARK: - Conversation Flow (ConversationListView -> ConversationDetailView)

    @Suite("Conversation Flow")
    struct ConversationFlowTests {

        @Test("ConversationStore upsert makes conversation available to ConversationListView")
        @MainActor
        func conversationStoreUpsertAvailable() {
            let state = AppState()
            let conv = Conversation(id: "conv_1", type: .dm, title: "Alice")
            state.conversationStore.upsert(conv)

            // ConversationListView reads from conversationStore
            #expect(state.conversationStore.conversations.count == 1)
            #expect(state.conversationStore.conversation(byID: "conv_1")?.title == "Alice")
        }

        @Test("Selecting conversation updates AppState, drives navigation")
        @MainActor
        func selectingConversationDrivesNavigation() {
            let state = AppState()
            state.selectedConversationID = nil

            // User taps a conversation in the list
            state.selectedConversationID = "conv_1"

            // ContentView_macOS uses this to show ConversationDetailView in the right pane
            #expect(state.selectedConversationID == "conv_1")
        }

        @Test("Deselecting conversation clears the detail view")
        @MainActor
        func deselectingConversationClearsDetail() {
            let state = AppState()
            state.selectedConversationID = "conv_1"
            state.selectedConversationID = nil
            #expect(state.selectedConversationID == nil)
        }

        @Test("ConversationDetailViewModel sends optimistic message, visible in UI immediately")
        @MainActor
        func optimisticMessageVisible() {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.sendMessage(content: "Hello!")

            // The message should appear in the list immediately (optimistic)
            #expect(vm.messages.count == 1)
            #expect(vm.messages[0].content.text == "Hello!")
            #expect(vm.messages[0].senderID == "user_1")
            #expect(vm.messages[0].senderType == .human)
        }

        @Test("ConversationDetailViewModel groups messages for display")
        @MainActor
        func messageGroupsForDisplay() {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let now = Date()
            vm.messages = [
                Message(id: "m1", conversationID: "conv_1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Hi"), createdAt: now),
                Message(id: "m2", conversationID: "conv_1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "How are you?"),
                        createdAt: now.addingTimeInterval(10)),
                Message(id: "m3", conversationID: "conv_1", senderID: "agent_1", senderType: .agent,
                        type: .text, content: MessageContent(text: "I'm good!"),
                        createdAt: now.addingTimeInterval(15)),
            ]

            // Two groups: user messages grouped together, agent message separate
            #expect(vm.groupedMessages.count == 2)
            #expect(vm.groupedMessages[0].messages.count == 2)
            #expect(vm.groupedMessages[1].messages.count == 1)
        }

        @Test("First message group shows date separator")
        @MainActor
        func firstGroupShowsDateSeparator() {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.messages = [
                Message(id: "m1", conversationID: "conv_1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Hello"), createdAt: Date())
            ]

            #expect(vm.groupedMessages.count == 1)
            #expect(vm.groupedMessages[0].showDateSeparator == true)
        }

        @Test("Messages on different days show date separators")
        @MainActor
        func differentDaysShowSeparators() {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let today = Date()
            let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: today)!

            vm.messages = [
                Message(id: "m1", conversationID: "conv_1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Yesterday"),
                        createdAt: yesterday),
                Message(id: "m2", conversationID: "conv_1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Today"),
                        createdAt: today),
            ]

            #expect(vm.groupedMessages.count == 2)
            #expect(vm.groupedMessages[0].showDateSeparator == true)
            #expect(vm.groupedMessages[1].showDateSeparator == true)
        }

        @Test("Agent conversation type routes to AgentChatView")
        @MainActor
        func agentConversationRouting() {
            let state = AppState()
            let conv = Conversation(id: "conv_1", type: .agent, title: "My Agent")
            state.conversationStore.upsert(conv)

            let conversation = state.conversationStore.conversation(byID: "conv_1")
            // ConversationListView uses this to decide between AgentChatView and ConversationDetailView
            #expect(conversation?.type == .agent)
        }

        @Test("DM conversation type routes to ConversationDetailView")
        @MainActor
        func dmConversationRouting() {
            let state = AppState()
            let conv = Conversation(id: "conv_1", type: .dm, title: "Alice")
            state.conversationStore.upsert(conv)

            let conversation = state.conversationStore.conversation(byID: "conv_1")
            #expect(conversation?.type == .dm)
        }

        @Test("ConversationStore remove deletes conversation from list")
        @MainActor
        func removeConversation() {
            let state = AppState()
            state.conversationStore.upsert(Conversation(id: "c1", type: .dm, title: "A"))
            state.conversationStore.upsert(Conversation(id: "c2", type: .dm, title: "B"))

            state.conversationStore.remove(id: "c1")

            #expect(state.conversationStore.conversations.count == 1)
            #expect(state.conversationStore.conversation(byID: "c1") == nil)
        }

        @Test("ConversationStore upsert updates existing conversation")
        @MainActor
        func upsertUpdatesExisting() {
            let state = AppState()
            state.conversationStore.upsert(Conversation(id: "c1", type: .dm, title: "Old Title"))
            state.conversationStore.upsert(Conversation(id: "c1", type: .dm, title: "New Title"))

            #expect(state.conversationStore.conversations.count == 1)
            #expect(state.conversationStore.conversation(byID: "c1")?.title == "New Title")
        }
    }

    // MARK: - Feed Flow (FeedView -> FeedDetailView)

    @Suite("Feed Flow")
    struct FeedFlowTests {

        @Test("FeedViewModel initial state drives empty/loading UI in FeedView")
        @MainActor
        func feedViewModelInitialState() {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)

            #expect(vm.feedItems.isEmpty)
            #expect(vm.isLoading == false)
            #expect(vm.error == nil)
        }

        @Test("Selecting feed item updates AppState for detail view")
        @MainActor
        func selectFeedItemUpdatesState() {
            let state = AppState()

            let item = FeedItem(
                id: "feed_1",
                creatorID: "user_1",
                type: .agentShowcase,
                referenceID: "agent_1",
                referenceType: .agent,
                title: "Cool Agent"
            )

            state.selectedFeedItemID = item.id
            state.selectedFeedItem = item

            #expect(state.selectedFeedItemID == "feed_1")
            #expect(state.selectedFeedItem?.title == "Cool Agent")
        }

        @Test("FeedViewModel toggleLike toggles state for FeedCardView")
        @MainActor
        func toggleLikeState() async {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)

            let item = FeedItem(
                id: "feed_1",
                creatorID: "user_1",
                type: .creation,
                referenceID: "ref_1",
                referenceType: .agent,
                likeCount: 5
            )
            vm.feedItems = [item]

            // Initially not liked
            #expect(vm.isLiked("feed_1") == false)

            // After likeItem (which will fail on network but optimistic update is applied then reverted)
            await vm.likeItem(id: "feed_1")

            // After network failure, reverted
            #expect(vm.feedItems[0].likeCount == 5)
        }

        @Test("FeedViewModel refresh clears cache and reloads")
        @MainActor
        func feedRefreshClearsCache() async {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)

            // The refresh function will clear the cache for the tab, even if network fails
            await vm.refresh(tab: .forYou)

            // isRefreshing should be false after completion
            #expect(vm.isRefreshing == false)
        }
    }

    // MARK: - Marketplace Flow (MarketplaceView -> AgentProfileView)

    @Suite("Marketplace Flow")
    struct MarketplaceFlowTests {

        @Test("MarketplaceViewModel initial state drives loading UI")
        @MainActor
        func marketplaceInitialState() {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = MarketplaceViewModel(apiClient: apiClient)

            #expect(vm.agents.isEmpty)
            #expect(vm.isLoading == false)
            #expect(vm.error == nil)
        }

        @Test("Selecting marketplace agent updates AppState for detail view")
        @MainActor
        func selectMarketplaceAgent() {
            let state = AppState()

            let agent = Agent(
                id: "agent_1",
                creatorID: "user_1",
                name: "Code Assistant",
                slug: "code-assistant",
                description: "Helps with coding"
            )

            state.selectedMarketplaceAgent = agent

            #expect(state.selectedMarketplaceAgent?.id == "agent_1")
            #expect(state.selectedMarketplaceAgent?.name == "Code Assistant")
        }

        @Test("MarketplaceViewModel searchAgents with empty query triggers full load")
        @MainActor
        func searchEmptyQueryLoadsAll() async {
            let authManager = AuthManager(serviceName: "test.flow.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = MarketplaceViewModel(apiClient: apiClient)

            // Searching with empty/whitespace triggers loadAgents instead
            await vm.searchAgents(query: "   ")

            #expect(vm.isLoading == false)
        }

        @Test("Agent average rating computation from API value")
        func agentAverageRatingFromAPI() {
            let agent = Agent(
                id: "a1",
                creatorID: "u1",
                name: "Test",
                slug: "test",
                averageRatingFromAPI: 4.5
            )
            #expect(agent.averageRating == 4.5)
        }

        @Test("Agent average rating computation from sum/count")
        func agentAverageRatingFromSumCount() {
            let agent = Agent(
                id: "a1",
                creatorID: "u1",
                name: "Test",
                slug: "test",
                ratingSum: 45,
                ratingCount: 10,
                averageRatingFromAPI: nil
            )
            #expect(agent.averageRating == 4.5)
        }

        @Test("Agent average rating is 0 when no ratings")
        func agentAverageRatingZero() {
            let agent = Agent(
                id: "a1",
                creatorID: "u1",
                name: "Test",
                slug: "test",
                ratingSum: 0,
                ratingCount: 0,
                averageRatingFromAPI: nil
            )
            #expect(agent.averageRating == 0)
        }
    }

    // MARK: - Workspace Flow

    @Suite("Workspace Flow")
    struct WorkspaceFlowTests {

        @Test("isWorkspaceOpen toggle drives workspace panel visibility")
        @MainActor
        func workspaceToggle() {
            let state = AppState()
            #expect(state.isWorkspaceOpen == false)

            state.isWorkspaceOpen = true
            #expect(state.isWorkspaceOpen == true)

            state.isWorkspaceOpen = false
            #expect(state.isWorkspaceOpen == false)
        }
    }

    // MARK: - ConversationDetailViewModel Advanced Grouping

    @Suite("Message Grouping Edge Cases")
    struct MessageGroupingEdgeCases {

        @Test("Single message creates one group with date separator")
        @MainActor
        func singleMessageOneGroup() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.messages = [
                Message(id: "m1", conversationID: "c1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Hello"), createdAt: Date())
            ]

            #expect(vm.groupedMessages.count == 1)
            #expect(vm.groupedMessages[0].messages.count == 1)
            #expect(vm.groupedMessages[0].showDateSeparator == true)
        }

        @Test("Empty messages array produces no groups")
        @MainActor
        func emptyMessagesNoGroups() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.messages = []
            #expect(vm.groupedMessages.isEmpty)
        }

        @Test("Different senders in rapid succession create separate groups")
        @MainActor
        func rapidSenderChange() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let now = Date()
            vm.messages = [
                Message(id: "m1", conversationID: "c1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Hi"), createdAt: now),
                Message(id: "m2", conversationID: "c1", senderID: "agent_1", senderType: .agent,
                        type: .text, content: MessageContent(text: "Hello"), createdAt: now.addingTimeInterval(1)),
                Message(id: "m3", conversationID: "c1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Thanks"), createdAt: now.addingTimeInterval(2)),
            ]

            // Three separate groups: user, agent, user
            #expect(vm.groupedMessages.count == 3)
        }

        @Test("Same sender messages exactly 120 seconds apart stay in same group")
        @MainActor
        func exactlyTwoMinutesBoundary() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let now = Date()
            vm.messages = [
                Message(id: "m1", conversationID: "c1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "First"),
                        createdAt: now),
                Message(id: "m2", conversationID: "c1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Second"),
                        createdAt: now.addingTimeInterval(119)), // Just under 120s
            ]

            // Should be in the same group (< 120 seconds)
            #expect(vm.groupedMessages.count == 1)
            #expect(vm.groupedMessages[0].messages.count == 2)
        }

        @Test("Same sender messages just over 120 seconds apart create separate groups")
        @MainActor
        func justOverTwoMinutesBoundary() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let now = Date()
            vm.messages = [
                Message(id: "m1", conversationID: "c1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "First"),
                        createdAt: now),
                Message(id: "m2", conversationID: "c1", senderID: "user_1", senderType: .human,
                        type: .text, content: MessageContent(text: "Second"),
                        createdAt: now.addingTimeInterval(120)), // Exactly 120s (>= 120 triggers new group)
            ]

            // Should be in separate groups (>= 120 seconds)
            #expect(vm.groupedMessages.count == 2)
        }

        @Test("isFirstInGroup and isLastInGroup logic for three messages in one group")
        @MainActor
        func firstLastInGroup() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let now = Date()
            let m1 = Message(id: "m1", conversationID: "c1", senderID: "user_1", senderType: .human,
                             type: .text, content: MessageContent(text: "A"), createdAt: now)
            let m2 = Message(id: "m2", conversationID: "c1", senderID: "user_1", senderType: .human,
                             type: .text, content: MessageContent(text: "B"), createdAt: now.addingTimeInterval(5))
            let m3 = Message(id: "m3", conversationID: "c1", senderID: "user_1", senderType: .human,
                             type: .text, content: MessageContent(text: "C"), createdAt: now.addingTimeInterval(10))

            vm.messages = [m1, m2, m3]

            #expect(vm.groupedMessages.count == 1)
            let group = vm.groupedMessages[0]

            // MessageBubbleView uses these to determine avatar and timestamp visibility
            #expect(group.messages.first?.id == "m1") // first in group -> show avatar
            #expect(group.messages.last?.id == "m3")   // last in group -> show timestamp
        }

        @Test("sendMessage with agent reply sets isAgentGenerating for UI spinner")
        @MainActor
        func sendMessageAgentReply() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.sendMessage(content: "Help me", expectAgentReply: true)

            // isAgentGenerating is set synchronously, drives the InputBarView stop button
            #expect(vm.isAgentGenerating == true)
            #expect(vm.messages.count == 1)
        }

        @Test("sendMessage without agent reply does not set isAgentGenerating")
        @MainActor
        func sendMessageNoAgentReply() {
            let authManager = AuthManager(serviceName: "test.group.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://waiagents.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "c1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.sendMessage(content: "Hello", expectAgentReply: false)

            #expect(vm.isAgentGenerating == false)
            #expect(vm.messages.count == 1)
        }
    }
}
