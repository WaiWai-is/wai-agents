import SwiftUI

/// Browse AI agents with category filter pills, search bar,
/// and grid of agent cards.
public struct MarketplaceView: View {
    @Environment(AppState.self) private var appState
    @State private var viewModel: MarketplaceViewModel?
    @State private var searchText = ""
    @State private var selectedCategory: String?
    @State private var searchTask: Task<Void, Never>?
    @State private var selectedAgent: Agent?
    @State private var startConversationError: String?

    @Environment(\.colorScheme) private var colorScheme

    private let categories = [
        "Coding", "Writing", "Research", "Creative",
        "Data Analysis", "Education", "Productivity", "Fun"
    ]

    public init() {}

    public var body: some View {
        VStack(spacing: 0) {
            // Search bar
            SearchBarView(text: $searchText, placeholder: "Search agents...")
                .padding(.horizontal, RaccoonSpacing.space4)
                .padding(.top, RaccoonSpacing.space3)
                .onChange(of: searchText) {
                    searchTask?.cancel()
                    searchTask = Task {
                        try? await Task.sleep(nanoseconds: 300_000_000) // 300ms debounce
                        guard !Task.isCancelled else { return }
                        await viewModel?.searchAgents(query: searchText)
                    }
                }

            // Category pills
            categoryPills

            // Agent grid
            if let vm = viewModel {
                if vm.isLoading && vm.agents.isEmpty {
                    LoadingView()
                        .frame(maxHeight: .infinity)
                } else if let error = vm.error {
                    VStack(spacing: RaccoonSpacing.space3) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(RaccoonColors.Semantic.error)
                        Text(error)
                            .font(RaccoonTypography.textSm)
                            .foregroundStyle(textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if filteredAgents.isEmpty {
                    emptyState
                } else {
                    agentGrid
                }
            } else {
                LoadingView()
                    .frame(maxHeight: .infinity)
            }
        }
        .background(bgPrimary)
        .alert("Unable to Start Conversation", isPresented: Binding(
            get: { startConversationError != nil },
            set: { if !$0 { startConversationError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(startConversationError ?? "Unknown error")
        }
        .sheet(item: $selectedAgent) { agent in
            #if os(iOS)
            NavigationStack {
                agentProfileView(for: agent)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { selectedAgent = nil }
                        }
                    }
            }
            #else
            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Button("Close") { selectedAgent = nil }
                        .keyboardShortcut(.cancelAction)
                }
                .padding(.horizontal, RaccoonSpacing.space4)
                .padding(.top, RaccoonSpacing.space3)

                agentProfileView(for: agent)
            }
            .frame(minWidth: 560, minHeight: 560)
            #endif
        }
        .task {
            if viewModel == nil {
                let vm = MarketplaceViewModel(apiClient: appState.apiClient)
                viewModel = vm
                await vm.loadAgents()
            }
        }
    }

    private var categoryPills: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: RaccoonSpacing.space2) {
                // "All" pill
                categoryPill(name: "All", isSelected: selectedCategory == nil) {
                    selectedCategory = nil
                }

                ForEach(categories, id: \.self) { category in
                    categoryPill(name: category, isSelected: selectedCategory == category) {
                        selectedCategory = category
                    }
                }
            }
            .padding(.horizontal, RaccoonSpacing.space4)
            .padding(.vertical, RaccoonSpacing.space3)
        }
    }

    private func categoryPill(name: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(name)
                .font(RaccoonTypography.bodySmall)
                .foregroundStyle(isSelected ? RaccoonColors.Light.textInverse : textSecondary)
                .padding(.horizontal, RaccoonSpacing.space3)
                .padding(.vertical, RaccoonSpacing.space2)
                .background(isSelected ? RaccoonColors.accentPrimary : bgTertiary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var agentGrid: some View {
        ScrollView {
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: RaccoonSpacing.space4),
                    GridItem(.flexible(), spacing: RaccoonSpacing.space4),
                ],
                spacing: RaccoonSpacing.space4
            ) {
                ForEach(filteredAgents) { agent in
                    Button {
                        #if os(macOS)
                        appState.selectedMarketplaceAgent = agent
                        #else
                        selectedAgent = agent
                        #endif
                    } label: {
                        agentCard(agent)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, RaccoonSpacing.space4)
        }
    }

    private func agentProfileView(for agent: Agent) -> some View {
        AgentProfileView(
            agent: agent,
            creatorName: agent.creatorID,
            onStartConversation: {
                startConversation(with: agent)
            }
        )
    }

    private func startConversation(with agent: Agent) {
        Task {
            do {
                let response: ConversationResponse = try await appState.apiClient.request(
                    .startAgentConversation(agentID: agent.id)
                )

                appState.conversationStore.upsert(response.conversation)
                appState.selectedConversationID = response.conversation.id
                selectedAgent = nil
            } catch {
                startConversationError = String(describing: error)
            }
        }
    }

    private func agentCard(_ agent: Agent) -> some View {
        VStack(alignment: .leading, spacing: RaccoonSpacing.space3) {
            // Avatar and name
            HStack(spacing: RaccoonSpacing.space3) {
                AvatarView(
                    name: agent.name,
                    size: 44,
                    isAgent: true,
                    agentAccentColor: RaccoonColors.AgentAccent.default
                )

                VStack(alignment: .leading, spacing: RaccoonSpacing.space1) {
                    Text(agent.name)
                        .font(RaccoonTypography.textLg)
                        .foregroundStyle(textPrimary)
                        .lineLimit(1)

                    if let category = agent.category {
                        Text(category)
                            .font(RaccoonTypography.caption)
                            .foregroundStyle(textTertiary)
                    }
                }
            }

            // Description
            if let description = agent.description {
                Text(description)
                    .font(RaccoonTypography.bodySmall)
                    .foregroundStyle(textSecondary)
                    .lineLimit(3)
            }

            // Rating and usage
            HStack(spacing: RaccoonSpacing.space3) {
                // Stars
                if (agent.ratingCount ?? 0) > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(RaccoonColors.Semantic.warning)
                        Text(String(format: "%.1f", agent.averageRating))
                            .font(RaccoonTypography.caption)
                            .foregroundStyle(textSecondary)
                        Text("(\(agent.ratingCount ?? 0))")
                            .font(RaccoonTypography.caption)
                            .foregroundStyle(textTertiary)
                    }
                }

                Spacer()

                // Usage count
                HStack(spacing: RaccoonSpacing.space1) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 10))
                        .foregroundStyle(textTertiary)
                    Text("\(agent.usageCount ?? 0)")
                        .font(RaccoonTypography.caption)
                        .foregroundStyle(textTertiary)
                }
            }
        }
        .padding(RaccoonSpacing.space4)
        .background(bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: RaccoonRadius.xl))
        .overlay {
            RoundedRectangle(cornerRadius: RaccoonRadius.xl)
                .strokeBorder(borderPrimary, lineWidth: 1)
        }
    }

    private var filteredAgents: [Agent] {
        var result = viewModel?.agents ?? []
        if let category = selectedCategory {
            result = result.filter { $0.category == category }
        }
        return result
    }

    private var emptyState: some View {
        VStack(spacing: RaccoonSpacing.space4) {
            Image(systemName: "cpu")
                .font(.system(size: 36))
                .foregroundStyle(textTertiary)
            Text("No agents found")
                .font(RaccoonTypography.textLg)
                .foregroundStyle(textSecondary)
            Text("Try a different search or category")
                .font(RaccoonTypography.bodySmall)
                .foregroundStyle(textTertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var bgPrimary: Color {
        colorScheme == .dark ? RaccoonColors.Dark.bgPrimary : RaccoonColors.Light.bgPrimary
    }

    private var bgSecondary: Color {
        colorScheme == .dark ? RaccoonColors.Dark.bgSecondary : RaccoonColors.Light.bgSecondary
    }

    private var bgTertiary: Color {
        colorScheme == .dark ? RaccoonColors.Dark.bgTertiary : RaccoonColors.Light.bgTertiary
    }

    private var textPrimary: Color {
        colorScheme == .dark ? RaccoonColors.Dark.textPrimary : RaccoonColors.Light.textPrimary
    }

    private var textSecondary: Color {
        colorScheme == .dark ? RaccoonColors.Dark.textSecondary : RaccoonColors.Light.textSecondary
    }

    private var textTertiary: Color {
        colorScheme == .dark ? RaccoonColors.Dark.textTertiary : RaccoonColors.Light.textTertiary
    }

    private var borderPrimary: Color {
        colorScheme == .dark ? RaccoonColors.Dark.borderPrimary : RaccoonColors.Light.borderPrimary
    }
}
