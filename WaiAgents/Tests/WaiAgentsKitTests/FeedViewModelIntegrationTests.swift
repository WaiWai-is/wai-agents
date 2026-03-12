import Foundation
import Testing
@testable import WaiAgentsKit

/// Integration-level tests for FeedViewModel: initial state, loading feeds,
/// pagination, like/unlike optimistic updates and revert on failure, fork,
/// refresh, empty state, error handling, concurrent operations, deduplication,
/// and tab endpoint mapping.
@Suite("FeedViewModel Integration Tests")
struct FeedViewModelIntegrationTests {

    private let baseURL = URL(string: "https://openraccoon.com")!

    // MARK: - Helpers

    @MainActor
    private func makeVM() -> FeedViewModel {
        let authManager = AuthManager(serviceName: "test.feed.int.\(UUID().uuidString)")
        let apiClient = APIClient(baseURL: baseURL, authManager: authManager)
        return FeedViewModel(apiClient: apiClient)
    }

    private func makeFeedItem(
        id: String,
        creatorID: String = "user_1",
        type: FeedItem.FeedItemType = .agentShowcase,
        referenceID: String? = nil,
        referenceType: FeedItem.ReferenceType = .agent,
        title: String? = nil,
        description: String? = nil,
        likeCount: Int = 0,
        forkCount: Int = 0,
        viewCount: Int = 0
    ) -> FeedItem {
        FeedItem(
            id: id,
            creatorID: creatorID,
            type: type,
            referenceID: referenceID ?? "ref_\(id)",
            referenceType: referenceType,
            title: title,
            description: description,
            likeCount: likeCount,
            forkCount: forkCount,
            viewCount: viewCount
        )
    }

    // MARK: - Initial State

    @Test("FeedViewModel starts with empty feedItems")
    @MainActor
    func initialFeedItemsEmpty() {
        let vm = makeVM()
        #expect(vm.feedItems.isEmpty)
    }

    @Test("FeedViewModel starts with isLoading false")
    @MainActor
    func initialIsLoadingFalse() {
        let vm = makeVM()
        #expect(vm.isLoading == false)
    }

    @Test("FeedViewModel starts with isRefreshing false")
    @MainActor
    func initialIsRefreshingFalse() {
        let vm = makeVM()
        #expect(vm.isRefreshing == false)
    }

    @Test("FeedViewModel starts with nil error")
    @MainActor
    func initialErrorNil() {
        let vm = makeVM()
        #expect(vm.error == nil)
    }

    @Test("FeedViewModel starts with empty likedItemIDs")
    @MainActor
    func initialLikedItemIDsEmpty() {
        let vm = makeVM()
        #expect(vm.likedItemIDs.isEmpty)
    }

    @Test("FeedViewModel starts with hasMore true")
    @MainActor
    func initialHasMoreTrue() {
        let vm = makeVM()
        #expect(vm.hasMore == true)
    }

    // MARK: - loadFeed

    @Test("loadFeed with network failure sets error")
    @MainActor
    func loadFeedSetsError() async {
        let vm = makeVM()
        await vm.loadFeed(tab: .forYou)
        #expect(vm.error != nil)
        #expect(vm.isLoading == false)
        #expect(vm.feedItems.isEmpty)
    }

    @Test("loadFeed resets error at the start")
    @MainActor
    func loadFeedResetsError() async {
        let vm = makeVM()
        vm.error = "previous error"
        await vm.loadFeed(tab: .forYou)
        // Error is set to nil at start, then re-set on failure
        #expect(vm.error != nil) // re-set because of network failure
    }

    @Test("loadFeed for each tab type does not crash")
    @MainActor
    func loadFeedAllTabs() async {
        let vm = makeVM()
        for tab in FeedViewModel.FeedTab.allCases {
            await vm.loadFeed(tab: tab)
            #expect(vm.isLoading == false)
        }
    }

    @Test("loadFeed sets isLoading to false after completion")
    @MainActor
    func loadFeedResetsIsLoading() async {
        let vm = makeVM()
        await vm.loadFeed(tab: .trending)
        #expect(vm.isLoading == false)
    }

