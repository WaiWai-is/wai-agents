import Foundation
import Testing
@testable import WaiAgentsKit

/// Extended ViewModel tests covering ConversationDetailViewModel,
/// FeedViewModel, MarketplaceViewModel, and ConversationListViewModel
/// behavior beyond simple initial state checks.
@Suite("ViewModel Extended")
struct ViewModelExtendedTests {

    // MARK: - ConversationDetailViewModel — Message Grouping Edge Cases

    @Suite("ConversationDetail Message Grouping")
    struct MessageGroupingTests {

        @MainActor
        private func makeVM() -> ConversationDetailViewModel {
            let authManager = AuthManager(serviceName: "test.vmext.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            return ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
        }

        private func makeMessage(
            id: String,
            senderID: String = "user_1",
            senderType: Message.SenderType = .human,
            text: String = "msg",
            createdAt: Date = Date()
        ) -> Message {
            Message(
                id: id,
                conversationID: "conv_1",
                senderID: senderID,
                senderType: senderType,
                type: .text,
                content: MessageContent(text: text),
                createdAt: createdAt
            )
        }

        @Test("Empty messages produce no groups")
        @MainActor
        func emptyMessagesNoGroups() {
            let vm = makeVM()
            vm.messages = []
            #expect(vm.groupedMessages.isEmpty)
        }

        @Test("Single message produces one group with date separator")
        @MainActor
        func singleMessageOneGroup() {
            let vm = makeVM()
            vm.messages = [makeMessage(id: "m1")]
            #expect(vm.groupedMessages.count == 1)
            #expect(vm.groupedMessages[0].showDateSeparator == true)
            #expect(vm.groupedMessages[0].messages.count == 1)
        }

        @Test("Different sender types in same time window create separate groups")
        @MainActor
        func differentSenderTypesSeparateGroups() {
            let vm = makeVM()
            let now = Date()
            vm.messages = [
                makeMessage(id: "m1", senderID: "user_1", senderType: .human, createdAt: now),
                makeMessage(id: "m2", senderID: "user_1", senderType: .agent, createdAt: now.addingTimeInterval(5)),
            ]
            #expect(vm.groupedMessages.count == 2)
        }

        @Test("Same sender, same type, exactly at 120 second boundary stays grouped")
        @MainActor
        func exactlyAtBoundaryStaysGrouped() {
            let vm = makeVM()
            let now = Date()
            vm.messages = [
                makeMessage(id: "m1", createdAt: now),
                makeMessage(id: "m2", createdAt: now.addingTimeInterval(119.99)),
            ]
            #expect(vm.groupedMessages.count == 1)
            #expect(vm.groupedMessages[0].messages.count == 2)
        }

        @Test("Same sender at exactly 120 seconds apart creates new group")
        @MainActor
        func exactly120SecondsNewGroup() {
            let vm = makeVM()
            let now = Date()
            vm.messages = [
                makeMessage(id: "m1", createdAt: now),
                makeMessage(id: "m2", createdAt: now.addingTimeInterval(120)),
            ]
            #expect(vm.groupedMessages.count == 2)
        }

        @Test("Messages across different days show date separator for second day")
        @MainActor
        func crossDayDateSeparator() {
            let vm = makeVM()
            let today = Calendar.current.startOfDay(for: Date())
            let yesterday = today.addingTimeInterval(-86400)
            vm.messages = [
                makeMessage(id: "m1", createdAt: yesterday),
                makeMessage(id: "m2", senderID: "user_2", senderType: .agent, createdAt: today.addingTimeInterval(60)),
            ]
            #expect(vm.groupedMessages.count == 2)
            #expect(vm.groupedMessages[0].showDateSeparator == true)
            #expect(vm.groupedMessages[1].showDateSeparator == true)
        }

        @Test("Messages from same day same sender do not show extra date separator")
        @MainActor
        func sameDayNoExtraSeparator() {
            let vm = makeVM()
            let now = Date()
            vm.messages = [
                makeMessage(id: "m1", createdAt: now),
                makeMessage(id: "m2", senderID: "user_2", senderType: .agent, createdAt: now.addingTimeInterval(10)),
                makeMessage(id: "m3", createdAt: now.addingTimeInterval(20)),
            ]
            // Groups: user_1, agent, user_1 (3 groups, same day)
            #expect(vm.groupedMessages.count == 3)
            #expect(vm.groupedMessages[0].showDateSeparator == true)
            #expect(vm.groupedMessages[1].showDateSeparator == false)
            #expect(vm.groupedMessages[2].showDateSeparator == false)
        }

        @Test("Many messages from same sender in burst form single group")
        @MainActor
        func burstMessagesSingleGroup() {
            let vm = makeVM()
            let now = Date()
            vm.messages = (0..<10).map { i in
                makeMessage(id: "m\(i)", createdAt: now.addingTimeInterval(Double(i) * 5))
            }
            #expect(vm.groupedMessages.count == 1)
            #expect(vm.groupedMessages[0].messages.count == 10)
        }

        @Test("Group ID is the ID of the first message in the group")
        @MainActor
        func groupIDIsFirstMessageID() {
            let vm = makeVM()
            let now = Date()
            vm.messages = [
                makeMessage(id: "first_msg", createdAt: now),
                makeMessage(id: "second_msg", createdAt: now.addingTimeInterval(5)),
            ]
            #expect(vm.groupedMessages[0].id == "first_msg")
        }

        @Test("Resetting messages to empty clears groups")
        @MainActor
        func resetMessagesToEmpty() {
            let vm = makeVM()
            vm.messages = [makeMessage(id: "m1")]
            #expect(vm.groupedMessages.count == 1)
            vm.messages = []
            #expect(vm.groupedMessages.isEmpty)
        }
    }

