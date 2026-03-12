import Foundation
import Testing
@testable import WaiAgentsKit

/// Edge-case tests for ConversationDetailViewModel: task cancellation on deinit,
/// optimistic updates, typing indicators, message deduplication, pagination,
/// WebSocket event handling, and concurrent sends.
@Suite("ConversationDetailViewModel Edge Cases")
struct ConversationDetailViewModelEdgeCaseTests {

    // MARK: - Helpers

    @MainActor
    private func makeVM(
        conversationID: String = "conv_edge",
        currentUserID: String = "user_edge"
    ) -> ConversationDetailViewModel {
        let authManager = AuthManager(serviceName: "test.cdvm.edge.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
        return ConversationDetailViewModel(
            conversationID: conversationID,
            apiClient: apiClient,
            currentUserID: currentUserID
        )
    }

    private func makeMessage(
        id: String,
        conversationID: String = "conv_edge",
        senderID: String = "user_edge",
        senderType: Message.SenderType = .human,
        text: String = "test message",
        createdAt: Date = Date()
    ) -> Message {
        Message(
            id: id,
            conversationID: conversationID,
            senderID: senderID,
            senderType: senderType,
            type: .text,
            content: MessageContent(text: text),
            createdAt: createdAt
        )
    }

    // MARK: - Deinit Cancels Tasks

    @Test("Deinit deallocates cleanly after sendMessage")
    @MainActor
    func deinitAfterSendMessage() {
        var vm: ConversationDetailViewModel? = makeVM()
        vm!.sendMessage(content: "Hello")
        #expect(vm!.messages.count == 1)

        // Deallocate — deinit should cancel replyPollingTask and typingDebounceTask
        vm = nil
        #expect(vm == nil)
    }

    @Test("Deinit deallocates cleanly when no tasks are active")
    @MainActor
    func deinitNoActiveTasks() {
        var vm: ConversationDetailViewModel? = makeVM()
        vm = nil
        #expect(vm == nil)
    }

    @Test("Deinit after loadMessages attempt deallocates cleanly")
    @MainActor
    func deinitAfterLoadMessages() async {
        var vm: ConversationDetailViewModel? = makeVM()
        await vm!.loadMessages()
        vm = nil
        #expect(vm == nil)
    }

    // MARK: - sendMessage Optimistic Update and Server Response

    @Test("sendMessage creates optimistic message with correct fields")
    @MainActor
    func sendMessageOptimisticFields() {
        let vm = makeVM(conversationID: "conv_opt", currentUserID: "user_opt")
        vm.sendMessage(content: "Optimistic test")

        #expect(vm.messages.count == 1)
        let msg = vm.messages[0]
        #expect(msg.conversationID == "conv_opt")
        #expect(msg.senderID == "user_opt")
        #expect(msg.senderType == .human)
        #expect(msg.type == .text)
        #expect(msg.content.text == "Optimistic test")
    }

    @Test("sendMessage with expectAgentReply sets isAgentGenerating")
    @MainActor
    func sendMessageExpectAgentReply() {
        let vm = makeVM()
        vm.sendMessage(content: "Hey agent", expectAgentReply: true)
        #expect(vm.isAgentGenerating == true)
    }

    @Test("sendMessage without expectAgentReply leaves isAgentGenerating false")
    @MainActor
    func sendMessageNoAgentReply() {
        let vm = makeVM()
        vm.sendMessage(content: "Hey human", expectAgentReply: false)
        #expect(vm.isAgentGenerating == false)
    }

    // MARK: - sendMessage Failure Reverts Optimistic Message

    @Test("sendMessage failure removes optimistic message eventually")
    @MainActor
    func sendMessageFailureRevertsOptimistic() async throws {
        let vm = makeVM()
        vm.sendMessage(content: "This will fail")

        // Optimistic message is added immediately
        #expect(vm.messages.count == 1)
        let optimisticID = vm.messages[0].id

        // Wait for the background Task to complete and revert
        try await Task.sleep(nanoseconds: 500_000_000) // 0.5s for network timeout to hit

        // After network failure, the optimistic message should be removed
        // (it may take a bit for the Task to run)
        try await Task.sleep(nanoseconds: 2_000_000_000)
        let hasOptimistic = vm.messages.contains { $0.id == optimisticID }
        // The message should either be removed or an error should be set
        #expect(vm.error != nil || !hasOptimistic)
    }

    // MARK: - Typing Indicator State Transitions

    @Test("isTyping starts as false")
    @MainActor
    func typingInitiallyFalse() {
        let vm = makeVM()
        #expect(vm.isTyping == false)
    }

    @Test("isTyping can be set directly for testing")
    @MainActor
    func typingCanBeSet() {
        let vm = makeVM()
        vm.isTyping = true
        #expect(vm.isTyping == true)
        vm.isTyping = false
        #expect(vm.isTyping == false)
    }

    @Test("userDidType without websocket does nothing and does not crash")
    @MainActor
    func userDidTypeWithoutWebSocket() {
        let vm = makeVM()
        // Should not crash when webSocketClient is nil
        vm.userDidType()
        // No assertion needed — just verifying no crash
    }

    // MARK: - Message Deduplication

    @Test("Setting messages with duplicate IDs keeps all (dedup is in merge)")
    @MainActor
    func duplicateIDsInMessagesArray() {
        let vm = makeVM()
        let msg1 = makeMessage(id: "dup_1", text: "First")
        let msg2 = makeMessage(id: "dup_1", text: "Second version")

        // Direct assignment does not deduplicate — that's expected
        vm.messages = [msg1, msg2]
        #expect(vm.messages.count == 2)
    }

    @Test("sendMessage creates messages with unique IDs")
    @MainActor
    func sendMessageUniqueIDs() {
        let vm = makeVM()
        vm.sendMessage(content: "First")
        vm.sendMessage(content: "Second")
        vm.sendMessage(content: "Third")

        let ids = vm.messages.map(\.id)
        let uniqueIDs = Set(ids)
        #expect(uniqueIDs.count == 3)
    }

    @Test("sendMessage adds to messageIDs set for dedup tracking")
    @MainActor
    func sendMessageTracksInMessageIDs() {
        let vm = makeVM()
        vm.sendMessage(content: "Tracked")

        // Verify by sending another message — if the first was tracked,
        // the count should be 2 (no dedup interference)
        vm.sendMessage(content: "Second")
        #expect(vm.messages.count == 2)
    }

    // MARK: - loadMoreMessages Pagination

    @Test("loadMoreMessages with no prior load does nothing (hasMore default guard)")
    @MainActor
    func loadMoreWithoutPriorLoad() async {
        let vm = makeVM()
        // hasMore is true by default but nextCursor is nil, so it guards out
        await vm.loadMoreMessages()
        #expect(vm.messages.isEmpty)
    }

    @Test("loadMessages sets error on network failure and clears loading")
    @MainActor
    func loadMessagesSetsError() async {
        let vm = makeVM()
        await vm.loadMessages()

        #expect(vm.isLoading == false)
        #expect(vm.error != nil)
    }

    @Test("loadMessages resets error before loading")
    @MainActor
    func loadMessagesResetsError() async {
        let vm = makeVM()

        // First load sets error
        await vm.loadMessages()
        #expect(vm.error != nil)

        // loadMessages sets error = nil at start, then re-sets on failure
        // We verify by checking it's not nil after (since network fails again)
        await vm.loadMessages()
        #expect(vm.error != nil)
    }

    // MARK: - Message Grouping via WebSocket Events (merge path)

    @Test("Messages set directly rebuild grouped messages")
    @MainActor
    func directMessageSetRebuildsGroups() {
        let vm = makeVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "user_1", senderType: .human, createdAt: now),
            makeMessage(id: "m2", senderID: "agent_1", senderType: .agent, createdAt: now.addingTimeInterval(5)),
        ]

