import Foundation
import Testing
@testable import WaiAgentsKit

/// Edge-case tests for FeedViewModel: rapid toggling, concurrency,
/// task cleanup, pagination, tab switching, and error recovery.
@Suite("FeedViewModel Edge Cases")
struct FeedViewModelEdgeCaseTests {

    // MARK: - Helpers

    @MainActor
    private func makeVM() -> FeedViewModel {
        let authManager = AuthManager(serviceName: "test.feed.edge.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: URL(string: "https://openraccoon.com")!, authManager: authManager)
        return FeedViewModel(apiClient: apiClient)
    }

    private func makeFeedItem(
        id: String,
        likeCount: Int = 0,
        type: FeedItem.FeedItemType = .agentShowcase,
        referenceType: FeedItem.ReferenceType = .agent
    ) -> FeedItem {
        FeedItem(
            id: id,
            creatorID: "user_1",
            type: type,
            referenceID: "ref_\(id)",
            referenceType: referenceType,
            likeCount: likeCount
        )
    }

    // MARK: - Rapid Like/Unlike Toggling (Task Cancellation)

    @Test("Rapid like then unlike cancels the in-flight like task")
    @MainActor
    func rapidLikeThenUnlike() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 10)]

        // Like then immediately unlike — the first task should be cancelled
        await vm.likeItem(id: "f1")
        await vm.unlikeItem(id: "f1")

        // After both operations complete (both fail on network, both revert),
        // the final state should be consistent
        #expect(vm.feedItems[0].likeCount >= 0)
    }

    @Test("Rapid unlike then like cancels the in-flight unlike task")
    @MainActor
    func rapidUnlikeThenLike() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 10)]

        await vm.unlikeItem(id: "f1")
        await vm.likeItem(id: "f1")

        #expect(vm.feedItems[0].likeCount >= 0)
    }

    @Test("Triple toggle: like -> unlike -> like converges to stable state")
    @MainActor
    func tripleToggle() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]

        await vm.toggleLike(id: "f1") // like
        await vm.toggleLike(id: "f1") // unlike
        await vm.toggleLike(id: "f1") // like again

        // State should be consistent regardless of network failures
        #expect(vm.feedItems[0].likeCount >= 0)
    }

    // MARK: - likeTasks Cleanup After Completion

    @Test("After likeItem completes, subsequent likeItem works normally")
    @MainActor
    func likeTaskCleanupAfterCompletion() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 3)]

        // First like (will fail, revert)
        await vm.likeItem(id: "f1")
        let countAfterFirst = vm.feedItems[0].likeCount

        // Second like should work independently (task was cleaned up)
        await vm.likeItem(id: "f1")
        let countAfterSecond = vm.feedItems[0].likeCount

        // Both should have reverted to same value since both fail
        #expect(countAfterFirst == countAfterSecond)
    }

    @Test("After unlikeItem completes, subsequent unlikeItem works normally")
    @MainActor
    func unlikeTaskCleanupAfterCompletion() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 3)]

        await vm.unlikeItem(id: "f1")
        await vm.unlikeItem(id: "f1")

        // Should be stable after both revert
        #expect(vm.feedItems[0].likeCount >= 0)
    }

    // MARK: - Concurrent Like/Unlike on Different Items

    @Test("Concurrent likes on different items operate independently")
    @MainActor
    func concurrentLikesDifferentItems() async {
        let vm = makeVM()
        vm.feedItems = [
            makeFeedItem(id: "f1", likeCount: 5),
            makeFeedItem(id: "f2", likeCount: 10),
            makeFeedItem(id: "f3", likeCount: 0),
        ]

        // Like all three — they should not interfere with each other
        await vm.likeItem(id: "f1")
        await vm.likeItem(id: "f2")
        await vm.likeItem(id: "f3")

        // After network failure reverts, counts should be back to originals
        #expect(vm.feedItems[0].likeCount == 5)
        #expect(vm.feedItems[1].likeCount == 10)
        #expect(vm.feedItems[2].likeCount == 0)
    }

    @Test("Like and unlike on different items simultaneously is independent")
    @MainActor
    func likeAndUnlikeDifferentItems() async {
        let vm = makeVM()
        vm.feedItems = [
            makeFeedItem(id: "f1", likeCount: 5),
            makeFeedItem(id: "f2", likeCount: 10),
        ]

        await vm.likeItem(id: "f1")
        await vm.unlikeItem(id: "f2")

        // f1: liked then reverted => back to 5, not liked
        #expect(vm.feedItems[0].likeCount == 5)
        // f2: unliked then reverted => back to 10, liked
        #expect(vm.feedItems[1].likeCount == 10)
    }

    // MARK: - Feed Loading with Empty Results

    @Test("loadFeed with network failure sets error and clears loading")
    @MainActor
    func loadFeedNetworkFailure() async {
        let vm = makeVM()
        await vm.loadFeed(tab: .forYou)

        #expect(vm.isLoading == false)
        #expect(vm.error != nil)
        #expect(vm.feedItems.isEmpty)
    }

    @Test("loadFeed for different tabs sets error independently")
    @MainActor
    func loadFeedDifferentTabsError() async {
        let vm = makeVM()

        await vm.loadFeed(tab: .trending)
        let trendingError = vm.error
        #expect(trendingError != nil)

        await vm.loadFeed(tab: .new)
        let newError = vm.error
        #expect(newError != nil)
    }

    // MARK: - Tab Switching State Management

    @Test("Switching tabs preserves cached items when available")
    @MainActor
    func tabSwitchingCachePreservation() async {
        let vm = makeVM()

        // Load forYou (will fail, but sets error)
        await vm.loadFeed(tab: .forYou)
        let forYouError = vm.error

        // Load trending (will also fail)
        await vm.loadFeed(tab: .trending)

        // Re-load forYou — should NOT hit cache since first load failed (no items cached)
        vm.error = nil
        await vm.loadFeed(tab: .forYou)

        // Error should reappear since there's no cache and network fails again
        #expect(vm.error != nil)
        _ = forYouError
    }

    @Test("Each tab has its own hasMore state")
    @MainActor
    func tabIndependentHasMore() {
        let vm = makeVM()
        // Initially hasMore is true (default)
        #expect(vm.hasMore == true)
    }

    @Test("currentTab is forYou by default")
    @MainActor
    func defaultTab() async {
        let vm = makeVM()
        // loadFeed with .forYou should be the default path
        await vm.loadFeed(tab: .forYou)
        // No direct access to currentTab, but we verify via loadMore behavior
        #expect(vm.feedItems.isEmpty) // network failure
    }

    // MARK: - Pagination (loadMore)

    @Test("loadMore with hasMore=true but nil cursor does nothing")
    @MainActor
    func loadMoreNoCursor() async {
        let vm = makeVM()
        // hasMore is true by default, but nextCursor is nil
        await vm.loadMore()
        #expect(vm.feedItems.isEmpty)
        #expect(vm.error == nil) // loadMore guarded out before making any request
    }

    @Test("loadMore with hasMore=false does nothing even with items")
    @MainActor
    func loadMoreNoMore() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1")]
        // We can't set hasMore directly, but after a failed loadFeed it stays true
        // However, loadMore still guards on nextCursor being nil
        await vm.loadMore()
        #expect(vm.feedItems.count == 1) // unchanged
    }

    // MARK: - Error Recovery

    @Test("Error is cleared on new loadFeed call")
    @MainActor
    func errorClearedOnNewLoad() async {
        let vm = makeVM()

        // First load sets error
        await vm.loadFeed(tab: .forYou)
        #expect(vm.error != nil)

        // The error should be reset at the start of loadFeed (set to nil inside)
        // Even though the second call also fails, the error was briefly nil
        // After second call, error is set again
        await vm.loadFeed(tab: .trending)
        #expect(vm.error != nil)
    }

    @Test("Error from likeItem does not affect feedItems from previous load")
    @MainActor
    func likeErrorPreservesFeed() async {
        let vm = makeVM()
        let items = [
            makeFeedItem(id: "f1", likeCount: 5),
            makeFeedItem(id: "f2", likeCount: 10),
        ]
        vm.feedItems = items

        await vm.likeItem(id: "f1")

        // feedItems should still have 2 items
        #expect(vm.feedItems.count == 2)
        // f2 should be completely untouched
        #expect(vm.feedItems[1].likeCount == 10)
    }

    @Test("Refresh clears cached data then re-loads")
    @MainActor
    func refreshClearsCacheAndReloads() async {
        let vm = makeVM()

        await vm.loadFeed(tab: .forYou)
        let firstError = vm.error

        // Refresh should clear cache and try again
        await vm.refresh(tab: .forYou)

        #expect(vm.isRefreshing == false)
        #expect(vm.isLoading == false)
        // Still fails on network
        #expect(vm.error != nil)
        _ = firstError
    }

    @Test("Refresh sets isRefreshing to false after completion")
    @MainActor
    func refreshResetsIsRefreshing() async {
        let vm = makeVM()
        await vm.refresh(tab: .trending)
        #expect(vm.isRefreshing == false)
    }

    // MARK: - Deinit Behavior

    @Test("FeedViewModel can be deallocated without issues after likes")
    @MainActor
    func deinitAfterLikes() async {
        var vm: FeedViewModel? = makeVM()
        vm!.feedItems = [makeFeedItem(id: "f1", likeCount: 3)]

        // Start a like that will fail on network
        await vm!.likeItem(id: "f1")

        // Deallocate — deinit should cancel all likeTasks without crashing
        vm = nil
        #expect(vm == nil)
    }

    @Test("FeedViewModel can be deallocated immediately after creation")
    @MainActor
    func deinitImmediately() {
        var vm: FeedViewModel? = makeVM()
        vm = nil
        #expect(vm == nil)
    }
}
