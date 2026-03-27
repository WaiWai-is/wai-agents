import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @wai/core
vi.mock("@wai/core", () => ({
  config: {
    anthropicApiKey: "test-key",
    cloudflareApiToken: "",
    cloudflareAccountId: "",
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock Anthropic SDK
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import {
  storeSite, getStoredSite, clearStoredSite,
  editSite, editAndDeploySite,
} from "../site-builder.js";

beforeEach(() => {
  vi.clearAllMocks();
  clearStoredSite("user-1");
  clearStoredSite("user-2");
});

describe("site store", () => {
  it("stores and retrieves a site", () => {
    storeSite("user-1", "my-site", "<html>Hello</html>", "A test site");
    const stored = getStoredSite("user-1");
    expect(stored).toBeDefined();
    expect(stored!.slug).toBe("my-site");
    expect(stored!.html).toBe("<html>Hello</html>");
    expect(stored!.description).toBe("A test site");
  });

  it("returns undefined for unknown user", () => {
    expect(getStoredSite("unknown")).toBeUndefined();
  });

  it("overwrites on second store", () => {
    storeSite("user-1", "site-v1", "<html>V1</html>", "Version 1");
    storeSite("user-1", "site-v2", "<html>V2</html>", "Version 2");
    const stored = getStoredSite("user-1");
    expect(stored!.slug).toBe("site-v2");
    expect(stored!.html).toBe("<html>V2</html>");
  });

  it("clears stored site", () => {
    storeSite("user-1", "my-site", "<html>Hi</html>", "Test");
    clearStoredSite("user-1");
    expect(getStoredSite("user-1")).toBeUndefined();
  });

  it("stores per-user independently", () => {
    storeSite("user-1", "site-a", "<html>A</html>", "Site A");
    storeSite("user-2", "site-b", "<html>B</html>", "Site B");
    expect(getStoredSite("user-1")!.slug).toBe("site-a");
    expect(getStoredSite("user-2")!.slug).toBe("site-b");
  });
});

describe("editSite", () => {
  it("returns edited HTML on success", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html><body style='color:blue'>Blue</body></html>" }],
    });

    const result = await editSite("<html><body>Original</body></html>", "Change color to blue");
    expect(result).toContain("blue");
    expect(result).toContain("<!DOCTYPE html>");
  });

  it("returns null on non-HTML response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "I can't edit that" }],
    });

    const result = await editSite("<html>Test</html>", "Do something impossible");
    expect(result).toBeNull();
  });

  it("passes current HTML and edit request to Claude", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    await editSite("<html><body>Current</body></html>", "Add a footer");
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("Current");
    expect(prompt).toContain("Add a footer");
  });

  it("calls progress callback", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    const onProgress = vi.fn();
    await editSite("<html>Test</html>", "Change color", onProgress);
    expect(onProgress).toHaveBeenCalledWith("editing", expect.stringContaining("Change color"));
  });

  it("truncates very large HTML for context", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html></html>" }],
    });

    const hugeHtml = "<html>" + "x".repeat(70000) + "</html>";
    await editSite(hugeHtml, "Edit");
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("truncated for context");
  });
});

describe("editAndDeploySite", () => {
  it("returns error when no stored site", async () => {
    const result = await editAndDeploySite("user-no-site", "Change color");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No site to edit");
  });

  it("edits and attempts deploy with stored site", async () => {
    storeSite("user-1", "test-slug", "<html><body>Original</body></html>", "Test site");

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html><body>Edited</body></html>" }],
    });

    const result = await editAndDeploySite("user-1", "Change text");
    // Deploy fails because no Cloudflare creds in test
    expect(result.slug).toBe("test-slug");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Cloudflare credentials not configured");
  });

  it("returns error when edit fails", async () => {
    storeSite("user-1", "test-slug", "<html>Original</html>", "Test");

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Cannot do that" }],
    });

    const result = await editAndDeploySite("user-1", "Impossible edit");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to apply edit");
  });

  it("calls progress callback during edit", async () => {
    storeSite("user-1", "test-slug", "<html>Test</html>", "Test");

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "<!DOCTYPE html><html>Edited</html>" }],
    });

    const onProgress = vi.fn();
    await editAndDeploySite("user-1", "Change style", onProgress);
    expect(onProgress).toHaveBeenCalledWith("editing", expect.stringContaining("test-slug"));
  });
});
