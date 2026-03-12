import SwiftUI

@MainActor
@Observable
public final class FeedViewModel {
    public var feedItems: [FeedItem] = []
    public var isLoading = false
    public var isRefreshing = false
    public var error: String?
    public private(set) var likedItemIDs: Set<String> = []

    private let apiClient: APIClient
    // nonisolated(unsafe) so deinit can cancel tasks.
    // Task.cancel() is thread-safe; mutations are always on @MainActor.
    @ObservationIgnored
    nonisolated(unsafe) private var likeTasks: [String: Task<Void, Never>] = [:]

    private var nextCursor: String?
    public private(set) var hasMore: Bool = true
    private var currentTab: FeedTab = .forYou
    private var cachedTabItems: [FeedTab: [FeedItem]] = [:]
    private var cachedTabCursors: [FeedTab: String?] = [:]
    private var cachedTabHasMore: [FeedTab: Bool] = [:]

    public enum FeedTab: String, CaseIterable, Sendable {
        case forYou = "For You"
        case trending = "Trending"
        case following = "Following"
        case new = "New"
    }

    public init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    deinit {
        for task in likeTasks.values {
            task.cancel()
        }
    }

    public func loadFeed(tab: FeedTab) async {
        currentTab = tab

        // Return cached items if available
        if let cached = cachedTabItems[tab] {
            feedItems = cached
            nextCursor = cachedTabCursors[tab] ?? nil
            hasMore = cachedTabHasMore[tab] ?? true
            return
        }

        isLoading = true
        error = nil

        do {
            let response: PaginatedResponse<FeedItem> = try await apiClient.request(
                endpoint(for: tab, cursor: nil)
            )
            feedItems = response.items
            nextCursor = response.pageInfo.nextCursor
            hasMore = response.pageInfo.hasMore

            cachedTabItems[tab] = response.items
            cachedTabCursors[tab] = response.pageInfo.nextCursor
            cachedTabHasMore[tab] = response.pageInfo.hasMore
        } catch {
            self.error = String(describing: error)
        }

        isLoading = false
    }

    public func refresh(tab: FeedTab) async {
        isRefreshing = true
        cachedTabItems.removeValue(forKey: tab)
        cachedTabCursors.removeValue(forKey: tab)
        cachedTabHasMore.removeValue(forKey: tab)
        await loadFeed(tab: tab)
        isRefreshing = false
    }

    public func loadMore() async {
        guard hasMore, let cursor = nextCursor else { return }

        do {
            let response: PaginatedResponse<FeedItem> = try await apiClient.request(
                endpoint(for: currentTab, cursor: cursor)
            )
            feedItems.append(contentsOf: response.items)
            nextCursor = response.pageInfo.nextCursor
            hasMore = response.pageInfo.hasMore

            cachedTabItems[currentTab] = feedItems
            cachedTabCursors[currentTab] = nextCursor
            cachedTabHasMore[currentTab] = hasMore
        } catch {
            self.error = String(describing: error)
        }
    }

    public func isLiked(_ id: String) -> Bool {
        likedItemIDs.contains(id)
    }

    public func toggleLike(id: String) async {
        if likedItemIDs.contains(id) {
            await unlikeItem(id: id)
        } else {
            await likeItem(id: id)
        }
    }

    public func likeItem(id: String) async {
        likeTasks[id]?.cancel()

        likedItemIDs.insert(id)
        if let index = feedItems.firstIndex(where: { $0.id == id }) {
            feedItems[index].likeCount += 1
        }

        let task = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.apiClient.requestVoid(.likeFeedItem(id: id))
            } catch {
                guard !Task.isCancelled else { return }
                // Revert optimistic update on failure
                self.likedItemIDs.remove(id)
                if let index = self.feedItems.firstIndex(where: { $0.id == id }) {
                    self.feedItems[index].likeCount = max(0, self.feedItems[index].likeCount - 1)
                }
                self.error = String(describing: error)
            }
            self.likeTasks.removeValue(forKey: id)
        }
        likeTasks[id] = task
        await task.value
    }

    public func unlikeItem(id: String) async {
        likeTasks[id]?.cancel()

        likedItemIDs.remove(id)
        if let index = feedItems.firstIndex(where: { $0.id == id }) {
            feedItems[index].likeCount = max(0, feedItems[index].likeCount - 1)
        }

        let task = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.apiClient.requestVoid(.unlikeFeedItem(id: id))
            } catch {
                guard !Task.isCancelled else { return }
                // Revert optimistic update on failure
                self.likedItemIDs.insert(id)
                if let index = self.feedItems.firstIndex(where: { $0.id == id }) {
                    self.feedItems[index].likeCount += 1
                }
                self.error = String(describing: error)
            }
            self.likeTasks.removeValue(forKey: id)
        }
        likeTasks[id] = task
        await task.value
    }

    private func endpoint(for tab: FeedTab, cursor: String?) -> APIEndpoint {
        switch tab {
        case .forYou:
            return .feed(cursor: cursor, limit: 20)
        case .trending:
            return .trending(cursor: cursor, limit: 20)
        case .following:
            return .followingFeed(cursor: cursor, limit: 20)
        case .new:
            return .newFeedItems(cursor: cursor, limit: 20)
        }
    }
}
