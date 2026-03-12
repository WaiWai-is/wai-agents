import Foundation
import Testing
@testable import WaiAgentsKit

@Suite("ContentBlock Model")
struct ContentBlockModelTests {

    // MARK: - Text Content

    @Test("MessageContent text-only round-trips through JSON")
    func textOnlyRoundTrip() throws {
        let content = MessageContent(text: "Hello world")
        let data = try JSONEncoder.waiagents.encode(content)
        let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: data)
        #expect(decoded.text == "Hello world")
        #expect(decoded.code == nil)
        #expect(decoded.language == nil)
        #expect(decoded.mediaURL == nil)
        #expect(decoded.embed == nil)
    }

    @Test("MessageContent decodes text content block from API array format")
    func decodeTextContentBlock() throws {
        let json = """
        [{"type": "text", "text": "Hello from API"}]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Hello from API")
    }

    @Test("MessageContent decodes multiple text blocks by concatenating")
    func decodeMultipleTextBlocks() throws {
        let json = """
        [
            {"type": "text", "text": "Part one "},
            {"type": "text", "text": "Part two"}
        ]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Part one Part two")
    }

    // MARK: - Code Content

    @Test("MessageContent code block round-trips through JSON")
    func codeBlockRoundTrip() throws {
        let content = MessageContent(code: "print('hello')", language: "python")
        let data = try JSONEncoder.waiagents.encode(content)
        let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: data)
        #expect(decoded.code == "print('hello')")
        #expect(decoded.language == "python")
    }

    @Test("MessageContent decodes code_block content from API array format")
    func decodeCodeBlockFromAPI() throws {
        let json = """
        [{"type": "code_block", "code": "let x = 42", "language": "swift"}]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.code == "let x = 42")
        #expect(content.language == "swift")
    }

    @Test("MessageContent decodes mixed text and code blocks from API")
    func decodeMixedTextAndCode() throws {
        let json = """
        [
            {"type": "text", "text": "Here is some code:"},
            {"type": "code_block", "code": "console.log('hi')", "language": "javascript"}
        ]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Here is some code:")
        #expect(content.code == "console.log('hi')")
        #expect(content.language == "javascript")
    }

    // MARK: - Image Content

    @Test("MessageContent image block decodes from API array format")
    func decodeImageBlock() throws {
        let json = """
        [{"type": "image", "url": "https://example.com/photo.jpg"}]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.mediaURL?.absoluteString == "https://example.com/photo.jpg")
    }

    @Test("MessageContent image with text decodes both from API")
    func decodeImageWithText() throws {
        let json = """
        [
            {"type": "text", "text": "Look at this:"},
            {"type": "image", "url": "https://example.com/img.png"}
        ]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Look at this:")
        #expect(content.mediaURL != nil)
    }

    // MARK: - Embed Content

    @Test("MessageContent embed round-trips through JSON (flat format)")
    func embedRoundTrip() throws {
        let embed = MessageContent.EmbedContent(
            title: "Example Page",
            description: "A test page",
            url: URL(string: "https://example.com"),
            thumbnailURL: URL(string: "https://example.com/thumb.jpg")
        )
        let content = MessageContent(embed: embed)
        let data = try JSONEncoder.waiagents.encode(content)
        let decoded = try JSONDecoder.waiagents.decode(MessageContent.self, from: data)
        #expect(decoded.embed?.title == "Example Page")
        #expect(decoded.embed?.description == "A test page")
        #expect(decoded.embed?.url?.absoluteString == "https://example.com")
        #expect(decoded.embed?.thumbnailURL?.absoluteString == "https://example.com/thumb.jpg")
    }

    @Test("EmbedContent with all nil fields decodes correctly")
    func embedAllNil() throws {
        let json = """
        {"embed": {}}
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.embed != nil)
        #expect(content.embed?.title == nil)
        #expect(content.embed?.description == nil)
        #expect(content.embed?.url == nil)
        #expect(content.embed?.thumbnailURL == nil)
    }

    // MARK: - Unknown/Empty Content Blocks

    @Test("MessageContent decodes unknown block type by skipping it")
    func decodeUnknownBlockType() throws {
        let json = """
        [
            {"type": "unknown_future_type", "data": "something"},
            {"type": "text", "text": "Known text"}
        ]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Known text")
    }

    @Test("MessageContent decodes empty block array as all-nil content")
    func decodeEmptyBlockArray() throws {
        let json = """
        []
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == nil)
        #expect(content.code == nil)
        #expect(content.mediaURL == nil)
    }

    // MARK: - Flat (Legacy) Format

    @Test("MessageContent decodes flat JSON format with all fields")
    func decodeFlatFormatAllFields() throws {
        let json = """
        {
            "text": "Hello",
            "code": "x = 1",
            "language": "python",
            "media_url": "https://example.com/file.pdf"
        }
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Hello")
        #expect(content.code == "x = 1")
        #expect(content.language == "python")
    }

    @Test("MessageContent decodes flat JSON format with only text")
    func decodeFlatFormatTextOnly() throws {
        let json = """
        {"text": "Just text"}
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Just text")
        #expect(content.code == nil)
    }

    // MARK: - Malformed / Missing Fields

    @Test("MessageContent text block with null text field produces nil text")
    func textBlockNullTextField() throws {
        let json = """
        [{"type": "text", "text": null}]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == nil)
    }

    @Test("MessageContent code block missing language field produces nil language")
    func codeBlockMissingLanguage() throws {
        let json = """
        [{"type": "code_block", "code": "x = 1"}]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.code == "x = 1")
        #expect(content.language == nil)
    }

    @Test("MessageContent with extra unexpected fields in flat format is still decodable")
    func flatFormatExtraFields() throws {
        let json = """
        {
            "text": "Hello",
            "unknown_field": "should be ignored",
            "another_unknown": 42
        }
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Hello")
    }

    @Test("MessageContent block array with extra fields in block objects is still decodable")
    func blockArrayExtraFields() throws {
        let json = """
        [
            {"type": "text", "text": "Hello", "annotations": [{"start": 0, "end": 5}]}
        ]
        """.data(using: .utf8)!

        let content = try JSONDecoder.waiagents.decode(MessageContent.self, from: json)
        #expect(content.text == "Hello")
    }

    // MARK: - Encoding Consistency

    @Test("MessageContent encoding produces flat format (not array)")
    func encodingProducesFlatFormat() throws {
        let content = MessageContent(text: "test", code: "x=1", language: "py")
        let data = try JSONEncoder.waiagents.encode(content)
        let dict = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(dict != nil)
        #expect(dict?["text"] as? String == "test")
        #expect(dict?["code"] as? String == "x=1")
        #expect(dict?["language"] as? String == "py")
    }

    @Test("MessageContent Equatable compares all fields")
    func messageContentEquatable() {
        let a = MessageContent(text: "hello", code: "x=1", language: "py")
        let b = MessageContent(text: "hello", code: "x=1", language: "py")
        let c = MessageContent(text: "hello", code: "x=2", language: "py")
        #expect(a == b)
        #expect(a != c)
    }

    @Test("MessageContent with nil text and nil code are equal")
    func messageContentBothNilEqual() {
        let a = MessageContent()
        let b = MessageContent()
        #expect(a == b)
    }
}
