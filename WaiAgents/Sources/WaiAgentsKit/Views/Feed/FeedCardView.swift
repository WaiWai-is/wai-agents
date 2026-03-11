import SwiftUI

/// Card displaying a feed item with thumbnail/preview, title,
/// author avatar+name, like count, fork count.
/// Like button with scale bounce animation.
public struct FeedCardView: View {
    public let item: FeedItem
    public let authorName: String
    public var isLiked: Bool
    public let onTap: () -> Void
    public let onLike: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var likeScale: CGFloat = 1.0

    public init(
        item: FeedItem,
        authorName: String,
        isLiked: Bool = false,
        onTap: @escaping () -> Void,
        onLike: @escaping () -> Void
    ) {
        self.item = item
        self.authorName = authorName
        self.isLiked = isLiked
        self.onTap = onTap
        self.onLike = onLike
    }

    public var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                // Thumbnail
                thumbnailArea

                // Content
                VStack(alignment: .leading, spacing: WaiAgentsSpacing.space2) {
                    // Title
                    Text(item.title ?? "Untitled")
                        .font(WaiAgentsTypography.textLg)
                        .foregroundStyle(textPrimary)
                        .lineLimit(2)

                    // Description
                    if let description = item.description {
                        Text(description)
                            .font(WaiAgentsTypography.bodySmall)
                            .foregroundStyle(textSecondary)
                            .lineLimit(2)
                    }

                    // Author + stats
                    HStack(spacing: WaiAgentsSpacing.space2) {
                        AvatarView(name: authorName, size: 20)

                        Text(authorName)
                            .font(WaiAgentsTypography.bodySmall)
                            .foregroundStyle(textSecondary)

                        Spacer()

                        // Like button
                        Button {
                            performLikeAnimation()
                            onLike()
                        } label: {
                            HStack(spacing: WaiAgentsSpacing.space1) {
                                Image(systemName: isLiked ? "heart.fill" : "heart")
                                    .font(.system(size: 12))
                                    .foregroundStyle(isLiked ? WaiAgentsColors.Semantic.error : textTertiary)
                                    .scaleEffect(likeScale)
                                Text("\(item.likeCount)")
                                    .font(WaiAgentsTypography.caption)
                                    .foregroundStyle(textTertiary)
                            }
                        }
                        .buttonStyle(.plain)

                        // Fork count
                        HStack(spacing: WaiAgentsSpacing.space1) {
                            Image(systemName: "arrow.triangle.branch")
                                .font(.system(size: 11))
                                .foregroundStyle(textTertiary)
                            Text("\(item.forkCount)")
                                .font(WaiAgentsTypography.caption)
                                .foregroundStyle(textTertiary)
                        }
                    }
                }
                .padding(WaiAgentsSpacing.space3)
            }
            .background(bgSecondary)
            .clipShape(RoundedRectangle(cornerRadius: WaiAgentsRadius.xl))
            .overlay {
                RoundedRectangle(cornerRadius: WaiAgentsRadius.xl)
                    .strokeBorder(borderPrimary, lineWidth: 1)
            }
            .raccoonShadow(WaiAgentsShadows.sm)
        }
        .buttonStyle(.plain)
    }

    private var thumbnailArea: some View {
        Group {
            if item.thumbnailURL != nil {
                // Placeholder for actual image loading (Kingfisher)
                Rectangle()
                    .fill(bgTertiary)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay {
                        Image(systemName: "photo")
                            .font(.system(size: 24))
                            .foregroundStyle(textTertiary)
                    }
            } else {
                // Type-based placeholder
                Rectangle()
                    .fill(bgTertiary)
                    .aspectRatio(16 / 9, contentMode: .fit)
                    .overlay {
                        VStack(spacing: WaiAgentsSpacing.space2) {
                            Image(systemName: iconForType(item.type))
                                .font(.system(size: 28))
                                .foregroundStyle(WaiAgentsColors.accentPrimary.opacity(0.6))
                            Text(item.type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(WaiAgentsTypography.caption)
                                .foregroundStyle(textTertiary)
                        }
                    }
            }
        }
        .clipShape(UnevenRoundedRectangle(
            topLeadingRadius: WaiAgentsRadius.xl,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: WaiAgentsRadius.xl
        ))
    }

    private func performLikeAnimation() {
        guard !reduceMotion else { return }
        withAnimation(WaiAgentsMotion.spring) {
            likeScale = 1.3
        }
        Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(WaiAgentsMotion.spring) {
                likeScale = 1.0
            }
        }
    }

    private func iconForType(_ type: FeedItem.FeedItemType) -> String {
        switch type {
        case .agentShowcase: return "cpu"
        case .pageShowcase: return "globe"
        case .toolShowcase: return "wrench.and.screwdriver"
        case .remix: return "arrow.triangle.branch"
        case .creation: return "sparkles"
        }
    }

    private var bgSecondary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.bgSecondary : WaiAgentsColors.Light.bgSecondary
    }

    private var bgTertiary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.bgTertiary : WaiAgentsColors.Light.bgTertiary
    }

    private var textPrimary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.textPrimary : WaiAgentsColors.Light.textPrimary
    }

    private var textSecondary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.textSecondary : WaiAgentsColors.Light.textSecondary
    }

    private var textTertiary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.textTertiary : WaiAgentsColors.Light.textTertiary
    }

    private var borderPrimary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.borderPrimary : WaiAgentsColors.Light.borderPrimary
    }
}
