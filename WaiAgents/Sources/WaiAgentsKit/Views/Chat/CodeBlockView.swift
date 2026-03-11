import SwiftUI

/// Code block display: bg-secondary background, 12px padding, 8px border-radius,
/// left border 2px accent-primary, copy button top-right.
public struct CodeBlockView: View {
    public let code: String
    public let language: String?

    @Environment(\.colorScheme) private var colorScheme
    @State private var copied = false

    public init(code: String, language: String? = nil) {
        self.code = code
        self.language = language
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header with language label and copy button
            if language != nil {
                HStack {
                    if let language {
                        Text(language)
                            .font(WaiAgentsTypography.textXs)
                            .foregroundStyle(textTertiary)
                    }
                    Spacer()
                    Button {
                        copyToClipboard()
                    } label: {
                        HStack(spacing: WaiAgentsSpacing.space1) {
                            Image(systemName: copied ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 11))
                            Text(copied ? "Copied" : "Copy")
                                .font(WaiAgentsTypography.textXs)
                        }
                        .foregroundStyle(textTertiary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, WaiAgentsSpacing.space3)
                .padding(.top, WaiAgentsSpacing.space2)
                .padding(.bottom, WaiAgentsSpacing.space1)
            }

            // Code content
            ScrollView(.horizontal, showsIndicators: false) {
                Text(code)
                    .font(WaiAgentsTypography.codeBlock)
                    .foregroundStyle(textPrimary)
                    .textSelection(.enabled)
            }
            .padding(.horizontal, WaiAgentsSpacing.space3)
            .padding(.bottom, WaiAgentsSpacing.space3)
        }
        .background(bgSecondary)
        .overlay(alignment: .leading) {
            Rectangle()
                .fill(WaiAgentsColors.accentPrimary)
                .frame(width: 2)
        }
        .clipShape(RoundedRectangle(cornerRadius: WaiAgentsRadius.lg))
    }

    private func copyToClipboard() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(code, forType: .string)
        #else
        UIPasteboard.general.string = code
        #endif
        copied = true
        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled else { return }
            copied = false
        }
    }

    private var bgSecondary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.bgSecondary : WaiAgentsColors.Light.bgSecondary
    }

    private var textPrimary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.textPrimary : WaiAgentsColors.Light.textPrimary
    }

    private var textTertiary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.textTertiary : WaiAgentsColors.Light.textTertiary
    }
}
