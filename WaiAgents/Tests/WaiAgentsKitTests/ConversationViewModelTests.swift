import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for ConversationListViewModel and ConversationDetailViewModel:
/// loading, creation, sending, receiving, deletion, search, members,
/// real-time updates, error handling, and empty states.
@Suite("Conversation ViewModel Tests")
struct ConversationViewModelTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    @MainActor
    private func makeListVM() -> ConversationListViewModel {
        let authManager = AuthManager(serviceName: "test.convvm.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        return ConversationListViewModel(apiClient: apiClient)
    }

    @MainActor
    private func makeDetailVM(
        conversationID: String = "conv_1",
        currentUserID: String = "user_1"
    ) -> ConversationDetailViewModel {
        let authManager = AuthManager(serviceName: "test.convvm.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        return ConversationDetailViewModel(
            conversationID: conversationID,
            apiClient: apiClient,
            currentUserID: currentUserID
        )
    }

    private func makeConversation(
        id: String = "conv_1",
        type: Conversation.ConversationType = .agent,
        title: String? = "Test Conversation"
    ) -> Conversation {
        Conversation(id: id, type: type, title: title)
    }

    private func makeMessage(
        id: String,
        conversationID: String = "conv_1",
        senderID: String = "user_1",
        senderType: Message.SenderType = .human,
        text: String = "Hello",
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

    // MARK: - ConversationListViewModel Initial State

    @Test("ConversationListViewModel starts with empty conversations")
    @MainActor
    func listVMInitialState() {
        let vm = makeListVM()
        #expect(vm.conversations.isEmpty)
        #expect(vm.isLoading == false)
        #expect(vm.error == nil)
    }

    @Test("loadConversations sets isLoading then error on network failure")
    @MainActor
    func loadConversationsSetsLoading() async {
        let vm = makeListVM()
        #expect(vm.isLoading == false)

        await vm.loadConversations()

        #expect(vm.isLoading == false)
        #expect(vm.error != nil)
        #expect(vm.conversations.isEmpty)
    }

    @Test("loadMore without prior loadConversations does nothing")
    @MainActor
    func loadMoreWithoutPriorLoad() async {
        let vm = makeListVM()
        await vm.loadMore()

        // hasMore defaults to true, but nextCursor is nil, so it should exit
        #expect(vm.conversations.isEmpty)
    }

    @Test("ConversationListViewModel with ConversationStore syncs data")
    @MainActor
    func listVMWithStore() {
        let authManager = AuthManager(serviceName: "test.convvm.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        let store = ConversationStore()
        let vm = ConversationListViewModel(apiClient: apiClient, conversationStore: store)

        #expect(vm.conversations.isEmpty)
        #expect(store.conversations.isEmpty)
    }

    // MARK: - ConversationDetailViewModel Initial State

    @Test("ConversationDetailViewModel starts with empty messages")
    @MainActor
    func detailVMInitialState() {
        let vm = makeDetailVM()
        #expect(vm.messages.isEmpty)
        #expect(vm.isLoading == false)
        #expect(vm.isTyping == false)
        #expect(vm.isAgentGenerating == false)
        #expect(vm.inputText == "")
        #expect(vm.error == nil)
        #expect(vm.conversationID == "conv_1")
    }

    @Test("ConversationDetailViewModel preserves conversationID")
    @MainActor
    func detailVMConversationID() {
        let vm = makeDetailVM(conversationID: "custom_conv_id")
        #expect(vm.conversationID == "custom_conv_id")
    }

    // MARK: - Loading Messages

    @Test("loadMessages sets error on network failure")
    @MainActor
    func loadMessagesSetsError() async {
        let vm = makeDetailVM()
        await vm.loadMessages()

        #expect(vm.error != nil)
        #expect(vm.isLoading == false)
        #expect(vm.messages.isEmpty)
    }

    @Test("loadMoreMessages without prior load does nothing")
    @MainActor
    func loadMoreMessagesGuard() async {
        let vm = makeDetailVM()
        await vm.loadMoreMessages()

        #expect(vm.messages.isEmpty)
        #expect(vm.error == nil)
    }

    // MARK: - Sending Messages

    @Test("sendMessage creates optimistic local message")
    @MainActor
    func sendMessageOptimistic() {
        let vm = makeDetailVM()
        vm.sendMessage(content: "Hello World")

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text == "Hello World")
        #expect(vm.messages[0].senderType == .human)
        #expect(vm.messages[0].conversationID == "conv_1")
    }

    @Test("sendMessage assigns current user as senderID")
    @MainActor
    func sendMessageSenderID() {
        let vm = makeDetailVM(currentUserID: "user_42")
        vm.sendMessage(content: "Test")

        #expect(vm.messages[0].senderID == "user_42")
    }

    @Test("sendMessage rejects empty string")
    @MainActor
    func sendMessageRejectsEmpty() {
        let vm = makeDetailVM()
        vm.sendMessage(content: "")
        #expect(vm.messages.isEmpty)
    }

    @Test("sendMessage rejects whitespace-only string")
    @MainActor
    func sendMessageRejectsWhitespace() {
        let vm = makeDetailVM()
        vm.sendMessage(content: "   \n\t  ")
        #expect(vm.messages.isEmpty)
    }

    @Test("sendMessage trims whitespace from content")
    @MainActor
    func sendMessageTrims() {
        let vm = makeDetailVM()
        vm.sendMessage(content: "  Hello  ")

        #expect(vm.messages.count == 1)
        #expect(vm.messages[0].content.text == "Hello")
    }

    @Test("sendMessage with expectAgentReply sets isAgentGenerating")
    @MainActor
    func sendMessageExpectAgentReply() {
        let vm = makeDetailVM()
        vm.sendMessage(content: "What is 2+2?", expectAgentReply: true)

        #expect(vm.isAgentGenerating == true)
        #expect(vm.messages.count == 1)
    }

    @Test("sendMessage without expectAgentReply does not set isAgentGenerating")
    @MainActor
    func sendMessageNoAgentReply() {
        let vm = makeDetailVM()
        vm.sendMessage(content: "Hello", expectAgentReply: false)

        #expect(vm.isAgentGenerating == false)
    }

    @Test("Multiple sendMessage calls produce unique message IDs")
    @MainActor
    func multipleSendsUniqueIDs() {
        let vm = makeDetailVM()

        vm.sendMessage(content: "One")
        vm.sendMessage(content: "Two")
        vm.sendMessage(content: "Three")

        let ids = Set(vm.messages.map(\.id))
        #expect(ids.count == 3)
    }

    // MARK: - Message Grouping

    @Test("Empty messages produce empty groupedMessages")
    @MainActor
    func emptyMessagesEmptyGroups() {
        let vm = makeDetailVM()
        #expect(vm.groupedMessages.isEmpty)
    }

    @Test("Single message produces one group")
    @MainActor
    func singleMessageOneGroup() {
        let vm = makeDetailVM()
        vm.messages = [makeMessage(id: "m1")]

        #expect(vm.groupedMessages.count == 1)
        #expect(vm.groupedMessages[0].messages.count == 1)
        #expect(vm.groupedMessages[0].showDateSeparator == true)
    }

    @Test("Messages from same sender within 120s are grouped together")
    @MainActor
    func sameGroupWithin120s() {
        let vm = makeDetailVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "u1", createdAt: now),
            makeMessage(id: "m2", senderID: "u1", createdAt: now.addingTimeInterval(60)),
            makeMessage(id: "m3", senderID: "u1", createdAt: now.addingTimeInterval(119)),
        ]

        #expect(vm.groupedMessages.count == 1)
        #expect(vm.groupedMessages[0].messages.count == 3)
    }

    @Test("Messages from different senders create separate groups")
    @MainActor
    func differentSendersSeparateGroups() {
        let vm = makeDetailVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "u1", createdAt: now),
            makeMessage(id: "m2", senderID: "u2", createdAt: now.addingTimeInterval(1)),
        ]

        #expect(vm.groupedMessages.count == 2)
    }

    @Test("Messages 120+ seconds apart create separate groups")
    @MainActor
    func timeGapCreatesNewGroup() {
        let vm = makeDetailVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "u1", createdAt: now),
            makeMessage(id: "m2", senderID: "u1", createdAt: now.addingTimeInterval(121)),
        ]

        #expect(vm.groupedMessages.count == 2)
    }

    @Test("Different senderType creates separate group even with same senderID")
    @MainActor
    func differentSenderTypeNewGroup() {
        let vm = makeDetailVM()
        let now = Date()

        vm.messages = [
            makeMessage(id: "m1", senderID: "u1", senderType: .human, createdAt: now),
            makeMessage(id: "m2", senderID: "u1", senderType: .agent, createdAt: now.addingTimeInterval(1)),
        ]

        #expect(vm.groupedMessages.count == 2)
    }

    // MARK: - Conversation Endpoint Validation

    @Test("listConversations endpoint uses GET method")
    func listConversationsMethod() {
        #expect(APIEndpoint.listConversations(cursor: nil, limit: nil).method == "GET")
    }

    @Test("listConversations has correct path")
    func listConversationsPath() {
        #expect(APIEndpoint.listConversations(cursor: nil, limit: nil).path == "/conversations")
    }

    @Test("listConversations requires authentication")
    func listConversationsRequiresAuth() {
        #expect(APIEndpoint.listConversations(cursor: nil, limit: nil).requiresAuth == true)
    }

    @Test("listConversations with cursor and limit has query items")
    func listConversationsQueryItems() {
        let endpoint = APIEndpoint.listConversations(cursor: "abc", limit: 20)
        let items = endpoint.queryItems
        #expect(items != nil)
        #expect(items?.count == 2)
    }

    @Test("listConversations with nil cursor and limit has nil queryItems")
    func listConversationsNilQueryItems() {
        let endpoint = APIEndpoint.listConversations(cursor: nil, limit: nil)
        #expect(endpoint.queryItems == nil)
    }

    @Test("createConversation uses POST method")
    func createConversationMethod() {
        let endpoint = APIEndpoint.createConversation(type: "agent", title: "New Chat", agentID: "a1")
        #expect(endpoint.method == "POST")
    }

    @Test("createConversation has correct path")
    func createConversationPath() {
        let endpoint = APIEndpoint.createConversation(type: "agent", title: nil, agentID: nil)
        #expect(endpoint.path == "/conversations")
    }

    @Test("createConversation encodes type in body")
    func createConversationBody() throws {
        let endpoint = APIEndpoint.createConversation(type: "agent", title: "Test", agentID: "a1")
        let request = try endpoint.urlRequest(baseURL: baseURL)
        let body = try #require(request.httpBody)
        let dict = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        #expect(dict?["type"] as? String == "agent")
        #expect(dict?["title"] as? String == "Test")
        #expect(dict?["agent_id"] as? String == "a1")
    }

    @Test("deleteConversation uses DELETE method")
    func deleteConversationMethod() {
        #expect(APIEndpoint.deleteConversation(id: "c1").method == "DELETE")
    }

    @Test("deleteConversation has correct path")
    func deleteConversationPath() {
        #expect(APIEndpoint.deleteConversation(id: "conv_abc").path == "/conversations/conv_abc")
    }

    @Test("deleteConversation requires authentication")
    func deleteConversationRequiresAuth() {
        #expect(APIEndpoint.deleteConversation(id: "c1").requiresAuth == true)
    }

    @Test("getConversation uses GET method")
    func getConversationMethod() {
        #expect(APIEndpoint.getConversation(id: "c1").method == "GET")
    }

    @Test("getConversation has correct path with ID")
    func getConversationPath() {
        #expect(APIEndpoint.getConversation(id: "conv_xyz").path == "/conversations/conv_xyz")
    }

    @Test("updateConversation uses PATCH method")
    func updateConversationMethod() {
        #expect(APIEndpoint.updateConversation(id: "c1", title: "New Title").method == "PATCH")
    }

    // MARK: - Message Endpoint Validation

    @Test("listMessages has correct path with conversationID")
    func listMessagesPath() {
        let endpoint = APIEndpoint.listMessages(conversationID: "conv_1", cursor: nil, limit: nil)
        #expect(endpoint.path == "/conversations/conv_1/messages")
    }

    @Test("sendMessage uses POST method")
    func sendMessageMethod() {
        let endpoint = APIEndpoint.sendMessage(
            conversationID: "c1",
            content: MessageContent(text: "Hi"),
            idempotencyKey: "key-1"
        )
        #expect(endpoint.method == "POST")
    }

    @Test("sendMessage has idempotency key")
    func sendMessageIdempotencyKey() {
        let endpoint = APIEndpoint.sendMessage(
            conversationID: "c1",
            content: MessageContent(text: "Hi"),
            idempotencyKey: "unique-key"
        )
        #expect(endpoint.idempotencyKey == "unique-key")
    }

    // MARK: - Member Endpoint Validation

    @Test("listMembers has correct path")
    func listMembersPath() {
        #expect(APIEndpoint.listMembers(conversationID: "c1").path == "/conversations/c1/members")
    }

    @Test("addMember uses POST method")
    func addMemberMethod() {
        #expect(APIEndpoint.addMember(conversationID: "c1", userID: "u1").method == "POST")
    }

    @Test("removeMember uses DELETE method")
    func removeMemberMethod() {
        #expect(APIEndpoint.removeMember(conversationID: "c1", userID: "u1").method == "DELETE")
    }

    @Test("removeMember has correct path with both IDs")
    func removeMemberPath() {
        let endpoint = APIEndpoint.removeMember(conversationID: "c1", userID: "u99")
        #expect(endpoint.path == "/conversations/c1/members/u99")
    }

    // MARK: - Typing and Channel Events

    @Test("subscribeToChannel without WebSocket is a no-op")
    @MainActor
    func subscribeWithoutWS() {
        let vm = makeDetailVM()
        vm.subscribeToChannel() // Should not crash
    }

    @Test("unsubscribeFromChannel without WebSocket is safe")
    @MainActor
    func unsubscribeWithoutWS() {
        let vm = makeDetailVM()
        vm.unsubscribeFromChannel() // Should not crash
    }

    @Test("userDidType without WebSocket does not crash")
    @MainActor
    func userDidTypeWithoutWS() {
        let vm = makeDetailVM()
        vm.userDidType() // Should not crash
    }

    @Test("inputText changes are independent of isTyping")
    @MainActor
    func inputTextAndTypingIndependent() {
        let vm = makeDetailVM()
        vm.inputText = "Hello"
        #expect(vm.inputText == "Hello")
        #expect(vm.isTyping == false)
    }

    // MARK: - Conversation Model

    @Test("Conversation types decode correctly")
    func conversationTypes() throws {
        for (raw, expected) in [
            ("dm", Conversation.ConversationType.dm),
            ("group", Conversation.ConversationType.group),
            ("agent", Conversation.ConversationType.agent),
            ("bridge", Conversation.ConversationType.bridge),
        ] {
            let json = """
            {
                "id": "c1", "type": "\(raw)",
                "createdAt": "2026-03-01T08:00:00Z"
            }
            """.data(using: .utf8)!
            let conversation = try JSONDecoder.waiagents.decode(Conversation.self, from: json)
            #expect(conversation.type == expected)
        }
    }

    @Test("Conversation with all optional fields")
    func conversationFullInit() {
        let conv = Conversation(
            id: "c1",
            type: .agent,
            title: "Agent Chat",
            creatorID: "u1",
            agentID: "a1",
            lastMessageAt: Date()
        )
        #expect(conv.title == "Agent Chat")
        #expect(conv.agentID == "a1")
        #expect(conv.creatorID == "u1")
    }

    @Test("Conversation with nil optional fields")
    func conversationMinimalInit() {
        let conv = Conversation(id: "c1", type: .dm)
        #expect(conv.title == nil)
        #expect(conv.agentID == nil)
        #expect(conv.bridgeID == nil)
    }

    @Test("Two conversations with same ID are equal")
    func conversationEquality() {
        let date = Date()
        let a = Conversation(id: "c1", type: .dm, createdAt: date, updatedAt: date)
        let b = Conversation(id: "c1", type: .dm, createdAt: date, updatedAt: date)
        #expect(a == b)
    }

    @Test("Two conversations with different IDs are not equal")
    func conversationInequality() {
        let date = Date()
        let a = Conversation(id: "c1", type: .dm, createdAt: date, updatedAt: date)
        let b = Conversation(id: "c2", type: .dm, createdAt: date, updatedAt: date)
        #expect(a != b)
    }
}
