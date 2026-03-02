import SwiftUI

@MainActor
@Observable
public final class ConversationListViewModel {
    public var conversations: [Conversation] = []
    public var isLoading = false
    public var error: String?

    private let apiClient: APIClient
    private let conversationStore: ConversationStore?

    private var nextCursor: String?
    private var hasMore: Bool = true

    public init(apiClient: APIClient, conversationStore: ConversationStore? = nil) {
        self.apiClient = apiClient
        self.conversationStore = conversationStore
    }

    public func loadConversations() async {
        isLoading = true
        error = nil

        do {
            let response: PaginatedResponse<Conversation> = try await apiClient.request(
                .listConversations(cursor: nil, limit: 30)
            )
            conversations = response.items
            nextCursor = response.pageInfo.nextCursor
            hasMore = response.pageInfo.hasMore

            // Sync into the shared conversation store so other views
            // can look up conversation metadata (type, title, etc.).
            if let store = conversationStore {
                store.conversations = response.items
            }
        } catch {
            self.error = String(describing: error)
        }

        isLoading = false
    }

    public func loadMore() async {
        guard hasMore, let cursor = nextCursor else { return }

        do {
            let response: PaginatedResponse<Conversation> = try await apiClient.request(
                .listConversations(cursor: cursor, limit: 30)
            )
            conversations.append(contentsOf: response.items)
            nextCursor = response.pageInfo.nextCursor
            hasMore = response.pageInfo.hasMore

            // Sync new items into the shared store.
            if let store = conversationStore {
                for conversation in response.items {
                    store.upsert(conversation)
                }
            }
        } catch {
            self.error = String(describing: error)
        }
    }
}
