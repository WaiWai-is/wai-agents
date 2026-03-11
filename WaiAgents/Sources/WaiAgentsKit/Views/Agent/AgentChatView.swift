import SwiftUI

/// Extends ConversationDetailView for agent conversations.
/// Shows agent status indicator (streaming, thinking, tool use),
/// tool approval cards, and token-by-token streaming text.
public struct AgentChatView: View {
    public let conversationID: String
    public let agentName: String

    @Environment(AppState.self) private var appState
    @State private var viewModel: ConversationDetailViewModel?
    @State private var showScrollToBottom = false
    @State private var agentStatus: String = ""
    @State private var isAgentStreaming = false
    @State private var streamingText = ""
    @State private var pendingApproval: PendingApproval?
    @State private var toolExecutions: [ToolExecutionLog.ToolExecution] = []
    @State private var showToolLog = false
    @State private var streamingResetTask: Task<Void, Never>?

    @Environment(\.colorScheme) private var colorScheme

    private struct PendingApproval: Sendable {
        let requestID: String
        let toolName: String
        let description: String
        let parametersPreview: String
    }

    public init(conversationID: String, agentName: String) {
        self.conversationID = conversationID
        self.agentName = agentName
    }

    public var body: some View {
        VStack(spacing: 0) {
            #if os(macOS)
            // macOS header bar
            HStack(spacing: WaiAgentsSpacing.space2) {
                AvatarView(name: agentName, size: 24, isAgent: true)
                Text(agentName)
                    .font(WaiAgentsTypography.textLg)
                    .fontWeight(.semibold)
                    .foregroundStyle(textPrimary)
                Spacer()
            }
            .padding(.horizontal, WaiAgentsSpacing.space4)
            .padding(.vertical, WaiAgentsSpacing.space3)
            Divider()
                .foregroundStyle(borderPrimary)
            #endif

            if appState.currentUserID == nil {
                VStack(spacing: WaiAgentsSpacing.space3) {
                    Image(systemName: "person.crop.circle.badge.exclamationmark")
                        .font(.system(size: 36))
                        .foregroundStyle(WaiAgentsColors.Semantic.error)
                    Text("Please log in to use the agent.")
                        .font(WaiAgentsTypography.textSm)
                        .foregroundStyle(textPrimary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let viewModel {
                // Messages area
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(viewModel.groupedMessages) { group in
                                if group.showDateSeparator {
                                    DateSeparatorView(date: group.date)
                                }

                                ForEach(group.messages) { message in
                                    messageBubble(
                                        message: message,
                                        group: group
                                    )
                                    .id(message.id)
                                }
                            }

                            // Streaming response
                            if isAgentStreaming, !streamingText.isEmpty {
                                HStack(alignment: .top, spacing: WaiAgentsSpacing.space2) {
                                    AvatarView(
                                        name: agentName,
                                        size: 28,
                                        isAgent: true
                                    )
                                    StreamingTextView(text: streamingText, isStreaming: true)
                                        .padding(.vertical, 10)
                                        .padding(.horizontal, 14)
                                        .background(bgMessageReceived)
                                        .clipShape(RoundedRectangle(cornerRadius: WaiAgentsRadius.xl))
                                        .overlay {
                                            RoundedRectangle(cornerRadius: WaiAgentsRadius.xl)
                                                .strokeBorder(borderPrimary, lineWidth: 1)
                                        }
                                        .frame(maxWidth: 520, alignment: .leading)
                                    Spacer(minLength: 0)
                                }
                                .padding(.horizontal, WaiAgentsSpacing.space4)
                                .padding(.top, WaiAgentsSpacing.space2)
                            }

                            // Tool approval card
                            if let approval = pendingApproval {
                                ToolApprovalCard(
                                    toolName: approval.toolName,
                                    toolDescription: approval.description,
                                    parametersPreview: approval.parametersPreview,
                                    onDecision: { scope in
                                        appState.webSocketClient?.sendApprovalDecision(
                                            conversationID: conversationID,
                                            requestID: approval.requestID,
                                            decision: "approve",
                                            scope: scope.rawValue
                                        )
                                        pendingApproval = nil
                                    }
                                )
                                .padding(.horizontal, WaiAgentsSpacing.space4)
                                .padding(.top, WaiAgentsSpacing.space3)
                                .transition(.opacity.combined(with: .move(edge: .bottom)))
                            }

                            // Agent status
                            if !agentStatus.isEmpty {
                                AgentStatusView(statusText: agentStatus, isActive: isAgentStreaming)
                                    .padding(.horizontal, WaiAgentsSpacing.space4)
                                    .padding(.top, WaiAgentsSpacing.space2)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(.vertical, WaiAgentsSpacing.space2)
                    }
                    .onChange(of: viewModel.messages.count) {
                        if !showScrollToBottom {
                            withAnimation(WaiAgentsMotion.easeOut) {
                                proxy.scrollTo(viewModel.messages.last?.id, anchor: .bottom)
                            }
                        }
                    }
                    .overlay(alignment: .bottom) {
                        if showScrollToBottom {
                            ScrollToBottomPill {
                                withAnimation(WaiAgentsMotion.easeOut) {
                                    proxy.scrollTo(viewModel.messages.last?.id, anchor: .bottom)
                                    showScrollToBottom = false
                                }
                            }
                            .padding(.bottom, WaiAgentsSpacing.space4)
                            .transition(.opacity.combined(with: .move(edge: .bottom)))
                        }
                    }
                }

                // Tool execution log
                if showToolLog, !toolExecutions.isEmpty {
                    ToolExecutionLog(executions: toolExecutions)
                        .padding(.horizontal, WaiAgentsSpacing.space3)
                        .padding(.bottom, WaiAgentsSpacing.space2)
                        .transition(.opacity.combined(with: .move(edge: .bottom)))
                }

                // Error display
                if let error = viewModel.error {
                    VStack(spacing: WaiAgentsSpacing.space3) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(WaiAgentsColors.Semantic.error)
                        Text(error)
                            .font(WaiAgentsTypography.textSm)
                            .foregroundStyle(textPrimary)
                    }
                    .padding(WaiAgentsSpacing.space3)
                }

                Divider()
                    .foregroundStyle(borderPrimary)

                // Input bar with tool log toggle
                HStack(spacing: 0) {
                    InputBarView(
                        onSend: { content in
                            viewModel.sendMessage(content: content, expectAgentReply: true)
                        },
                        isAgentGenerating: isAgentStreaming || viewModel.isAgentGenerating
                    )

                    if !toolExecutions.isEmpty {
                        Button {
                            withAnimation(WaiAgentsMotion.easeDefault) {
                                showToolLog.toggle()
                            }
                        } label: {
                            Image(systemName: "terminal")
                                .font(.system(size: 14))
                                .foregroundStyle(textSecondary)
                                .frame(width: 32, height: 32)
                        }
                        .buttonStyle(.plain)
                        .padding(.trailing, WaiAgentsSpacing.space2)
                    }
                }
            } else {
                LoadingView()
                    .frame(maxHeight: .infinity)
            }
        }
        .background(bgPrimary)
        .onChange(of: streamingText) {
            guard isAgentStreaming else { return }
            streamingResetTask?.cancel()
            streamingResetTask = Task {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                guard !Task.isCancelled else { return }
                isAgentStreaming = false
                agentStatus = ""
            }
        }
        .task {
            guard let currentUserID = appState.currentUserID else { return }
            // Register handlers FIRST to avoid missing early events
            subscribeToAgentEvents()
            appState.webSocketClient?.joinAgentChannel(conversationID: conversationID)

            if viewModel == nil {
                let vm = ConversationDetailViewModel(
                    conversationID: conversationID,
                    apiClient: appState.apiClient,
                    currentUserID: currentUserID,
                    webSocketClient: appState.webSocketClient
                )
                viewModel = vm
                await vm.loadMessages()
                vm.subscribeToChannel()
            }
        }
        .onDisappear {
            viewModel?.unsubscribeFromChannel()
            cleanupAgentChannel()
        }
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: WaiAgentsSpacing.space2) {
                    AvatarView(name: agentName, size: 24, isAgent: true)
                    Text(agentName)
                        .font(WaiAgentsTypography.textLg)
                        .foregroundStyle(textPrimary)
                }
            }
        }
        #endif
    }

    @ViewBuilder
    private func messageBubble(
        message: Message,
        group: ConversationDetailViewModel.MessageGroup
    ) -> some View {
        if let currentUserID = appState.currentUserID {
            MessageBubbleView(
                message: message,
                isFirstInGroup: message.id == group.messages.first?.id,
                isLastInGroup: message.id == group.messages.last?.id,
                currentUserID: currentUserID
            )
        }
    }

    private func cleanupAgentChannel() {
        streamingResetTask?.cancel()
        streamingResetTask = nil
        let ws = appState.webSocketClient
        ws?.onToken = nil
        ws?.onStatus = nil
        ws?.onApprovalRequested = nil
        ws?.onToolCall = nil
        ws?.onToolResult = nil
        ws?.onCodeBlock = nil
        ws?.onComplete = nil
        ws?.onError = nil
        ws?.leaveAgentChannel(conversationID: conversationID)
    }

    private func subscribeToAgentEvents() {
        let ws = appState.webSocketClient

        ws?.onToken = { payload in
            if let text = payload["text"]?.stringValue {
                isAgentStreaming = true
                streamingText += text
            }
        }

        ws?.onStatus = { payload in
            if let message = payload["message"]?.stringValue {
                agentStatus = message
            }
        }

        ws?.onApprovalRequested = { payload in
            let argsString: String
            if let args = payload.argsPreview {
                let pairs = args.map { (key, val) in
                    "\(key): \(val.stringValue ?? String(describing: val))"
                }
                argsString = pairs.joined(separator: "\n")
            } else {
                argsString = ""
            }

            pendingApproval = PendingApproval(
                requestID: payload.requestID,
                toolName: payload.tool,
                description: "The agent wants to use \(payload.tool)",
                parametersPreview: argsString
            )
        }

        ws?.onToolCall = { payload in
            let argsString: String
            if let args = payload.args {
                let pairs = args.map { (key, val) in
                    "\(key): \(val.stringValue ?? String(describing: val))"
                }
                argsString = pairs.joined(separator: "\n")
            } else {
                argsString = ""
            }

            toolExecutions.append(ToolExecutionLog.ToolExecution(
                id: UUID().uuidString,
                toolName: payload.tool,
                status: .running,
                input: argsString
            ))
        }

        ws?.onToolResult = { payload in
            if let idx = toolExecutions.lastIndex(where: { $0.toolName == payload.tool }) {
                let resultString = payload.result.stringValue ?? String(describing: payload.result)
                let existing = toolExecutions[idx]
                toolExecutions[idx] = ToolExecutionLog.ToolExecution(
                    id: existing.id,
                    toolName: existing.toolName,
                    status: .completed,
                    input: existing.input,
                    output: resultString
                )
            }
        }

        ws?.onComplete = { _ in
            streamingResetTask?.cancel()
            Task {
                await viewModel?.loadMessages()
                isAgentStreaming = false
                agentStatus = ""
                streamingText = ""
            }
        }

        ws?.onError = { payload in
            isAgentStreaming = false
            agentStatus = ""
            if let message = payload["message"]?.stringValue {
                viewModel?.error = message
            }
        }
    }

    private var bgPrimary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.bgPrimary : WaiAgentsColors.Light.bgPrimary
    }

    private var bgMessageReceived: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.bgMessageReceived : WaiAgentsColors.Light.bgMessageReceived
    }

    private var borderPrimary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.borderPrimary : WaiAgentsColors.Light.borderPrimary
    }

    private var textPrimary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.textPrimary : WaiAgentsColors.Light.textPrimary
    }

    private var textSecondary: Color {
        colorScheme == .dark ? WaiAgentsColors.Dark.textSecondary : WaiAgentsColors.Light.textSecondary
    }
}
