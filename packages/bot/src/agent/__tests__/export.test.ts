import { describe, it, expect, vi } from "vitest";

vi.mock("@wai/core", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  exportSiteAsZip, generateReadme, formatFileSize, cleanupExport,
} from "../export.js";

describe("exportSiteAsZip", () => {
  it("creates a ZIP file", async () => {
    const result = await exportSiteAsZip(
      "test-site",
      "<!DOCTYPE html><html><body>Hello</body></html>",
      "A test site",
    );

    expect(result.success).toBe(true);
    expect(result.filePath).toBeDefined();
    expect(result.fileName).toBe("test-site.zip");
    expect(result.fileSize).toBeGreaterThan(0);

    // Clean up
    if (result.filePath) await cleanupExport(result.filePath);
  });

  it("ZIP filename matches slug", async () => {
    const result = await exportSiteAsZip("my-cafe", "<html></html>", "Cafe");
    expect(result.fileName).toBe("my-cafe.zip");
    if (result.filePath) await cleanupExport(result.filePath);
  });

  it("includes README in ZIP", async () => {
    const result = await exportSiteAsZip("readme-test", "<html></html>", "Test");
    expect(result.success).toBe(true);

    // Verify ZIP contains README by listing contents
    if (result.filePath) {
      const { execSync } = await import("node:child_process");
      const contents = execSync(`unzip -l "${result.filePath}"`).toString();
      expect(contents).toContain("README.md");
      expect(contents).toContain("index.html");
      await cleanupExport(result.filePath);
    }
  });
});

describe("generateReadme", () => {
  it("includes slug as title", () => {
    const readme = generateReadme("my-cafe", "Cafe website");
    expect(readme).toContain("# my-cafe");
  });

  it("includes description", () => {
    const readme = generateReadme("test", "A beautiful landing page");
    expect(readme).toContain("A beautiful landing page");
  });

  it("includes live URL", () => {
    const readme = generateReadme("my-site", "desc");
    expect(readme).toContain("https://my-site.wai.computer");
  });

  it("includes deployment instructions", () => {
    const readme = generateReadme("test", "desc");
    expect(readme).toContain("Netlify");
    expect(readme).toContain("Vercel");
    expect(readme).toContain("GitHub Pages");
    expect(readme).toContain("Cloudflare Pages");
  });

  it("includes tech stack info", () => {
    const readme = generateReadme("test", "desc");
    expect(readme).toContain("Tailwind");
    expect(readme).toContain("Alpine.js");
    expect(readme).toContain("Lucide");
  });

  it("includes Wai branding", () => {
    const readme = generateReadme("test", "desc");
    expect(readme).toContain("Wai");
    expect(readme).toContain("waicomputer_bot");
  });
});

describe("formatFileSize", () => {
  it("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });

  it("formats small KB", () => {
    expect(formatFileSize(1500)).toBe("1.5 KB");
  });

  it("formats zero", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
});

describe("cleanupExport", () => {
  it("does not throw on nonexistent file", async () => {
    await expect(cleanupExport("/tmp/nonexistent-file-xyz.zip")).resolves.toBeUndefined();
  });
});
