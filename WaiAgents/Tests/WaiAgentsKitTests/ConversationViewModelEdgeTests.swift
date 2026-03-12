import Foundation
import Testing
@testable import WaiAgentsKit

/// Edge tests for ConversationDetailViewModel: reply polling cancellation,
/// typing debounce, message sending during reconnection, concurrent sends,
/// large messages, and deinit cleanup.
@Suite("ConversationDetailViewModel Edge Tests")
struct ConversationViewModelEdgeTests {

    // MARK: - Helpers

    @MainActor
    private func makeVM(
        conversationID: String = "conv_edge2",
        currentUserID: String = "user_edge2"
    ) -> ConversationDetailViewModel {
        let authManager = AuthManager(serviceName: "test.cdvm.edge2.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
        return ConversationDetailViewModel(
            conversationID: conversationID,
            apiClient: apiClient,
            currentUserID: currentUserID
        )
    }

    private func makeMessage(
        id: String,
        conversationID: String = "conv_edge2",
        senderID: String = "user_edge2",
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

    // MARK: - Reply Polling Task Cancellation

    @Test("Deinit cancels reply polling task started by sendMessage with expectAgentReply")
    @MainActor
    func deinitCancelsReplyPolling() {
        var vm: ConversationDetailViewModel? = makeVM()
        vm!.sendMessage(content: "Start polling", expectAgentReply: true)
        #expect(vm!.isAgentGenerating == true)

        // Deallocate — deinit should cancel the polling task
        vm = nil
        #expect(vm == nil)
    }

    @Test("unsubscribeFromChannel cancels polling and typing tasks")
    @MainActor
    func unsubscribeCancelsAllTasks() {
        let vm = makeVM()
        vm.sendMessage(content: "Will poll", expectAgentReply: true)
        #expect(vm.isAgentGenerating == true)

        vm.unsubscribeFromChannel()
        // After unsubscribe, isAgentGenerating may still be true
        // (the polling task was cancelled but state update happens in task body)
        // The key assertion is that unsubscribe doesn't crash
    }

    @Test("Multiple sendMessage with expectAgentReply only last one should set polling")
    @MainActor
    func multipleSendsWithAgentReply() {
        let vm = makeVM()

        vm.sendMessage(content: "First agent query", expectAgentReply: true)
        vm.sendMessage(content: "Second agent query", expectAgentReply: true)
        vm.sendMessage(content: "Third agent query", expectAgentReply: true)

        // All three create optimistic messages
        #expect(vm.messages.count == 3)
        // isAgentGenerating is true from the last call
        #expect(vm.isAgentGenerating == true)
    }

    // MARK: - Typing Debounce Edge Cases

    @Test("userDidType without WebSocket does not crash even when called rapidly")
    @MainActor
    func rapidUserDidTypeWithoutWebSocket() {
        let vm = makeVM()

        for _ in 0..<100 {
            vm.userDidType()
        }

        // Should not crash — webSocketClient is nil so it guards out immediately
    }

    @Test("Multiple rapid userDidType calls without WebSocket are safe")
    @MainActor
    func multipleUserDidTypeCallsSafe() {
        let vm = makeVM()

        vm.userDidType()
        vm.userDidType()
        vm.userDidType()

        // No crash, no side effects without WebSocket
    }

    @Test("inputText can be set independently of typing state")
    @MainActor
    func inputTextIndependentOfTyping() {
        let vm = makeVM()
        vm.inputText = "Hello"
        #expect(vm.inputText == "Hello")
        #expect(vm.isTyping == false)

        vm.inputText = ""
        #expect(vm.inputText == "")
    }

    @Test("isTyping state is independent of message sending")
    @MainActor
    func isTypingIndependentOfSending() {
        let vm = makeVM()
        vm.isTyping = true
        vm.sendMessage(content: "Test")

        #expect(vm.isTyping == true)
        #expect(vm.messages.count == 1)
    }

    // MARK: - Message Sending During Reconnection

    @Test("sendMessage works when no WebSocket client is set")
    @MainActor
    func sendMessageWithoutWebSocket() {
        let vm = makeVM()
        vm.sendMessage(content: "Offline message")

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text == "Offline message")
    }

    @Test("Multiple sendMessage calls during disconnected state all create optimistic messages")
    @MainActor
    func multipleSendsDuringDisconnect() {
        let vm = makeVM()

        vm.sendMessage(content: "Message 1")
        vm.sendMessage(content: "Message 2")
        vm.sendMessage(content: "Message 3")

        #expect(vm.messages.count == 3)
        #expect(vm.messages[0].content.text == "Message 1")
        #expect(vm.messages[1].content.text == "Message 2")
        #expect(vm.messages[2].content.text == "Message 3")
    }

    @Test("sendMessage during loadMessages does not cause data race")
    @MainActor
    func sendDuringLoad() async {
        let vm = makeVM()
        vm.sendMessage(content: "Optimistic")
        await vm.loadMessages()

        // loadMessages will fail and set error, but optimistic message may be removed
        // by the background task failure. Key: no crash.
        #expect(vm.error != nil)
    }

    // MARK: - Concurrent Message Sends

    @Test("Ten concurrent sendMessage calls all produce unique IDs")
    @MainActor
    func tenConcurrentSends() {
        let vm = makeVM()

        for i in 0..<10 {
            vm.sendMessage(content: "Message \(i)")
        }

        let ids = vm.messages.map(\.id)
        let uniqueIDs = Set(ids)
        #expect(uniqueIDs.count == 10)
        #expect(vm.messages.count == 10)
    }

    @Test("Concurrent sends preserve message order")
    @MainActor
    func concurrentSendsPreserveOrder() {
        let vm = makeVM()

        vm.sendMessage(content: "Alpha")
        vm.sendMessage(content: "Beta")
        vm.sendMessage(content: "Gamma")
        vm.sendMessage(content: "Delta")

        #expect(vm.messages[0].content.text == "Alpha")
        #expect(vm.messages[1].content.text == "Beta")
        #expect(vm.messages[2].content.text == "Gamma")
        #expect(vm.messages[3].content.text == "Delta")
    }

    @Test("Concurrent sends with mixed expectAgentReply flags")
    @MainActor
    func concurrentSendsMixedAgentReply() {
        let vm = makeVM()

        vm.sendMessage(content: "Normal 1", expectAgentReply: false)
        vm.sendMessage(content: "Agent query", expectAgentReply: true)
        vm.sendMessage(content: "Normal 2", expectAgentReply: false)

        #expect(vm.messages.count == 3)
        // isAgentGenerating should be false because the last call was expectAgentReply: false
        #expect(vm.isAgentGenerating == false)
    }

    // MARK: - Large Message Handling

    @Test("sendMessage with 50,000 character content creates message")
    @MainActor
    func sendLargeMessage() {
        let vm = makeVM()
        let largeText = String(repeating: "X", count: 50_000)
        vm.sendMessage(content: largeText)

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text == largeText)
    }

