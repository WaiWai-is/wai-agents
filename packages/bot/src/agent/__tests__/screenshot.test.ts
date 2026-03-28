import { describe, it, expect, vi } from "vitest";

vi.mock("@wai/core", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { extractSiteMeta, getScreenshotUrl, buildTextPreview, generatePreview } from "../screenshot.js";

describe("extractSiteMeta", () => {
  it("extracts title from <title> tag", () => {
    const meta = extractSiteMeta("<html><head><title>My Site</title></head><body></body></html>");
    expect(meta.title).toBe("My Site");
  });

  it("extracts title from <h1> when no <title>", () => {
    const meta = extractSiteMeta("<html><body><h1>Welcome to Cafe</h1></body></html>");
    expect(meta.title).toBe("Welcome to Cafe");
  });

  it("returns 'Untitled Site' when no title found", () => {
    const meta = extractSiteMeta("<html><body><p>Some content</p></body></html>");
    expect(meta.title).toBe("Untitled Site");
  });

  it("extracts description from meta tag", () => {
    const meta = extractSiteMeta('<html><head><meta name="description" content="A great cafe in the city"></head></html>');
    expect(meta.description).toBe("A great cafe in the city");
  });

  it("extracts description from first paragraph when no meta", () => {
    const meta = extractSiteMeta("<html><body><p>This is a wonderful restaurant with amazing food and great service</p></body></html>");
    expect(meta.description).toContain("wonderful restaurant");
  });

  it("extracts sections from h2 headings", () => {
    const html = "<html><body><h2>About Us</h2><h2>Our Menu</h2><h2>Contact</h2></body></html>";
    const meta = extractSiteMeta(html);
    expect(meta.sections).toContain("About Us");
    expect(meta.sections).toContain("Our Menu");
    expect(meta.sections).toContain("Contact");
  });

  it("detects form presence", () => {
    const withForm = extractSiteMeta("<html><body><form action='/submit'><input></form></body></html>");
    expect(withForm.hasForm).toBe(true);

    const noForm = extractSiteMeta("<html><body><p>No form here</p></body></html>");
    expect(noForm.hasForm).toBe(false);
  });

  it("detects dark mode", () => {
    const withDark = extractSiteMeta('<html><body class="dark:bg-gray-900"><p>Dark mode site</p></body></html>');
    expect(withDark.hasDarkMode).toBe(true);

    const noDark = extractSiteMeta("<html><body><p>Light only</p></body></html>");
    expect(noDark.hasDarkMode).toBe(false);
  });

  it("counts SPA pages from Alpine.js routing", () => {
    const html = `<html><body>
      <div x-show="currentPage === 'home'">Home</div>
      <div x-show="currentPage === 'about'">About</div>
      <div x-show="currentPage === 'contact'">Contact</div>
    </body></html>`;
    const meta = extractSiteMeta(html);
    expect(meta.pageCount).toBe(3);
  });

  it("returns pageCount=1 for single-page sites", () => {
    const meta = extractSiteMeta("<html><body><h1>Single page</h1></body></html>");
    expect(meta.pageCount).toBe(1);
  });

  it("skips very short or very long h2 sections", () => {
    const html = `<html><body>
      <h2>A</h2>
      <h2>Valid Section</h2>
      <h2>${"x".repeat(100)}</h2>
    </body></html>`;
    const meta = extractSiteMeta(html);
    expect(meta.sections).toContain("Valid Section");
    expect(meta.sections).not.toContain("A");
  });
});

describe("getScreenshotUrl", () => {
  it("returns a URL string", () => {
    const url = getScreenshotUrl("https://example.wai.computer");
    expect(url).toBeDefined();
    expect(url).toContain("https://");
  });

  it("encodes the site URL", () => {
    const url = getScreenshotUrl("https://кафе.wai.computer");
    expect(url).toContain(encodeURIComponent("https://кафе.wai.computer"));
  });

  it("uses default dimensions", () => {
    const url = getScreenshotUrl("https://example.com");
    expect(url).toContain("1280");
    expect(url).toContain("800");
  });

  it("uses custom dimensions", () => {
    const url = getScreenshotUrl("https://example.com", { width: 375, height: 812 });
    expect(url).toContain("375");
    expect(url).toContain("812");
  });
});

describe("buildTextPreview", () => {
  const meta = {
    title: "Cafe Sunrise",
    description: "A cozy cafe in downtown",
    sections: ["About", "Menu", "Reviews", "Contact"],
    hasForm: true,
    hasDarkMode: true,
    pageCount: 1,
  };

  it("includes title", () => {
    const preview = buildTextPreview("https://cafe.wai.computer", meta, "cafe");
    expect(preview).toContain("Cafe Sunrise");
  });

  it("includes description", () => {
    const preview = buildTextPreview("https://cafe.wai.computer", meta, "cafe");
    expect(preview).toContain("cozy cafe");
  });

  it("includes section count", () => {
    const preview = buildTextPreview("https://cafe.wai.computer", meta, "cafe");
    expect(preview).toContain("4 sections");
  });

  it("includes feature badges", () => {
    const preview = buildTextPreview("https://cafe.wai.computer", meta, "cafe");
    expect(preview).toContain("Form");
    expect(preview).toContain("Dark mode");
  });

  it("includes section names", () => {
    const preview = buildTextPreview("https://cafe.wai.computer", meta, "cafe");
    expect(preview).toContain("About");
    expect(preview).toContain("Menu");
  });

  it("shows page count for multi-page sites", () => {
    const multiMeta = { ...meta, pageCount: 4 };
    const preview = buildTextPreview("https://site.wai.computer", multiMeta, "site");
    expect(preview).toContain("4 pages");
  });

  it("truncates sections to 5", () => {
    const manyMeta = {
      ...meta,
      sections: ["A", "B", "C", "D", "E", "F", "G"],
    };
    const preview = buildTextPreview("https://site.wai.computer", manyMeta, "site");
    expect(preview).toContain("and 2 more");
  });

  it("includes URL", () => {
    const preview = buildTextPreview("https://cafe.wai.computer", meta, "cafe");
    expect(preview).toContain("cafe\\.wai\\.computer");
  });
});

describe("generatePreview", () => {
  it("returns complete preview result", () => {
    const html = '<html><head><title>Test Site</title></head><body><h2>Section 1</h2><form></form></body></html>';
    const result = generatePreview("https://test.wai.computer", "test", html);

    expect(result.imageUrl).toBeDefined();
    expect(result.textPreview).toContain("Test Site");
    expect(result.meta.title).toBe("Test Site");
    expect(result.meta.hasForm).toBe(true);
    expect(result.meta.sections).toContain("Section 1");
  });

  it("handles minimal HTML", () => {
    const result = generatePreview("https://x.wai.computer", "x", "<html></html>");
    expect(result.meta.title).toBe("Untitled Site");
    expect(result.meta.pageCount).toBe(1);
    expect(result.textPreview).toBeTruthy();
  });
});
