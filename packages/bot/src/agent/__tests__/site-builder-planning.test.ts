import { describe, it, expect, vi } from "vitest";

// Mock @wai/core
vi.mock("@wai/core", () => ({
  config: {
    anthropicApiKey: "test-key",
    cloudflareApiToken: "",
    cloudflareAccountId: "",
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock Anthropic SDK with configurable responses
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { planSite, cleanHtmlOutput, generateSiteHtmlWithRetry, type SitePlan } from "../site-builder.js";
import { beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("planSite", () => {
  it("parses valid JSON plan from Claude", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: JSON.stringify({
        sections: ["Hero", "Features", "Footer"],
        colorScheme: "Blue primary",
        typography: "Inter",
        interactiveElements: ["Dark mode toggle"],
        estimatedComplexity: "simple",
      })}],
    });

    const plan = await planSite("A simple landing page");
    expect(plan.sections).toContain("Hero");
    expect(plan.sections).toContain("Features");
    expect(plan.colorScheme).toContain("Blue");
    expect(plan.estimatedComplexity).toBe("simple");
  });

  it("handles markdown-wrapped JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "```json\n" + JSON.stringify({
        sections: ["Hero", "Pricing"],
        colorScheme: "Green",
        typography: "Inter",
        interactiveElements: [],
        estimatedComplexity: "simple",
      }) + "\n```" }],
    });

    const plan = await planSite("Pricing page");
    expect(plan.sections).toContain("Hero");
    expect(plan.sections).toContain("Pricing");
  });

  it("returns default plan on invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "This is not JSON at all" }],
    });

    const plan = await planSite("Something");
    expect(plan.sections).toContain("Hero");
    expect(plan.sections).toContain("Features");
    expect(plan.estimatedComplexity).toBe("medium");
  });

  it("returns default plan on empty response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "" }],
    });

    const plan = await planSite("Empty");
    expect(plan.sections.length).toBeGreaterThan(0);
  });
});

describe("cleanHtmlOutput", () => {
  it("passes through valid HTML", () => {
    const html = "<!DOCTYPE html><html><body>Hello</body></html>";
    expect(cleanHtmlOutput(html)).toBe(html);
  });

  it("strips markdown code blocks", () => {
    const raw = "```html\n<!DOCTYPE html><html><body>Hello</body></html>\n```";
    expect(cleanHtmlOutput(raw)).toBe("<!DOCTYPE html><html><body>Hello</body></html>");
  });

  it("extracts HTML from surrounding text", () => {
    const raw = "Here is the site:\n<!DOCTYPE html><html><body>Hello</body></html>\nDone!";
    expect(cleanHtmlOutput(raw)).toBe("<!DOCTYPE html><html><body>Hello</body></html>");
  });

  it("returns null for non-HTML content", () => {
    expect(cleanHtmlOutput("This is just text with no HTML")).toBeNull();
  });

  it("handles <html> without DOCTYPE", () => {
    const html = "<html><body>Hello</body></html>";
    expect(cleanHtmlOutput(html)).toBe(html);
  });

  it("handles whitespace", () => {
    const html = "  <!DOCTYPE html><html><body>Hello</body></html>  ";
    expect(cleanHtmlOutput(html)).toBe("<!DOCTYPE html><html><body>Hello</body></html>");
  });

  it("strips triple backtick with language identifier", () => {
    const raw = "```html\n<!DOCTYPE html><html></html>\n```";
    expect(cleanHtmlOutput(raw)).toContain("<!DOCTYPE html>");
  });
});

describe("generateSiteHtmlWithRetry", () => {
  it("returns HTML on first attempt success", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html><body>Success</body></html>" }],
    });

    const html = await generateSiteHtmlWithRetry("Test site");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Success");
  });

  it("retries on first attempt failure", async () => {
    // First attempt: non-HTML response
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "I cannot generate that content" }],
    });
    // Retry: valid HTML
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html><body>Retry</body></html>" }],
    });

    const html = await generateSiteHtmlWithRetry("Test site");
    expect(html).toContain("Retry");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("returns null when both attempts fail", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Not HTML" }],
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Still not HTML" }],
    });

    const html = await generateSiteHtmlWithRetry("Bad request");
    expect(html).toBeNull();
  });

  it("calls progress callback", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    const onProgress = vi.fn();
    await generateSiteHtmlWithRetry("Test", undefined, onProgress);
    expect(onProgress).toHaveBeenCalledWith("generating", expect.any(String));
  });

  it("calls progress callback on retry", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Not HTML" }],
    });
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    const onProgress = vi.fn();
    await generateSiteHtmlWithRetry("Test", undefined, onProgress);
    expect(onProgress).toHaveBeenCalledWith("retrying", expect.any(String));
  });

  it("passes plan context to generation prompt", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    const plan: SitePlan = {
      sections: ["Hero", "Pricing"],
      colorScheme: "Blue",
      typography: "Inter",
      interactiveElements: ["Dark mode"],
      estimatedComplexity: "simple",
    };

    await generateSiteHtmlWithRetry("Test", plan);

    // Find the generate call (first one)
    const generateCall = mockCreate.mock.calls[0][0];
    const promptContent = generateCall.messages[0].content;
    expect(promptContent).toContain("Hero");
    expect(promptContent).toContain("Pricing");
    expect(promptContent).toContain("Blue");
    expect(promptContent).toContain("Dark mode");
  });
});