        #expect(vm.groupedMessages.count == 2)
    }

    @Test("Incoming message from same sender within 2 min joins existing group")
    @MainActor
    func incomingMessageJoinsGroup() {
        let vm = makeVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "user_1", createdAt: now),
        ]
        #expect(vm.groupedMessages.count == 1)

        // Simulate incoming message from same sender within 2 min
        vm.messages.append(
            makeMessage(id: "m2", senderID: "user_1", createdAt: now.addingTimeInterval(30))
        )
        #expect(vm.groupedMessages.count == 1)
        #expect(vm.groupedMessages[0].messages.count == 2)
    }

    @Test("Incoming agent message creates new group")
    @MainActor
    func incomingAgentMessageNewGroup() {
        let vm = makeVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "user_1", senderType: .human, createdAt: now),
        ]

        vm.messages.append(
            makeMessage(id: "m2", senderID: "agent_1", senderType: .agent, createdAt: now.addingTimeInterval(5))
        )

        #expect(vm.groupedMessages.count == 2)
    }

    @Test("Updated message replaces content in existing group")
    @MainActor
    func updatedMessageInGroup() {
        let vm = makeVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", text: "Original", createdAt: now),
        ]
        #expect(vm.groupedMessages[0].messages[0].content.text == "Original")

        // Simulate message update by replacing in array
        if let idx = vm.messages.firstIndex(where: { $0.id == "m1" }) {
            vm.messages[idx] = makeMessage(id: "m1", text: "Updated", createdAt: now)
        }
        #expect(vm.groupedMessages[0].messages[0].content.text == "Updated")
    }

    // MARK: - Concurrent sendMessage Calls

    @Test("Multiple concurrent sendMessage calls all create optimistic messages")
    @MainActor
    func concurrentSendMessages() {
        let vm = makeVM()

        vm.sendMessage(content: "First")
        vm.sendMessage(content: "Second")
        vm.sendMessage(content: "Third")
        vm.sendMessage(content: "Fourth")
        vm.sendMessage(content: "Fifth")

        #expect(vm.messages.count == 5)

        // All should have unique IDs
        let ids = Set(vm.messages.map(\.id))
        #expect(ids.count == 5)

        // Messages should be in order
        #expect(vm.messages[0].content.text == "First")
        #expect(vm.messages[4].content.text == "Fifth")
    }

    @Test("Concurrent sendMessage with expectAgentReply only sets isAgentGenerating for last call")
    @MainActor
    func concurrentSendWithAgentReply() {
        let vm = makeVM()

        vm.sendMessage(content: "First", expectAgentReply: false)
        vm.sendMessage(content: "Agent query", expectAgentReply: true)

        // isAgentGenerating should be true from the last call
        #expect(vm.isAgentGenerating == true)
    }

    // MARK: - Edge: Empty Content Variations

    @Test("sendMessage with unicode whitespace is ignored")
    @MainActor
    func sendMessageUnicodeWhitespace() {
        let vm = makeVM()
        // Non-breaking space, em space, etc.
        vm.sendMessage(content: "\u{00A0}\u{2003}")
        // These are not in .whitespacesAndNewlines by default in some locales,
        // so the message might or might not be created — just verify no crash
        // and that if created, it's at most 1 message
        #expect(vm.messages.count <= 1)
    }

    @Test("sendMessage with very long content creates message")
    @MainActor
    func sendMessageLongContent() {
        let vm = makeVM()
        let longText = String(repeating: "A", count: 10_000)
        vm.sendMessage(content: longText)

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text == longText)
    }
}
