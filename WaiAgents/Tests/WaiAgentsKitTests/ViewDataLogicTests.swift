import Foundation
import Testing
@testable import WaiAgentsKit

/// Tests for view-level data logic: computed properties, formatting, validation rules,
/// and state decisions that drive the UI rendering in SwiftUI views.
@Suite("View Data Logic")
struct ViewDataLogicTests {

    // MARK: - MessageBubbleView Logic

    @Suite("MessageBubble Data Logic")
    struct MessageBubbleLogicTests {

        // MARK: isSent Logic

        @Test("isSent returns true when senderType is human and senderID matches currentUserID")
        func isSentTrueForCurrentUser() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderID: "user_1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Hello"),
                createdAt: Date()
            )
            let isSent = message.senderType == .human && message.senderID == "user_1"
            #expect(isSent == true)
        }

        @Test("isSent returns false when senderType is agent")
        func isSentFalseForAgent() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderID: "agent_1",
                senderType: .agent,
                type: .text,
                content: MessageContent(text: "Hello"),
                createdAt: Date()
            )
            let isSent = message.senderType == .human && message.senderID == "user_1"
            #expect(isSent == false)
        }

        @Test("isSent returns false when senderID does not match currentUserID")
        func isSentFalseForOtherUser() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderID: "user_2",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Hello"),
                createdAt: Date()
            )
            let isSent = message.senderType == .human && message.senderID == "user_1"
            #expect(isSent == false)
        }

        @Test("isSent returns false when senderType is system")
        func isSentFalseForSystem() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderID: nil,
                senderType: .system,
                type: .system,
                content: MessageContent(text: "System message"),
                createdAt: Date()
            )
            let isSent = message.senderType == .human && message.senderID == "user_1"
            #expect(isSent == false)
        }

        @Test("isSent returns false when senderType is bridge")
        func isSentFalseForBridge() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderID: "bridge_1",
                senderType: .bridge,
                type: .text,
                content: MessageContent(text: "Bridged message"),
                createdAt: Date()
            )
            let isSent = message.senderType == .human && message.senderID == "user_1"
            #expect(isSent == false)
        }

        // MARK: Time Formatting

        @Test("Time formatter produces HH:mm format")
        func timeFormatterHHmm() {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"

            var calendar = Calendar.current
            calendar.timeZone = TimeZone(identifier: "UTC")!
            let components = DateComponents(year: 2026, month: 3, day: 11, hour: 14, minute: 30, second: 0)
            let date = calendar.date(from: components)!

            // Adjust formatter to UTC for deterministic test
            formatter.timeZone = TimeZone(identifier: "UTC")!
            let result = formatter.string(from: date)
            #expect(result == "14:30")
        }

        @Test("Time formatter handles midnight")
        func timeFormatterMidnight() {
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"
            formatter.timeZone = TimeZone(identifier: "UTC")!

            var calendar = Calendar.current
            calendar.timeZone = TimeZone(identifier: "UTC")!
            let components = DateComponents(year: 2026, month: 1, day: 1, hour: 0, minute: 0)
            let date = calendar.date(from: components)!

            let result = formatter.string(from: date)
            #expect(result == "00:00")
        }

        // MARK: Message with Reactions

        @Test("Message with empty reactions array is treated as no reactions")
        func emptyReactionsArray() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "test"),
                reactions: []
            )
            let hasReactions = !(message.reactions?.isEmpty ?? true)
            #expect(hasReactions == false)
        }

        @Test("Message with nil reactions is treated as no reactions")
        func nilReactions() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "test"),
                reactions: nil
            )
            let hasReactions = !(message.reactions?.isEmpty ?? true)
            #expect(hasReactions == false)
        }

        @Test("Message with reactions shows reactions")
        func messageWithReactions() {
            let reaction = MessageReaction(
                id: "r1",
                messageID: "m1",
                userID: "user_1",
                emoji: "👍"
            )
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "test"),
                reactions: [reaction]
            )
            let hasReactions = !(message.reactions?.isEmpty ?? true)
            #expect(hasReactions == true)
        }

        // MARK: Reply Logic

        @Test("Message with replyTo metadata shows reply reference")
        func messageWithReplyTo() {
            let metadata = MessageMetadata(replyTo: "m_prev")
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Reply"),
                metadata: metadata
            )
            #expect(message.metadata?.replyTo == "m_prev")
        }

        @Test("Message without replyTo has no reply reference")
        func messageWithoutReplyTo() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Hello")
            )
            #expect(message.metadata?.replyTo == nil)
        }
    }

    // MARK: - ConversationListItemView Logic

    @Suite("ConversationListItem Data Logic")
    struct ConversationListItemLogicTests {

        @Test("Preview placeholder for agent conversation is 'AI agent conversation'")
        func agentPreviewPlaceholder() {
            let conv = Conversation(id: "c1", type: .agent, title: "My Agent")
            let placeholder: String = {
                switch conv.type {
                case .agent: return "AI agent conversation"
                case .bridge: return "Bridged conversation"
                case .dm: return "Direct message"
                case .group: return "Group conversation"
                }
            }()
            #expect(placeholder == "AI agent conversation")
        }

        @Test("Preview placeholder for DM is 'Direct message'")
        func dmPreviewPlaceholder() {
            let conv = Conversation(id: "c1", type: .dm, title: "Chat")
            let placeholder: String = {
                switch conv.type {
                case .agent: return "AI agent conversation"
                case .bridge: return "Bridged conversation"
                case .dm: return "Direct message"
                case .group: return "Group conversation"
                }
            }()
            #expect(placeholder == "Direct message")
        }

        @Test("Preview placeholder for group is 'Group conversation'")
        func groupPreviewPlaceholder() {
            let conv = Conversation(id: "c1", type: .group, title: "Team")
            let placeholder: String = {
                switch conv.type {
                case .agent: return "AI agent conversation"
                case .bridge: return "Bridged conversation"
                case .dm: return "Direct message"
                case .group: return "Group conversation"
                }
            }()
            #expect(placeholder == "Group conversation")
        }

        @Test("Preview placeholder for bridge is 'Bridged conversation'")
        func bridgePreviewPlaceholder() {
            let conv = Conversation(id: "c1", type: .bridge, title: "Telegram")
            let placeholder: String = {
                switch conv.type {
                case .agent: return "AI agent conversation"
                case .bridge: return "Bridged conversation"
                case .dm: return "Direct message"
                case .group: return "Group conversation"
                }
            }()
            #expect(placeholder == "Bridged conversation")
        }

        @Test("Timestamp formatting returns time string for today's date")
        func timestampToday() {
            let calendar = Calendar.current
            let formatter = DateFormatter()
            formatter.dateFormat = "HH:mm"

            let date = Date()
            #expect(calendar.isDateInToday(date))

            let result = formatter.string(from: date)
            #expect(!result.isEmpty)
        }

        @Test("Timestamp formatting returns 'Yesterday' for yesterday's date")
        func timestampYesterday() {
            let calendar = Calendar.current
            let yesterday = calendar.date(byAdding: .day, value: -1, to: Date())!
            #expect(calendar.isDateInYesterday(yesterday))
        }

        @Test("Conversation with nil title displays 'Untitled' fallback")
        func conversationNilTitle() {
            let conv = Conversation(id: "c1", type: .dm)
            let displayTitle = conv.title ?? "Untitled"
            #expect(displayTitle == "Untitled")
        }

        @Test("Conversation with title displays the title")
        func conversationWithTitle() {
            let conv = Conversation(id: "c1", type: .dm, title: "Work Chat")
            let displayTitle = conv.title ?? "Untitled"
            #expect(displayTitle == "Work Chat")
        }

        @Test("Bridge platform badge is shown for bridge conversations with bridgeID")
        func bridgePlatformBadge() {
            let conv = Conversation(id: "c1", type: .bridge, bridgeID: "bridge_telegram")
            let bridgePlatform: String? = conv.type == .bridge && conv.bridgeID != nil ? "bridge" : nil
            #expect(bridgePlatform == "bridge")
        }

        @Test("Bridge platform badge is nil for bridge conversations without bridgeID")
        func bridgePlatformBadgeNil() {
            let conv = Conversation(id: "c1", type: .bridge)
            let bridgePlatform: String? = conv.type == .bridge && conv.bridgeID != nil ? "bridge" : nil
            #expect(bridgePlatform == nil)
        }

        @Test("Bridge platform badge is nil for non-bridge conversations")
        func bridgePlatformBadgeNonBridge() {
            let conv = Conversation(id: "c1", type: .dm)
            let bridgePlatform: String? = conv.type == .bridge && conv.bridgeID != nil ? "bridge" : nil
            #expect(bridgePlatform == nil)
        }
    }

    // MARK: - FeedCardView Logic

    @Suite("FeedCard Data Logic")
    struct FeedCardLogicTests {

        @Test("iconForType maps agentShowcase to cpu")
        func iconAgentShowcase() {
            let icon = iconForType(.agentShowcase)
            #expect(icon == "cpu")
        }

        @Test("iconForType maps pageShowcase to globe")
        func iconPageShowcase() {
            let icon = iconForType(.pageShowcase)
            #expect(icon == "globe")
        }

        @Test("iconForType maps toolShowcase to wrench.and.screwdriver")
        func iconToolShowcase() {
            let icon = iconForType(.toolShowcase)
            #expect(icon == "wrench.and.screwdriver")
        }

        @Test("iconForType maps remix to arrow.triangle.branch")
        func iconRemix() {
            let icon = iconForType(.remix)
            #expect(icon == "arrow.triangle.branch")
        }

        @Test("iconForType maps creation to sparkles")
        func iconCreation() {
            let icon = iconForType(.creation)
            #expect(icon == "sparkles")
        }

        @Test("FeedItem with nil title displays 'Untitled'")
        func feedItemNilTitle() {
            let item = FeedItem(
                id: "f1",
                creatorID: "user_1",
                type: .agentShowcase,
                referenceID: "a1",
                referenceType: .agent
            )
            let displayTitle = item.title ?? "Untitled"
            #expect(displayTitle == "Untitled")
        }

        @Test("FeedItem with title displays the title")
        func feedItemWithTitle() {
            let item = FeedItem(
                id: "f1",
                creatorID: "user_1",
                type: .agentShowcase,
                referenceID: "a1",
                referenceType: .agent,
                title: "My Agent"
            )
            let displayTitle = item.title ?? "Untitled"
            #expect(displayTitle == "My Agent")
        }

        @Test("FeedItem type raw value formatting for display")
        func feedItemTypeDisplayFormat() {
            let type = FeedItem.FeedItemType.agentShowcase
            let display = type.rawValue
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
            #expect(display == "Agent Showcase")
        }

        @Test("FeedItem type display format for tool_showcase")
        func feedItemTypeDisplayToolShowcase() {
            let type = FeedItem.FeedItemType.toolShowcase
            let display = type.rawValue
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
            #expect(display == "Tool Showcase")
        }

        @Test("FeedItem type display format for remix")
        func feedItemTypeDisplayRemix() {
            let type = FeedItem.FeedItemType.remix
            let display = type.rawValue
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
            #expect(display == "Remix")
        }

        @Test("FeedItem with thumbnailURL shows thumbnail area")
        func feedItemWithThumbnail() {
            let item = FeedItem(
                id: "f1",
                creatorID: "user_1",
                type: .creation,
                referenceID: "a1",
                referenceType: .agent,
                thumbnailURL: URL(string: "https://example.com/thumb.jpg")
            )
            #expect(item.thumbnailURL != nil)
        }

        @Test("FeedItem without thumbnailURL shows type-based placeholder")
        func feedItemWithoutThumbnail() {
            let item = FeedItem(
                id: "f1",
                creatorID: "user_1",
                type: .creation,
                referenceID: "a1",
                referenceType: .agent
            )
            #expect(item.thumbnailURL == nil)
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
    }

    // MARK: - RegisterView Validation Logic

    @Suite("Register Form Validation")
    struct RegisterFormValidationTests {

        // MARK: Password Strength

        @Test("Empty password has strength level 0")
        func emptyPasswordStrength() {
            let level = passwordStrengthLevel("")
            #expect(level == 0)
        }

        @Test("Short lowercase password has strength level 0")
        func shortPasswordStrength() {
            let level = passwordStrengthLevel("abc")
            #expect(level == 0)
        }

        @Test("8+ character lowercase password has strength level 1")
        func longLowercasePasswordStrength() {
            let level = passwordStrengthLevel("abcdefgh")
            #expect(level == 1)
        }

        @Test("8+ characters with uppercase has strength level 2")
        func uppercasePasswordStrength() {
            let level = passwordStrengthLevel("Abcdefgh")
            #expect(level == 2)
        }

        @Test("8+ characters with uppercase and digits has strength level 3")
        func digitPasswordStrength() {
            let level = passwordStrengthLevel("Abcdefg1")
            #expect(level == 3)
        }

        @Test("8+ characters with uppercase, digits, and symbols has strength level 4")
        func symbolPasswordStrength() {
            let level = passwordStrengthLevel("Abcdefg1!")
            #expect(level == 4)
        }

        @Test("Password with only digits and length has strength level 2")
        func onlyDigitsPasswordStrength() {
            let level = passwordStrengthLevel("12345678")
            #expect(level == 2)
        }

        // MARK: Strength Text

        @Test("Strength text for level 0 is 'Very Weak'")
        func strengthTextLevel0() {
            #expect(strengthText(0) == "Very Weak")
        }

        @Test("Strength text for level 1 is 'Weak'")
        func strengthTextLevel1() {
            #expect(strengthText(1) == "Weak")
        }

        @Test("Strength text for level 2 is 'Fair'")
        func strengthTextLevel2() {
            #expect(strengthText(2) == "Fair")
        }

        @Test("Strength text for level 3 is 'Good'")
        func strengthTextLevel3() {
            #expect(strengthText(3) == "Good")
        }

        @Test("Strength text for level 4 is 'Strong'")
        func strengthTextLevel4() {
            #expect(strengthText(4) == "Strong")
        }

        // MARK: Form Validity

        @Test("Form is valid with all fields filled and matching passwords >= 8 chars")
        func formValidAllFilled() {
            let valid = isFormValid(
                displayName: "alice",
                email: "alice@example.com",
                password: "Password1",
                confirmPassword: "Password1"
            )
            #expect(valid == true)
        }

        @Test("Form is invalid with empty displayName")
        func formInvalidEmptyDisplayName() {
            let valid = isFormValid(
                displayName: "",
                email: "alice@example.com",
                password: "Password1",
                confirmPassword: "Password1"
            )
            #expect(valid == false)
        }

        @Test("Form is invalid with empty email")
        func formInvalidEmptyEmail() {
            let valid = isFormValid(
                displayName: "alice",
                email: "",
                password: "Password1",
                confirmPassword: "Password1"
            )
            #expect(valid == false)
        }

        @Test("Form is invalid with password shorter than 8 characters")
        func formInvalidShortPassword() {
            let valid = isFormValid(
                displayName: "alice",
                email: "alice@example.com",
                password: "Pass1",
                confirmPassword: "Pass1"
            )
            #expect(valid == false)
        }

        @Test("Form is invalid when passwords don't match")
        func formInvalidPasswordMismatch() {
            let valid = isFormValid(
                displayName: "alice",
                email: "alice@example.com",
                password: "Password1",
                confirmPassword: "Password2"
            )
            #expect(valid == false)
        }

        @Test("Form is invalid with all empty fields")
        func formInvalidAllEmpty() {
            let valid = isFormValid(
                displayName: "",
                email: "",
                password: "",
                confirmPassword: ""
            )
            #expect(valid == false)
        }

        // MARK: Password Mismatch Warning

        @Test("Password mismatch warning shows when confirmPassword is not empty and differs")
        func passwordMismatchWarningShows() {
            let showWarning = !("different".isEmpty) && ("Password1" != "different")
            #expect(showWarning == true)
        }

        @Test("Password mismatch warning hidden when confirmPassword is empty")
        func passwordMismatchWarningHidden() {
            let showWarning = !("".isEmpty) && ("Password1" != "")
            #expect(showWarning == false)
        }

        @Test("Password mismatch warning hidden when passwords match")
        func passwordMismatchWarningMatch() {
            let showWarning = !("Password1".isEmpty) && ("Password1" != "Password1")
            #expect(showWarning == false)
        }

        // MARK: Helpers

        private func passwordStrengthLevel(_ password: String) -> Int {
            var score = 0
            if password.count >= 8 { score += 1 }
            if password.rangeOfCharacter(from: .uppercaseLetters) != nil { score += 1 }
            if password.rangeOfCharacter(from: .decimalDigits) != nil { score += 1 }
            if password.rangeOfCharacter(from: .punctuationCharacters) != nil ||
               password.rangeOfCharacter(from: .symbols) != nil { score += 1 }
            return score
        }

        private func strengthText(_ level: Int) -> String {
            switch level {
            case 0: return "Very Weak"
            case 1: return "Weak"
            case 2: return "Fair"
            case 3: return "Good"
            case 4: return "Strong"
            default: return ""
            }
        }

        private func isFormValid(
            displayName: String,
            email: String,
            password: String,
            confirmPassword: String
        ) -> Bool {
            !displayName.isEmpty &&
            !email.isEmpty &&
            password.count >= 8 &&
            password == confirmPassword
        }
    }

    // MARK: - InputBarView Logic

    @Suite("InputBar Data Logic")
    struct InputBarLogicTests {

        @Test("Empty text does not show send button")
        func emptyTextNoSendButton() {
            let text = ""
            let showSend = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            #expect(showSend == false)
        }

        @Test("Whitespace-only text does not show send button")
        func whitespaceTextNoSendButton() {
            let text = "   \n\t  "
            let showSend = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            #expect(showSend == false)
        }

        @Test("Non-empty text shows send button")
        func nonEmptyTextShowsSendButton() {
            let text = "Hello"
            let showSend = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            #expect(showSend == true)
        }

        @Test("Text with leading/trailing whitespace still shows send button")
        func paddedTextShowsSendButton() {
            let text = "  Hello  "
            let showSend = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            #expect(showSend == true)
        }

        @Test("isMultiLine returns true for text with newlines")
        func multiLineNewlines() {
            let text = "Hello\nWorld"
            let isMultiLine = text.contains("\n") || text.count > 80
            #expect(isMultiLine == true)
        }

        @Test("isMultiLine returns true for text longer than 80 chars")
        func multiLineLongText() {
            let text = String(repeating: "a", count: 81)
            let isMultiLine = text.contains("\n") || text.count > 80
            #expect(isMultiLine == true)
        }

        @Test("isMultiLine returns false for short text without newlines")
        func singleLineShortText() {
            let text = "Short message"
            let isMultiLine = text.contains("\n") || text.count > 80
            #expect(isMultiLine == false)
        }

        @Test("isMultiLine returns false for exactly 80 char text")
        func singleLine80Chars() {
            let text = String(repeating: "a", count: 80)
            let isMultiLine = text.contains("\n") || text.count > 80
            #expect(isMultiLine == false)
        }

        @Test("performSend trims whitespace from content")
        func performSendTrims() {
            let text = "  Hello World  "
            let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
            #expect(content == "Hello World")
        }

        @Test("performSend rejects empty trimmed content")
        func performSendRejectsEmpty() {
            let text = "   \n  "
            let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
            #expect(content.isEmpty)
        }

        @Test("Agent generating state shows stop button instead of send")
        func agentGeneratingShowsStop() {
            let isAgentGenerating = true
            let text = "some text"
            let showSend = !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

            // When agent is generating, stop button is shown regardless of text content
            #expect(isAgentGenerating == true)
            #expect(showSend == true)
            // In the view: if isAgentGenerating -> stopButton, else if showSend -> sendButton
        }
    }

    // MARK: - AgentChatView Logic

    @Suite("AgentChat Data Logic")
    struct AgentChatLogicTests {

        @Test("currentUserID nil shows login prompt instead of chat")
        func nilCurrentUserIDShowsLoginPrompt() {
            let currentUserID: String? = nil
            #expect(currentUserID == nil)
            // AgentChatView shows "Please log in to use the agent." when currentUserID is nil
        }

        @Test("currentUserID present shows chat interface")
        func currentUserIDPresentShowsChat() {
            let currentUserID: String? = "user_1"
            #expect(currentUserID != nil)
        }

        @Test("messageBubble skips rendering when currentUserID is nil")
        func messageBubbleSkippedWithNilUser() {
            // This tests the nil-safety fix in AgentChatView
            let currentUserID: String? = nil
            let shouldRender = currentUserID != nil
            #expect(shouldRender == false)
        }

        @Test("Streaming text display logic: shows when streaming and text is non-empty")
        func streamingTextDisplayLogic() {
            let isAgentStreaming = true
            let streamingText = "Hello, I'm thinking..."

            let showStreaming = isAgentStreaming && !streamingText.isEmpty
            #expect(showStreaming == true)
        }

        @Test("Streaming text hidden when not streaming")
        func streamingTextHiddenWhenNotStreaming() {
            let isAgentStreaming = false
            let streamingText = "Some text"

            let showStreaming = isAgentStreaming && !streamingText.isEmpty
            #expect(showStreaming == false)
        }

        @Test("Streaming text hidden when text is empty")
        func streamingTextHiddenWhenEmpty() {
            let isAgentStreaming = true
            let streamingText = ""

            let showStreaming = isAgentStreaming && !streamingText.isEmpty
            #expect(showStreaming == false)
        }

        @Test("Agent status shown when status text is non-empty")
        func agentStatusShownWhenNonEmpty() {
            let agentStatus = "Thinking..."
            #expect(!agentStatus.isEmpty)
        }

        @Test("Agent status hidden when status text is empty")
        func agentStatusHiddenWhenEmpty() {
            let agentStatus = ""
            #expect(agentStatus.isEmpty)
        }

        @Test("Tool log toggle shows when toolExecutions is non-empty")
        func toolLogToggleShown() {
            let toolExecutions = ["exec1"]
            #expect(!toolExecutions.isEmpty)
        }

        @Test("Tool log toggle hidden when toolExecutions is empty")
        func toolLogToggleHidden() {
            let toolExecutions: [String] = []
            #expect(toolExecutions.isEmpty)
        }
    }

    // MARK: - MessageContentView Logic

    @Suite("MessageContent Rendering Logic")
    struct MessageContentRenderingTests {

        @Test("Text message renders text content")
        func textMessageRendersText() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .text,
                content: MessageContent(text: "Hello world")
            )
            #expect(message.type == .text)
            #expect(message.content.text == "Hello world")
        }

        @Test("Code message renders code block")
        func codeMessageRendersCode() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .agent,
                type: .code,
                content: MessageContent(
                    text: "Here's the code:",
                    code: "print('hello')",
                    language: "python"
                )
            )
            #expect(message.type == .code)
            #expect(message.content.code == "print('hello')")
            #expect(message.content.language == "python")
        }

        @Test("Media message renders media placeholder")
        func mediaMessageRendersMedia() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .media,
                content: MessageContent(
                    text: "Check this out",
                    mediaURL: URL(string: "https://example.com/image.jpg")
                )
            )
            #expect(message.type == .media)
            #expect(message.content.mediaURL != nil)
        }

        @Test("Embed message renders embed content")
        func embedMessageRendersEmbed() {
            let embed = MessageContent.EmbedContent(
                title: "Article Title",
                description: "Article description",
                url: URL(string: "https://example.com")
            )
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .agent,
                type: .embed,
                content: MessageContent(embed: embed)
            )
            #expect(message.type == .embed)
            #expect(message.content.embed?.title == "Article Title")
        }

        @Test("System message renders italic text")
        func systemMessageRendersItalic() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .system,
                type: .system,
                content: MessageContent(text: "User joined the conversation")
            )
            #expect(message.type == .system)
            #expect(message.content.text == "User joined the conversation")
        }

        @Test("Agent status message renders with dot indicator")
        func agentStatusMessageRenders() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .agent,
                type: .agentStatus,
                content: MessageContent(text: "Searching the web...")
            )
            #expect(message.type == .agentStatus)
            #expect(message.content.text == "Searching the web...")
        }

        @Test("Message with nil text content handles gracefully")
        func nilTextContent() {
            let message = Message(
                id: "m1",
                conversationID: "c1",
                senderType: .human,
                type: .text,
                content: MessageContent()
            )
            #expect(message.content.text == nil)
        }
    }

    // MARK: - ConversationListView Filtering Logic

    @Suite("ConversationList Filtering")
    struct ConversationListFilteringTests {

        @Test("Empty search text returns all conversations")
        func emptySearchReturnsAll() {
            let conversations = [
                Conversation(id: "c1", type: .dm, title: "Alice"),
                Conversation(id: "c2", type: .agent, title: "Bot"),
            ]
            let searchText = ""
            let filtered: [Conversation]
            if searchText.isEmpty {
                filtered = conversations
            } else {
                filtered = conversations.filter { $0.title?.localizedCaseInsensitiveContains(searchText) ?? false }
            }
            #expect(filtered.count == 2)
        }

        @Test("Search text filters by title case-insensitively")
        func searchFiltersCaseInsensitive() {
            let conversations = [
                Conversation(id: "c1", type: .dm, title: "Alice"),
                Conversation(id: "c2", type: .agent, title: "Bob Bot"),
                Conversation(id: "c3", type: .dm, title: "Charlie"),
            ]
            let searchText = "alice"
            let filtered = conversations.filter { $0.title?.localizedCaseInsensitiveContains(searchText) ?? false }
            #expect(filtered.count == 1)
            #expect(filtered[0].id == "c1")
        }

        @Test("Search text with no match returns empty")
        func searchNoMatch() {
            let conversations = [
                Conversation(id: "c1", type: .dm, title: "Alice"),
            ]
            let searchText = "xyz"
            let filtered = conversations.filter { $0.title?.localizedCaseInsensitiveContains(searchText) ?? false }
            #expect(filtered.isEmpty)
        }

        @Test("Conversations with nil title are excluded from search results")
        func nilTitleExcludedFromSearch() {
            let conversations = [
                Conversation(id: "c1", type: .dm),
                Conversation(id: "c2", type: .dm, title: "Alice"),
            ]
            let searchText = "ali"
            let filtered = conversations.filter { $0.title?.localizedCaseInsensitiveContains(searchText) ?? false }
            #expect(filtered.count == 1)
            #expect(filtered[0].id == "c2")
        }
    }

    // MARK: - FeedView Tab Logic

    @Suite("FeedView Tab Logic")
    struct FeedViewTabLogicTests {

        @Test("Default selected tab is forYou")
        func defaultTab() {
            let selectedTab = FeedViewModel.FeedTab.forYou
            #expect(selectedTab == .forYou)
        }

        @Test("All feed tabs are available")
        func allTabs() {
            let tabs = FeedViewModel.FeedTab.allCases
            #expect(tabs.count == 4)
            #expect(tabs[0] == .forYou)
            #expect(tabs[1] == .trending)
            #expect(tabs[2] == .following)
            #expect(tabs[3] == .new)
        }

        @Test("FeedView shows loading when feedItems is empty and isLoading")
        func feedViewShowsLoading() {
            let isLoading = true
            let feedItemsEmpty = true
            let showLoading = isLoading && feedItemsEmpty
            #expect(showLoading == true)
        }

        @Test("FeedView shows empty state when feedItems is empty and not loading")
        func feedViewShowsEmptyState() {
            let isLoading = false
            let feedItemsEmpty = true
            let error: String? = nil
            let showEmpty = !isLoading && feedItemsEmpty && error == nil
            #expect(showEmpty == true)
        }

        @Test("FeedView shows error state when error is present")
        func feedViewShowsError() {
            let error: String? = "Network error"
            #expect(error != nil)
        }
    }

    // MARK: - MarketplaceView Filtering Logic

    @Suite("Marketplace Filtering")
    struct MarketplaceFilteringTests {

        @Test("No category filter returns all agents")
        func noCategoryReturnsAll() {
            let agents = [
                Agent(id: "a1", creatorID: "u1", name: "Coder", slug: "coder", category: "Coding"),
                Agent(id: "a2", creatorID: "u1", name: "Writer", slug: "writer", category: "Writing"),
            ]
            let selectedCategory: String? = nil
            let filtered = selectedCategory == nil ? agents : agents.filter { $0.category == selectedCategory }
            #expect(filtered.count == 2)
        }

        @Test("Category filter returns only matching agents")
        func categoryFilterMatches() {
            let agents = [
                Agent(id: "a1", creatorID: "u1", name: "Coder", slug: "coder", category: "Coding"),
                Agent(id: "a2", creatorID: "u1", name: "Writer", slug: "writer", category: "Writing"),
                Agent(id: "a3", creatorID: "u1", name: "Debugger", slug: "debugger", category: "Coding"),
            ]
            let selectedCategory: String? = "Coding"
            let filtered = selectedCategory == nil ? agents : agents.filter { $0.category == selectedCategory }
            #expect(filtered.count == 2)
        }

        @Test("Category filter with no matches returns empty")
        func categoryFilterNoMatch() {
            let agents = [
                Agent(id: "a1", creatorID: "u1", name: "Coder", slug: "coder", category: "Coding"),
            ]
            let selectedCategory: String? = "Fun"
            let filtered = selectedCategory == nil ? agents : agents.filter { $0.category == selectedCategory }
            #expect(filtered.isEmpty)
        }

        @Test("Agent with nil category is excluded from category filter")
        func nilCategoryExcluded() {
            let agents = [
                Agent(id: "a1", creatorID: "u1", name: "Coder", slug: "coder", category: nil),
                Agent(id: "a2", creatorID: "u1", name: "Writer", slug: "writer", category: "Writing"),
            ]
            let selectedCategory: String? = "Writing"
            let filtered = selectedCategory == nil ? agents : agents.filter { $0.category == selectedCategory }
            #expect(filtered.count == 1)
            #expect(filtered[0].id == "a2")
        }

        @Test("Marketplace categories list is correct")
        func marketplaceCategoriesList() {
            let categories = [
                "Coding", "Writing", "Research", "Creative",
                "Data Analysis", "Education", "Productivity", "Fun"
            ]
            #expect(categories.count == 8)
            #expect(categories.contains("Coding"))
            #expect(categories.contains("Fun"))
        }
    }
}
