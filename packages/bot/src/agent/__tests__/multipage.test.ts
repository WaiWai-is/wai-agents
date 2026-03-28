import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@wai/core", () => ({
  config: { anthropicApiKey: "test-key", cloudflareApiToken: "", cloudflareAccountId: "" },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { detectMultiPage, generateMultiPageHtml } from "../site-builder.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("detectMultiPage", () => {
  // Explicit multi-page indicators
  it("detects '5 pages' in English", () => {
    const pages = detectMultiPage("Website with 5 pages for my business");
    expect(pages).toBeDefined();
    expect(pages!.length).toBeGreaterThanOrEqual(3);
  });

  it("detects 'multi-page' keyword", () => {
    const pages = detectMultiPage("Multi-page website for restaurant");
    expect(pages).toBeDefined();
  });

  it("detects 'многостраничный' in Russian", () => {
    const pages = detectMultiPage("Многостраничный сайт для компании");
    expect(pages).toBeDefined();
  });

  it("detects 'несколько страниц' in Russian", () => {
    const pages = detectMultiPage("Сайт с несколько страниц");
    expect(pages).toBeDefined();
  });

  // Implicit multi-page from keywords
  it("detects multi-page from 3+ page keywords (EN)", () => {
    const pages = detectMultiPage("Site with home, about, services, and contact pages");
    expect(pages).toBeDefined();
    expect(pages!.some((p) => p.id === "home")).toBe(true);
    expect(pages!.some((p) => p.id === "about")).toBe(true);
    expect(pages!.some((p) => p.id === "services")).toBe(true);
    expect(pages!.some((p) => p.id === "contact")).toBe(true);
  });

  it("detects multi-page from 3+ page keywords (RU)", () => {
    const pages = detectMultiPage("Сайт с главная, о нас, услуги и контакты");
    expect(pages).toBeDefined();
    expect(pages!.some((p) => p.id === "home")).toBe(true);
    expect(pages!.some((p) => p.id === "about")).toBe(true);
    expect(pages!.some((p) => p.id === "services")).toBe(true);
    expect(pages!.some((p) => p.id === "contact")).toBe(true);
  });

  it("detects portfolio + blog + team as multi-page", () => {
    const pages = detectMultiPage("Portfolio site with blog, team section, and gallery");
    expect(pages).toBeDefined();
    expect(pages!.some((p) => p.id === "portfolio")).toBe(true);
    expect(pages!.some((p) => p.id === "blog")).toBe(true);
    expect(pages!.some((p) => p.id === "team")).toBe(true);
  });

  // Ensures home is always first
  it("puts home first even if not mentioned explicitly", () => {
    const pages = detectMultiPage("Multi-page site for business");
    expect(pages).toBeDefined();
    expect(pages![0].id).toBe("home");
  });

  it("includes home when detected from keywords", () => {
    const pages = detectMultiPage("Site with about, services, and contact");
    expect(pages).toBeDefined();
    expect(pages![0].id).toBe("home");
  });

  // Non-multi-page
  it("returns undefined for simple landing page", () => {
    expect(detectMultiPage("Simple landing page for my app")).toBeUndefined();
  });

  it("returns undefined for single-topic description", () => {
    expect(detectMultiPage("Restaurant menu page with Italian food")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(detectMultiPage("")).toBeUndefined();
  });

  // Edge cases
  it("returns default pages for generic multi-page request", () => {
    const pages = detectMultiPage("I need a multi-page website");
    expect(pages).toBeDefined();
    expect(pages!.length).toBe(4); // home, about, services, contact
  });

  it("detects pages with pricing and faq", () => {
    const pages = detectMultiPage("SaaS site with pricing, faq, and about");
    expect(pages).toBeDefined();
    expect(pages!.some((p) => p.id === "pricing")).toBe(true);
    expect(pages!.some((p) => p.id === "faq")).toBe(true);
  });
});

describe("generateMultiPageHtml", () => {
  it("generates HTML for multi-page site", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html><body x-data>Multi-page</body></html>" }],
    });

    const pages = [
      { id: "home", title: "Home", description: "Landing page" },
      { id: "about", title: "About", description: "About page" },
    ];

    const html = await generateMultiPageHtml("Test site", pages);
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("passes page list to the prompt", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    const pages = [
      { id: "home", title: "Home", description: "Landing page" },
      { id: "about", title: "About", description: "About page" },
      { id: "contact", title: "Contact", description: "Contact page" },
    ];

    await generateMultiPageHtml("Company site", pages);

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Home (#home)");
    expect(prompt).toContain("About (#about)");
    expect(prompt).toContain("Contact (#contact)");
  });

  it("uses higher max_tokens for multi-page", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    await generateMultiPageHtml("Test", [{ id: "home", title: "Home", description: "Home" }]);

    expect(mockCreate.mock.calls[0][0].max_tokens).toBe(32000);
  });

  it("includes memory context when provided", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    await generateMultiPageHtml("Test", [{ id: "home", title: "Home", description: "Home" }], undefined, undefined, undefined, "## User prefers dark theme");

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("dark theme");
  });

  it("returns null on non-HTML response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Sorry, I cannot generate that." }],
    });

    const html = await generateMultiPageHtml("Test", [{ id: "home", title: "Home", description: "Home" }]);
    expect(html).toBeNull();
  });

  it("calls progress callback", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    const onProgress = vi.fn();
    await generateMultiPageHtml("Test", [
      { id: "home", title: "Home", description: "Home" },
      { id: "about", title: "About", description: "About" },
    ], undefined, onProgress);

    expect(onProgress).toHaveBeenCalledWith("generating", expect.stringContaining("2-page SPA"));
  });
});