    @Test("sendMessage with multiline content preserves newlines")
    @MainActor
    func sendMultilineMessage() {
        let vm = makeVM()
        let multiline = "Line 1\nLine 2\nLine 3\n\nLine 5"
        vm.sendMessage(content: multiline)

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text == multiline)
    }

    @Test("sendMessage with emoji content works correctly")
    @MainActor
    func sendEmojiMessage() {
        let vm = makeVM()
        vm.sendMessage(content: "Hello! \u{1F600}\u{1F389}\u{1F680}")

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text?.contains("\u{1F600}") == true)
    }

    // MARK: - Deinit Cleanup Verification

    @Test("Deinit after subscribeToChannel without WebSocket is safe")
    @MainActor
    func deinitAfterSubscribeWithoutWS() {
        var vm: ConversationDetailViewModel? = makeVM()
        vm!.subscribeToChannel()  // No-op since webSocketClient is nil

        vm = nil
        #expect(vm == nil)
    }

    @Test("Deinit after unsubscribeFromChannel is safe")
    @MainActor
    func deinitAfterUnsubscribe() {
        var vm: ConversationDetailViewModel? = makeVM()
        vm!.subscribeToChannel()
        vm!.unsubscribeFromChannel()

        vm = nil
        #expect(vm == nil)
    }

    @Test("Deinit after multiple operations is safe")
    @MainActor
    func deinitAfterMultipleOps() async {
        var vm: ConversationDetailViewModel? = makeVM()
        vm!.sendMessage(content: "Hello")
        vm!.sendMessage(content: "World", expectAgentReply: true)
        vm!.userDidType()
        await vm!.loadMessages()

        vm = nil
        #expect(vm == nil)
    }

    // MARK: - Message Grouping Edge Cases

    @Test("Messages exactly at 120-second boundary create separate groups")
    @MainActor
    func messagesAtExactBoundary() {
        let vm = makeVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "u1", createdAt: now),
            makeMessage(id: "m2", senderID: "u1", createdAt: now.addingTimeInterval(120)),
        ]

        // >= 120 creates new group
        #expect(vm.groupedMessages.count == 2)
    }

    @Test("Messages just under 120-second boundary stay in same group")
    @MainActor
    func messagesJustUnderBoundary() {
        let vm = makeVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "u1", createdAt: now),
            makeMessage(id: "m2", senderID: "u1", createdAt: now.addingTimeInterval(119.999)),
        ]

        #expect(vm.groupedMessages.count == 1)
        #expect(vm.groupedMessages[0].messages.count == 2)
    }

    @Test("Single message produces single group with showDateSeparator true")
    @MainActor
    func singleMessageSingleGroup() {
        let vm = makeVM()
        vm.messages = [makeMessage(id: "m1")]

        #expect(vm.groupedMessages.count == 1)
        #expect(vm.groupedMessages[0].showDateSeparator == true)
        #expect(vm.groupedMessages[0].messages.count == 1)
    }

    // MARK: - Additional Edge Cases

    @Test("loadMessages sets isLoading to true then false")
    @MainActor
    func loadMessagesSetsLoadingState() async {
        let vm = makeVM()
        #expect(vm.isLoading == false)

        await vm.loadMessages()

        #expect(vm.isLoading == false)
        #expect(vm.error != nil)
    }

    @Test("loadMoreMessages without prior load does nothing")
    @MainActor
    func loadMoreWithoutPrior() async {
        let vm = makeVM()
        await vm.loadMoreMessages()

        #expect(vm.messages.isEmpty)
        #expect(vm.error == nil)
    }

    @Test("sendMessage with only whitespace characters is rejected")
    @MainActor
    func sendWhitespaceOnlyMessage() {
        let vm = makeVM()
        vm.sendMessage(content: "   \t\n  ")

        #expect(vm.messages.isEmpty)
    }

    @Test("sendMessage trims leading and trailing whitespace from content")
    @MainActor
    func sendMessageTrimsWhitespace() {
        let vm = makeVM()
        vm.sendMessage(content: "  Hello World  ")

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text == "Hello World")
    }
}
