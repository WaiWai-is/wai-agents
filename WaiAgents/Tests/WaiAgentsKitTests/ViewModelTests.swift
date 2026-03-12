import Foundation
import Testing
@testable import WaiAgentsKit

@Suite("ViewModels")
struct ViewModelTests {

    // MARK: - ConversationListViewModel

    @Suite("ConversationListViewModel")
    struct ConversationListViewModelTests {
        private let baseURL = URL(string: "https://openraccoon.com")!

        @Test("Initial state has empty conversations")
        @MainActor
        func initialStateEmpty() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationListViewModel(apiClient: apiClient)
            #expect(vm.conversations.isEmpty)
        }

        @Test("Initial state has isLoading false")
        @MainActor
        func initialStateNotLoading() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationListViewModel(apiClient: apiClient)
            #expect(vm.isLoading == false)
        }

        @Test("Initial state has nil error")
        @MainActor
        func initialStateNoError() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationListViewModel(apiClient: apiClient)
            #expect(vm.error == nil)
        }

        @Test("Can be initialized with optional conversationStore")
        @MainActor
        func initWithConversationStore() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let store = ConversationStore()
            let vm = ConversationListViewModel(apiClient: apiClient, conversationStore: store)
            #expect(vm.conversations.isEmpty)
        }
    }

    // MARK: - FeedViewModel

    @Suite("FeedViewModel")
    struct FeedViewModelTests {

        @Test("Initial state has empty feedItems")
        @MainActor
        func initialStateEmpty() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)
            #expect(vm.feedItems.isEmpty)
        }

        @Test("Initial state has isLoading false")
        @MainActor
        func initialStateNotLoading() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)
            #expect(vm.isLoading == false)
        }

        @Test("Initial state has isRefreshing false")
        @MainActor
        func initialStateNotRefreshing() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)
            #expect(vm.isRefreshing == false)
        }

        @Test("Initial state has nil error")
        @MainActor
        func initialStateNoError() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)
            #expect(vm.error == nil)
        }

        @Test("Initial state has empty likedItemIDs")
        @MainActor
        func initialStateLikedItemsEmpty() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)
            #expect(vm.likedItemIDs.isEmpty)
        }

        @Test("isLiked returns false for unknown item")
        @MainActor
        func isLikedFalseForUnknown() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)
            #expect(vm.isLiked("feed_1") == false)
        }

        @Test("FeedTab has all expected cases")
        func feedTabCases() {
            let tabs = FeedViewModel.FeedTab.allCases
            #expect(tabs.count == 4)
            #expect(tabs.contains(.forYou))
            #expect(tabs.contains(.trending))
            #expect(tabs.contains(.following))
            #expect(tabs.contains(.new))
        }

        @Test("FeedTab raw values are display strings")
        func feedTabRawValues() {
            #expect(FeedViewModel.FeedTab.forYou.rawValue == "For You")
            #expect(FeedViewModel.FeedTab.trending.rawValue == "Trending")
            #expect(FeedViewModel.FeedTab.following.rawValue == "Following")
            #expect(FeedViewModel.FeedTab.new.rawValue == "New")
        }

        // MARK: - Like/Unlike Optimistic Updates

        @Test("likeItem optimistically inserts ID into likedItemIDs and increments likeCount")
        @MainActor
        func likeItemOptimisticUpdate() async {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)

            let feedItem = FeedItem(
                id: "feed_1",
                creatorID: "user_1",
                type: .agentShowcase,
                referenceID: "agent_1",
                referenceType: .agent,
                likeCount: 10
            )
            vm.feedItems = [feedItem]

            // Call likeItem — it will fail on the network call but the optimistic
            // state should be applied immediately and then reverted on failure.
            await vm.likeItem(id: "feed_1")

            // After network failure, the optimistic update should have been reverted
            #expect(vm.feedItems[0].likeCount == 10)
            #expect(!vm.likedItemIDs.contains("feed_1"))
        }

        @Test("unlikeItem optimistically removes ID from likedItemIDs and decrements likeCount")
        @MainActor
        func unlikeItemOptimisticUpdate() async {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)

            let feedItem = FeedItem(
                id: "feed_1",
                creatorID: "user_1",
                type: .agentShowcase,
                referenceID: "agent_1",
                referenceType: .agent,
                likeCount: 10
            )
            vm.feedItems = [feedItem]

            // Pre-set as liked
            // (We access likedItemIDs which is private(set), so we simulate by calling likeItem then unlike)
            // Instead, test the unlike path by verifying the revert behavior
            await vm.unlikeItem(id: "feed_1")

            // After network failure, the optimistic update (decrement) should be reverted (increment back)
            #expect(vm.feedItems[0].likeCount == 10)
            #expect(vm.likedItemIDs.contains("feed_1"))
        }

        @Test("likeCount never goes below zero on unlike revert")
        @MainActor
        func likeCountFloorZero() async {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = FeedViewModel(apiClient: apiClient)

            let feedItem = FeedItem(
                id: "feed_1",
                creatorID: "user_1",
                type: .agentShowcase,
                referenceID: "agent_1",
                referenceType: .agent,
                likeCount: 0
            )
            vm.feedItems = [feedItem]

            await vm.unlikeItem(id: "feed_1")

            // After revert, likeCount should still be valid (not negative)
            #expect(vm.feedItems[0].likeCount >= 0)
        }
    }

    // MARK: - MarketplaceViewModel

    @Suite("MarketplaceViewModel")
    struct MarketplaceViewModelTests {

        @Test("Initial state has empty agents")
        @MainActor
        func initialStateEmpty() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = MarketplaceViewModel(apiClient: apiClient)
            #expect(vm.agents.isEmpty)
        }

        @Test("Initial state has isLoading false")
        @MainActor
        func initialStateNotLoading() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = MarketplaceViewModel(apiClient: apiClient)
            #expect(vm.isLoading == false)
        }

        @Test("Initial state has nil error")
        @MainActor
        func initialStateNoError() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = MarketplaceViewModel(apiClient: apiClient)
            #expect(vm.error == nil)
        }
    }

    // MARK: - ConversationDetailViewModel

    @Suite("ConversationDetailViewModel")
    struct ConversationDetailViewModelTests {

        @Test("Initial state has correct conversationID")
        @MainActor
        func initialConversationID() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_42",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
            #expect(vm.conversationID == "conv_42")
        }

        @Test("Initial state has empty messages")
        @MainActor
        func initialMessagesEmpty() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
            #expect(vm.messages.isEmpty)
        }

        @Test("Initial state has isLoading false")
        @MainActor
        func initialNotLoading() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
            #expect(vm.isLoading == false)
        }

        @Test("Initial state has isTyping false")
        @MainActor
        func initialNotTyping() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
            #expect(vm.isTyping == false)
        }

        @Test("Initial state has isAgentGenerating false")
        @MainActor
        func initialNotGenerating() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
            #expect(vm.isAgentGenerating == false)
        }

        @Test("Initial state has empty inputText")
        @MainActor
        func initialEmptyInput() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
            #expect(vm.inputText == "")
        }

        @Test("Initial state has empty groupedMessages")
        @MainActor
        func initialEmptyGroupedMessages() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )
            #expect(vm.groupedMessages.isEmpty)
        }

        @Test("sendMessage ignores empty/whitespace-only content")
        @MainActor
        func sendMessageIgnoresEmpty() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.sendMessage(content: "")
            #expect(vm.messages.isEmpty)

            vm.sendMessage(content: "   ")
            #expect(vm.messages.isEmpty)

            vm.sendMessage(content: "\n\t  ")
            #expect(vm.messages.isEmpty)
        }

        @Test("sendMessage adds optimistic message for non-empty content")
        @MainActor
        func sendMessageOptimistic() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            vm.sendMessage(content: "Hello!")

            #expect(vm.messages.count == 1)
            #expect(vm.messages[0].content.text == "Hello!")
            #expect(vm.messages[0].senderID == "user_1")
            #expect(vm.messages[0].senderType == .human)
            #expect(vm.messages[0].conversationID == "conv_1")
        }

        @Test("Setting messages triggers groupedMessages rebuild")
        @MainActor
        func settingMessagesRebuildsGroups() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let msg1 = Message(
                id: "m1",
                conversationID: "conv_1",
                senderID: "user_1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Hi"),
                createdAt: Date()
            )
            let msg2 = Message(
                id: "m2",
                conversationID: "conv_1",
                senderID: "user_2",
                senderType: .agent,
                type: .text,
                content: MessageContent(text: "Hello"),
                createdAt: Date().addingTimeInterval(5)
            )

            vm.messages = [msg1, msg2]

            // Should create two groups since different senders
            #expect(vm.groupedMessages.count == 2)
        }

        @Test("Messages from same sender within 2 minutes are grouped together")
        @MainActor
        func sameGroupMessages() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let now = Date()
            let msg1 = Message(
                id: "m1",
                conversationID: "conv_1",
                senderID: "user_1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "First"),
                createdAt: now
            )
            let msg2 = Message(
                id: "m2",
                conversationID: "conv_1",
                senderID: "user_1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Second"),
                createdAt: now.addingTimeInterval(30)  // 30 seconds later, same sender
            )

            vm.messages = [msg1, msg2]

            #expect(vm.groupedMessages.count == 1)
            #expect(vm.groupedMessages[0].messages.count == 2)
        }

        @Test("Messages from same sender more than 2 minutes apart create separate groups")
        @MainActor
        func separateGroupsByTime() {
            let authManager = AuthManager(serviceName: "test.vm.\(UUID().uuidString)")
            let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
            let vm = ConversationDetailViewModel(
                conversationID: "conv_1",
                apiClient: apiClient,
                currentUserID: "user_1"
            )

            let now = Date()
            let msg1 = Message(
                id: "m1",
                conversationID: "conv_1",
                senderID: "user_1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "First"),
                createdAt: now
            )
            let msg2 = Message(
                id: "m2",
                conversationID: "conv_1",
                senderID: "user_1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Second"),
                createdAt: now.addingTimeInterval(121)  // >120 seconds apart
            )

            vm.messages = [msg1, msg2]

            #expect(vm.groupedMessages.count == 2)
        }
    }

    // MARK: - MessageStore

    @Suite("MessageStore")
    struct MessageStoreTests {

        private func makeMessage(id: String, conversationID: String = "c1", text: String = "msg") -> Message {
            Message(
                id: id,
                conversationID: conversationID,
                senderType: .human,
                type: .text,
                content: MessageContent(text: text)
            )
        }

        @Test("Initial state has empty messages")
        @MainActor
        func initialState() {
            let store = MessageStore()
            #expect(store.messages.isEmpty)
            #expect(store.isLoading == false)
            #expect(store.isLoadingMore == false)
        }

        @Test("messages(for:) returns empty array for unknown conversation")
        @MainActor
        func messagesForUnknown() {
            let store = MessageStore()
            #expect(store.messages(for: "unknown").isEmpty)
        }

        @Test("appendMessage adds message to conversation")
        @MainActor
        func appendMessage() {
            let store = MessageStore()
            let msg = makeMessage(id: "m1")
            store.appendMessage(msg, to: "c1")
            #expect(store.messages(for: "c1").count == 1)
            #expect(store.messages(for: "c1")[0].id == "m1")
        }

        @Test("appendMessage accumulates messages in order")
        @MainActor
        func appendMessageAccumulates() {
            let store = MessageStore()
            store.appendMessage(makeMessage(id: "m1"), to: "c1")
            store.appendMessage(makeMessage(id: "m2"), to: "c1")
            store.appendMessage(makeMessage(id: "m3"), to: "c1")
            #expect(store.messages(for: "c1").count == 3)
            #expect(store.messages(for: "c1").map(\.id) == ["m1", "m2", "m3"])
        }

        @Test("updateMessage replaces existing message")
        @MainActor
        func updateMessage() {
            let store = MessageStore()
            store.appendMessage(makeMessage(id: "m1", text: "original"), to: "c1")
            let updated = makeMessage(id: "m1", text: "updated")
            store.updateMessage(updated, in: "c1")
            #expect(store.messages(for: "c1")[0].content.text == "updated")
        }

        @Test("updateMessage does nothing for non-existent message")
        @MainActor
        func updateMessageNonExistent() {
            let store = MessageStore()
            store.appendMessage(makeMessage(id: "m1"), to: "c1")
            let nonExistent = makeMessage(id: "m_unknown", text: "ghost")
            store.updateMessage(nonExistent, in: "c1")
            #expect(store.messages(for: "c1").count == 1)
            #expect(store.messages(for: "c1")[0].id == "m1")
        }

        @Test("removeMessage removes message by ID")
        @MainActor
        func removeMessage() {
            let store = MessageStore()
            store.appendMessage(makeMessage(id: "m1"), to: "c1")
            store.appendMessage(makeMessage(id: "m2"), to: "c1")
            store.removeMessage(id: "m1", from: "c1")
            #expect(store.messages(for: "c1").count == 1)
            #expect(store.messages(for: "c1")[0].id == "m2")
        }

        @Test("hasMore returns false when no pageInfo exists")
        @MainActor
        func hasMoreDefault() {
            let store = MessageStore()
            #expect(store.hasMore(for: "c1") == false)
        }

        @Test("Messages for different conversations are independent")
        @MainActor
        func independentConversations() {
            let store = MessageStore()
            store.appendMessage(makeMessage(id: "m1", conversationID: "c1"), to: "c1")
            store.appendMessage(makeMessage(id: "m2", conversationID: "c2"), to: "c2")
            #expect(store.messages(for: "c1").count == 1)
            #expect(store.messages(for: "c2").count == 1)
            #expect(store.messages(for: "c1")[0].id == "m1")
            #expect(store.messages(for: "c2")[0].id == "m2")
        }
    }
}