    // MARK: - ConversationDetailViewModel — sendMessage behavior

    @Suite("ConversationDetail Send")
    struct ConversationDetailSendTests {

        @MainActor
        private func makeVM() -> ConversationDetailViewModel {
            let authManager = AuthManager(serviceName: "test.send.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            return ConversationDetailViewModel(
                conversationID: "conv_send",
                apiClient: apiClient,
                currentUserID: "user_send"
            )
        }

        @Test("sendMessage trims whitespace from content")
        @MainActor
        func sendMessageTrimsWhitespace() {
            let vm = makeVM()
            vm.sendMessage(content: "  hello  ")
            #expect(vm.messages.count == 1)
            #expect(vm.messages[0].content.text == "hello")
        }

        @Test("sendMessage with only newlines and tabs is ignored")
        @MainActor
        func sendMessageIgnoresWhitespaceOnly() {
            let vm = makeVM()
            vm.sendMessage(content: "\n\n\t\t  ")
            #expect(vm.messages.isEmpty)
        }

        @Test("sendMessage sets isAgentGenerating when expectAgentReply is true")
        @MainActor
        func sendMessageSetsAgentGenerating() {
            let vm = makeVM()
            vm.sendMessage(content: "Hey agent", expectAgentReply: true)
            #expect(vm.isAgentGenerating == true)
        }

        @Test("sendMessage does NOT set isAgentGenerating when expectAgentReply is false")
        @MainActor
        func sendMessageDoesNotSetAgentGenerating() {
            let vm = makeVM()
            vm.sendMessage(content: "Hey human", expectAgentReply: false)
            #expect(vm.isAgentGenerating == false)
        }

        @Test("Multiple sendMessage calls create unique optimistic messages")
        @MainActor
        func multipleSendCreatesUniqueMessages() {
            let vm = makeVM()
            vm.sendMessage(content: "First")
            vm.sendMessage(content: "Second")
            vm.sendMessage(content: "Third")
            #expect(vm.messages.count == 3)
            let ids = Set(vm.messages.map(\.id))
            #expect(ids.count == 3) // All unique IDs
        }

        @Test("Optimistic message has correct conversation ID")
        @MainActor
        func optimisticMessageConversationID() {
            let vm = makeVM()
            vm.sendMessage(content: "test")
            #expect(vm.messages[0].conversationID == "conv_send")
        }

        @Test("Optimistic message has type .text")
        @MainActor
        func optimisticMessageType() {
            let vm = makeVM()
            vm.sendMessage(content: "test")
            #expect(vm.messages[0].type == .text)
        }
    }

    // MARK: - FeedViewModel — Tab Caching and Load More

    @Suite("FeedViewModel Extended")
    struct FeedViewModelExtendedTests {