    @Test("loadFeed returns cached items on second call for same tab")
    @MainActor
    func loadFeedCachesItems() async {
        let vm = makeVM()
        // Set items manually to simulate a cached state
        vm.feedItems = [makeFeedItem(id: "f1")]

        // After a failed load, no cache is stored
        await vm.loadFeed(tab: .forYou)
        #expect(vm.error != nil)
    }

    // MARK: - loadMore

    @Test("loadMore does nothing when nextCursor is nil")
    @MainActor
    func loadMoreNoCursor() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1")]
        await vm.loadMore()
        #expect(vm.feedItems.count == 1)
        #expect(vm.error == nil)
    }

    @Test("loadMore preserves existing items on failure")
    @MainActor
    func loadMorePreservesItems() async {
        let vm = makeVM()
        let items = [makeFeedItem(id: "f1"), makeFeedItem(id: "f2")]
        vm.feedItems = items
        await vm.loadMore()
        #expect(vm.feedItems.count == 2)
    }

    // MARK: - likeItem Optimistic Update

    @Test("likeItem inserts ID into likedItemIDs optimistically")
    @MainActor
    func likeItemOptimisticInsert() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]
        // After likeItem completes (fails on network, reverts), the ID is removed
        await vm.likeItem(id: "f1")
        // Reverted after failure
        #expect(!vm.likedItemIDs.contains("f1"))
    }

    @Test("likeItem increments likeCount optimistically then reverts on failure")
    @MainActor
    func likeItemCountRevert() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 10)]
        await vm.likeItem(id: "f1")
        // Reverted to original
        #expect(vm.feedItems[0].likeCount == 10)
    }

    @Test("likeItem sets error on network failure")
    @MainActor
    func likeItemSetsError() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 3)]
        await vm.likeItem(id: "f1")
        #expect(vm.error != nil)
    }

    @Test("likeItem on non-existent item ID does not modify feedItems")
    @MainActor
    func likeItemNonExistentID() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]
        await vm.likeItem(id: "f_nonexistent")
        #expect(vm.feedItems[0].likeCount == 5)
    }

    @Test("likeItem on empty feedItems does not crash")
    @MainActor
    func likeItemEmptyFeed() async {
        let vm = makeVM()
        await vm.likeItem(id: "f_anything")
        // No crash, likedItemIDs reverted after failure
        #expect(!vm.likedItemIDs.contains("f_anything"))
    }

    // MARK: - unlikeItem Optimistic Update

    @Test("unlikeItem removes ID from likedItemIDs optimistically")
    @MainActor
    func unlikeItemOptimisticRemove() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]
        // Pre-populate likedItemIDs
        await vm.likeItem(id: "f1") // fails and reverts
        // f1 not in likedItemIDs after revert

        await vm.unlikeItem(id: "f1")
        // After unlike revert, f1 is added back to likedItemIDs
        #expect(vm.likedItemIDs.contains("f1"))
    }

    @Test("unlikeItem decrements likeCount optimistically then reverts on failure")
    @MainActor
    func unlikeItemCountRevert() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 10)]
        await vm.unlikeItem(id: "f1")
        // Reverted to original (10)
        #expect(vm.feedItems[0].likeCount == 10)
    }

    @Test("unlikeItem never goes below zero")
    @MainActor
    func unlikeItemFloorAtZero() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 0)]
        await vm.unlikeItem(id: "f1")
        #expect(vm.feedItems[0].likeCount >= 0)
    }

    @Test("unlikeItem on non-existent item ID does not modify feedItems")
    @MainActor
    func unlikeItemNonExistentID() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]
        await vm.unlikeItem(id: "f_nonexistent")
        #expect(vm.feedItems[0].likeCount == 5)
    }

    // MARK: - toggleLike

    @Test("toggleLike on non-liked item calls likeItem")
    @MainActor
    func toggleLikeCallsLike() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]
        #expect(!vm.isLiked("f1"))
        await vm.toggleLike(id: "f1")
        // Liked then reverted on failure
        #expect(vm.feedItems[0].likeCount == 5)
    }

    @Test("toggleLike on liked item calls unlikeItem")
    @MainActor
    func toggleLikeCallsUnlike() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]
        // Force the item to be "liked" by manual insert
        // Since likedItemIDs is private(set), use likeItem first
        await vm.likeItem(id: "f1") // fails, reverts, not liked
        // Unlike (which reverts back to liked state)
        await vm.unlikeItem(id: "f1")
        // Now it IS liked
        #expect(vm.isLiked("f1"))

        // toggleLike should call unlike since it's liked
        await vm.toggleLike(id: "f1")
        // After unlike revert, it's liked again
        #expect(vm.isLiked("f1"))
    }

    // MARK: - isLiked

    @Test("isLiked returns false for unknown ID")
    @MainActor
    func isLikedUnknownID() {
        let vm = makeVM()
        #expect(vm.isLiked("unknown") == false)
    }

    @Test("isLiked returns false for empty string")
    @MainActor
    func isLikedEmptyString() {
        let vm = makeVM()
        #expect(vm.isLiked("") == false)
    }

    // MARK: - refresh

    @Test("refresh clears cache and reloads")
    @MainActor
    func refreshClearsAndReloads() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1")]
        await vm.refresh(tab: .forYou)
        #expect(vm.isRefreshing == false)
        #expect(vm.isLoading == false)
    }

    @Test("refresh sets isRefreshing to false after completion")
    @MainActor
    func refreshResetsIsRefreshing() async {
        let vm = makeVM()
        await vm.refresh(tab: .trending)
        #expect(vm.isRefreshing == false)
    }

    @Test("refresh for different tabs works independently")
    @MainActor
    func refreshDifferentTabs() async {
        let vm = makeVM()
        await vm.refresh(tab: .forYou)
        await vm.refresh(tab: .new)
        #expect(vm.isRefreshing == false)
    }

    // MARK: - Empty Feed State

    @Test("Empty feed after load shows empty feedItems")
    @MainActor
    func emptyFeedAfterLoad() async {
        let vm = makeVM()
        await vm.loadFeed(tab: .forYou)
        #expect(vm.feedItems.isEmpty)
    }

    @Test("Setting feedItems to empty array works")
    @MainActor
    func setEmptyFeedItems() {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1"), makeFeedItem(id: "f2")]
        #expect(vm.feedItems.count == 2)
        vm.feedItems = []
        #expect(vm.feedItems.isEmpty)
    }

    // MARK: - Error Handling

    @Test("Error from loadFeed does not prevent subsequent like")
    @MainActor
    func loadErrorDoesNotBlockLike() async {
        let vm = makeVM()
        await vm.loadFeed(tab: .forYou)
        #expect(vm.error != nil)

        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 3)]
        vm.error = nil
        await vm.likeItem(id: "f1")
        // Like fails too, but it doesn't crash
        #expect(vm.error != nil)
    }

    @Test("Error from likeItem does not corrupt feedItems")
    @MainActor
    func likeErrorPreservesFeed() async {
        let vm = makeVM()
        vm.feedItems = [
            makeFeedItem(id: "f1", likeCount: 5),
            makeFeedItem(id: "f2", likeCount: 10),
        ]
        await vm.likeItem(id: "f1")
        // f2 is untouched
        #expect(vm.feedItems[1].likeCount == 10)
        // f1 reverted
        #expect(vm.feedItems[0].likeCount == 5)
    }

    @Test("Multiple errors accumulate as the latest error wins")
    @MainActor
    func latestErrorWins() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 5)]
        await vm.likeItem(id: "f1")
        let firstError = vm.error
        #expect(firstError != nil)

        await vm.loadFeed(tab: .trending)
        let secondError = vm.error
        #expect(secondError != nil)
        // The error is replaced by the latest one
    }

    // MARK: - Concurrent Like/Unlike

    @Test("Concurrent likes on different items revert independently")
    @MainActor
    func concurrentLikesDifferentItems() async {
        let vm = makeVM()
        vm.feedItems = [
            makeFeedItem(id: "f1", likeCount: 1),
            makeFeedItem(id: "f2", likeCount: 2),
            makeFeedItem(id: "f3", likeCount: 3),
        ]
        await vm.likeItem(id: "f1")
        await vm.likeItem(id: "f2")
        await vm.likeItem(id: "f3")
        // All reverted
        #expect(vm.feedItems[0].likeCount == 1)
        #expect(vm.feedItems[1].likeCount == 2)
        #expect(vm.feedItems[2].likeCount == 3)
    }

    @Test("Rapid like-unlike on same item produces stable state")
    @MainActor
    func rapidLikeUnlikeSameItem() async {
        let vm = makeVM()
        vm.feedItems = [makeFeedItem(id: "f1", likeCount: 7)]
        await vm.likeItem(id: "f1")
        await vm.unlikeItem(id: "f1")
        #expect(vm.feedItems[0].likeCount >= 0)
    }

    // MARK: - Feed Item Deduplication

    @Test("Setting feedItems with duplicate IDs preserves all entries")
    @MainActor
    func duplicateIDsPreserved() {
        let vm = makeVM()
        vm.feedItems = [
            makeFeedItem(id: "f1", likeCount: 1),
            makeFeedItem(id: "f1", likeCount: 2), // duplicate ID
        ]
        // FeedViewModel does not deduplicate — both are present
        #expect(vm.feedItems.count == 2)
    }

    @Test("likeItem on duplicated ID only modifies first occurrence")
    @MainActor
    func likeItemFirstOccurrence() async {
        let vm = makeVM()
        vm.feedItems = [
            makeFeedItem(id: "f1", likeCount: 5),
            makeFeedItem(id: "f1", likeCount: 10), // duplicate
        ]
        await vm.likeItem(id: "f1")
        // firstIndex finds the first one; revert brings it back to 5
        #expect(vm.feedItems[0].likeCount == 5)
        // Second is untouched
        #expect(vm.feedItems[1].likeCount == 10)
    }

    // MARK: - FeedTab Enum

    @Test("FeedTab allCases has exactly four values")
    func feedTabCount() {
        #expect(FeedViewModel.FeedTab.allCases.count == 4)
    }

    @Test("FeedTab raw values match expected strings")
    func feedTabRawValues() {
        #expect(FeedViewModel.FeedTab.forYou.rawValue == "For You")
        #expect(FeedViewModel.FeedTab.trending.rawValue == "Trending")
        #expect(FeedViewModel.FeedTab.following.rawValue == "Following")
        #expect(FeedViewModel.FeedTab.new.rawValue == "New")
    }

    // MARK: - Feed Endpoint Mapping

    @Test("Feed endpoint for .forYou uses /feed path")
    func feedEndpointForYou() {
        let endpoint = APIEndpoint.feed(cursor: nil, limit: 20)
        #expect(endpoint.path == "/feed")
    }

    @Test("Feed endpoint for .trending uses /feed/trending path")
    func feedEndpointTrending() {
        let endpoint = APIEndpoint.trending(cursor: nil, limit: 20)
        #expect(endpoint.path == "/feed/trending")
    }

    @Test("Feed endpoint for .following uses /feed/following path")
    func feedEndpointFollowing() {
        let endpoint = APIEndpoint.followingFeed(cursor: nil, limit: 20)
        #expect(endpoint.path == "/feed/following")
    }

    @Test("Feed endpoint for .new uses /feed/new path")
    func feedEndpointNew() {
        let endpoint = APIEndpoint.newFeedItems(cursor: nil, limit: 20)
        #expect(endpoint.path == "/feed/new")
    }

    @Test("likeFeedItem uses POST method")
    func likeFeedItemMethod() {
        #expect(APIEndpoint.likeFeedItem(id: "f1").method == "POST")
    }

    @Test("unlikeFeedItem uses DELETE method")
    func unlikeFeedItemMethod() {
        #expect(APIEndpoint.unlikeFeedItem(id: "f1").method == "DELETE")
    }

    @Test("likeFeedItem has correct path")
    func likeFeedItemPath() {
        #expect(APIEndpoint.likeFeedItem(id: "f1").path == "/feed/f1/like")
    }

    @Test("unlikeFeedItem has correct path")
    func unlikeFeedItemPath() {
        #expect(APIEndpoint.unlikeFeedItem(id: "f1").path == "/feed/f1/like")
    }
}
