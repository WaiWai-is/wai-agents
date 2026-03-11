import SwiftUI

/// Read-only code display with syntax highlighting (monospace font),
/// line numbers, and a copy button.
public struct CodeEditorView: View {
    public let code: String
    public let language: String
    public let fileName: String?

    @Environment(\.colorScheme) private var colorScheme
    @State private var copied = false

    public init(code: String, language: String = "", fileName: String? = nil) {
        self.code = code
        self.language = language
        self.fileName = fileName
    }

    public var body: some View {
        VStack(spacing: 0) {
            // Header bar
            HStack(spacing: WaiAgentsSpacing.space2) {
                if let fileName {
                    Image(systemName: iconForFile(fileName))
                        .font(.system(size: 12))
                        .foregroundStyle(textSecondary)
                    Text(fileName)
                        .font(WaiAgentsTypography.bodySmall)
                        .foregroundStyle(textSecondary)
                }
                if !language.isEmpty {
                    Text(language)
                        .font(WaiAgentsTypography.caption)
                        .foregroundStyle(textTertiary)
                        .padding(.horizontal, WaiAgentsSpacing.space2)
                        .padding(.vertical, 2)
                        .background(bgTertiary)
                        .clipShape(RoundedRectangle(cornerRadius: WaiAgentsRadius.sm))
                }

                Spacer()

                Button {
                    copyToClipboard()
                } label: {
                    HStack(spacing: WaiAgentsSpacing.space1) {
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 12))
                        if copied {
                            Text("Copied")
                                .font(WaiAgentsTypography.caption)
                        }
                    }
                    .foregroundStyle(copied ? WaiAgentsColors.Semantic.success : textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, WaiAgentsSpacing.space3)
            .padding(.vertical, WaiAgentsSpacing.space2)
            .background(bgSecondary)

            Divider()
                .foregroundStyle(borderPrimary)

            // Code area with line numbers
            ScrollView([.horizontal, .vertical]) {
                HStack(alignment: .top, spacing: 0) {
                    // Line numbers
                    VStack(alignment: .trailing, spacing: 0) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { index, _ in
                            Text("\(index + 1)")
                                .font(WaiAgentsTypography.codeBlock)
                                .foregroundStyle(textTertiary)
                                .frame(minWidth: 32, alignment: .trailing)
                                .padding(.trailing, WaiAgentsSpacing.space2)
                        }
                    }
                    .padding(.vertical, WaiAgentsSpacing.space2)

                    Divider()
                        .foregroundStyle(borderPrimary)

                    // Code content
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                            Text(line.isEmpty ? " " : line)
                                .font(WaiAgentsTypography.codeBlock)
                                .foregroundStyle(textPrimary)
                                .textSelection(.enabled)
                        }
                    }
                    .padding(.horizontal, WaiAgentsSpacing.space3)
                    .padding(.vertical, WaiAgentsSpacing.space2)
                }
            }
            .background(bgPrimary)
        }
        .clipShape(RoundedRectangle(cornerRadius: WaiAgentsRadius.lg))
        .overlay {
            RoundedRectangle(cornerRadius: WaiAgentsRadius.lg)
                .strokeBorder(borderPrimary, lineWidth: 1)
        }
    }

    private var lines: [String] {
        code.components(separatedBy: "\n")
    }

    private func copyToClipboard() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(code, forType: .string)
        #else
        UIPasteboard.general.string = code
        #endif

        withAnimation(WaiAgentsMotion.easeDefault) {
            copied = true
        }

        Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(WaiAgentsMotion.easeDefault) {
                copied = false
            }
        }
    }

    private func iconForFile(_ name: String) -> String {
        let ext = (name as NSString).pathExtension.lowercased()
        switch ext {
        case "swift": return "swift"
        case "js", "jsx", "ts", "tsx": return "doc.text"
        case "html", "htm": return "globe"
        case "css": return "paintpalette"
        case "json": return "curlybraces"
        case "py": return "doc.text"
        default: return "doc"
        }
    }

    private var bgPrimary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.bgPrimary : WaiAgentsColors.Light.bgPrimary
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