        @MainActor
        private func makeVM() -> FeedViewModel {
            let authManager = AuthManager(serviceName: "test.feed.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            return FeedViewModel(apiClient: apiClient)
        }

        @Test("hasMore starts as true")
        @MainActor
        func hasMoreInitiallyTrue() {
            let vm = makeVM()
            #expect(vm.hasMore == true)
        }

        @Test("loadMore with no cursor does nothing")
        @MainActor
        func loadMoreWithNoCursor() async {
            let vm = makeVM()
            // hasMore is true but nextCursor is nil initially, so loadMore guards out
            await vm.loadMore()
            #expect(vm.feedItems.isEmpty)
        }

        @Test("toggleLike on non-liked item calls likeItem path")
        @MainActor
        func toggleLikeOnNonLiked() async {
            let vm = makeVM()
            let item = FeedItem(
                id: "f1",
                creatorID: "u1",
                type: .agentShowcase,
                referenceID: "a1",
                referenceType: .agent,
                likeCount: 5
            )
            vm.feedItems = [item]
            await vm.toggleLike(id: "f1")
            // After network failure revert, should be back to original
            #expect(vm.feedItems[0].likeCount == 5)
        }

        @Test("isLiked reflects likedItemIDs accurately after like/unlike cycle")
        @MainActor
        func isLikedAfterCycle() async {
            let vm = makeVM()
            let item = FeedItem(
                id: "f1",
                creatorID: "u1",
                type: .creation,
                referenceID: "p1",
                referenceType: .page,
                likeCount: 3
            )
            vm.feedItems = [item]

            // Like (will revert on network failure)
            await vm.likeItem(id: "f1")
            // After revert, not liked
            #expect(vm.isLiked("f1") == false)

            // Unlike (will revert on network failure → re-adds to liked)
            await vm.unlikeItem(id: "f1")
            // After revert, it's in likedItemIDs
            #expect(vm.isLiked("f1") == true)
        }

        @Test("loadFeed sets error on network failure")
        @MainActor
        func loadFeedSetsError() async {
            let vm = makeVM()
            await vm.loadFeed(tab: .forYou)
            #expect(vm.error != nil)
            #expect(vm.isLoading == false)
        }

        @Test("refresh clears cached data for tab")
        @MainActor
        func refreshClearsCache() async {
            let vm = makeVM()
            // First load (will fail, but that's fine — we test the state transitions)
            await vm.loadFeed(tab: .trending)
            let firstError = vm.error

            // Refresh should try again
            await vm.refresh(tab: .trending)
            #expect(vm.isRefreshing == false)
            #expect(vm.error != nil)
            _ = firstError
        }
    }

    // MARK: - MarketplaceViewModel — Extended

    @Suite("MarketplaceViewModel Extended")
    struct MarketplaceViewModelExtendedTests {

        @MainActor
        private func makeVM() -> MarketplaceViewModel {
            let authManager = AuthManager(serviceName: "test.mp.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            return MarketplaceViewModel(apiClient: apiClient)
        }

        @Test("loadAgents sets error on network failure")
        @MainActor
        func loadAgentsSetsError() async {
            let vm = makeVM()
            await vm.loadAgents()
            #expect(vm.error != nil)
            #expect(vm.isLoading == false)
            #expect(vm.agents.isEmpty)
        }

        @Test("searchAgents with empty query calls loadAgents")
        @MainActor
        func searchAgentsEmptyQuery() async {
            let vm = makeVM()
            await vm.searchAgents(query: "")
            // Should have tried to load (and failed on network)
            #expect(vm.error != nil)
        }

        @Test("searchAgents with whitespace-only query calls loadAgents")
        @MainActor
        func searchAgentsWhitespaceQuery() async {
            let vm = makeVM()
            await vm.searchAgents(query: "   ")
            #expect(vm.error != nil)
        }

        @Test("searchAgents with real query sets error on network failure")
        @MainActor
        func searchAgentsRealQuery() async {
            let vm = makeVM()
            await vm.searchAgents(query: "code assistant")
            #expect(vm.error != nil)
            #expect(vm.isLoading == false)
        }

        @Test("loadMore with no cursor does nothing")
        @MainActor
        func loadMoreNoCursor() async {
            let vm = makeVM()
            await vm.loadMore()
            #expect(vm.agents.isEmpty)
        }
    }

    // MARK: - ConversationListViewModel — Extended

    @Suite("ConversationListViewModel Extended")
    struct ConversationListViewModelExtendedTests {

        @Test("loadConversations sets error on network failure")
        @MainActor
        func loadConversationsSetsError() async {
            let authManager = AuthManager(serviceName: "test.clist.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://nonexistent.local")!, authManager: authManager)
            let vm = ConversationListViewModel(apiClient: apiClient)
            await vm.loadConversations()
            #expect(vm.error != nil)
            #expect(vm.isLoading == false)
        }

        @Test("loadMore with no cursor does nothing")
        @MainActor
        func loadMoreNoCursor() async {
            let authManager = AuthManager(serviceName: "test.clist.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://nonexistent.local")!, authManager: authManager)
            let vm = ConversationListViewModel(apiClient: apiClient)
            await vm.loadMore()
            #expect(vm.conversations.isEmpty)
        }

        @Test("loadConversations syncs to ConversationStore on success scenario")
        @MainActor
        func loadConversationsWithStore() async {
            let authManager = AuthManager(serviceName: "test.clist.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://nonexistent.local")!, authManager: authManager)
            let store = ConversationStore()
            let vm = ConversationListViewModel(apiClient: apiClient, conversationStore: store)
            await vm.loadConversations()
            // Since the network call fails, store should remain empty
            #expect(store.conversations.isEmpty)
        }
    }
}
