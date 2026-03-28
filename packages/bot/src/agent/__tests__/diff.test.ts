import { describe, it, expect, vi } from "vitest";

vi.mock("@wai/core", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { diffHtml, formatDiff } from "../diff.js";

const BASE_HTML = `<!DOCTYPE html><html><body>
<h2>Hero</h2><p>Welcome</p>
<h2>Features</h2><p>Great features</p>
<h2>Contact</h2><form><input></form>
<footer>Made with Wai</footer>
</body></html>`;

describe("diffHtml", () => {
  describe("section changes", () => {
    it("detects added section", () => {
      const newHtml = BASE_HTML.replace("</footer>", "<h2>Pricing</h2><p>Plans</p></footer>");
      const diff = diffHtml(BASE_HTML, newHtml);
      expect(diff.sectionsAdded).toContain("Pricing");
      expect(diff.changes.some((c) => c.type === "added" && c.detail === "Pricing")).toBe(true);
    });

    it("detects removed section", () => {
      const newHtml = BASE_HTML.replace("<h2>Contact</h2><form><input></form>", "");
      const diff = diffHtml(BASE_HTML, newHtml);
      expect(diff.sectionsRemoved).toContain("Contact");
    });

    it("detects multiple added sections", () => {
      const newHtml = BASE_HTML.replace("</footer>", "<h2>Pricing</h2><h2>FAQ</h2></footer>");
      const diff = diffHtml(BASE_HTML, newHtml);
      expect(diff.sectionsAdded).toHaveLength(2);
    });
  });

  describe("color changes", () => {
    it("detects new colors", () => {
      const oldHtml = '<html><body style="color: #000000">Test</body></html>';
      const newHtml = '<html><body style="color: #ff0000; background: #00ff00">Test</body></html>';
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.element === "colors")).toBe(true);
    });
  });

  describe("form changes", () => {
    it("detects added form", () => {
      const oldHtml = "<html><body><p>No forms</p></body></html>";
      const newHtml = "<html><body><form><input></form></body></html>";
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.type === "added" && c.element === "form")).toBe(true);
    });

    it("detects removed form", () => {
      const oldHtml = "<html><body><form><input></form></body></html>";
      const newHtml = "<html><body><p>No forms</p></body></html>";
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.type === "removed" && c.element === "form")).toBe(true);
    });
  });

  describe("dark mode changes", () => {
    it("detects dark mode added", () => {
      const oldHtml = '<html><body class="bg-white">Light</body></html>';
      const newHtml = '<html><body class="bg-white dark:bg-gray-900">Dark</body></html>';
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.detail.includes("dark mode"))).toBe(true);
    });
  });

  describe("image changes", () => {
    it("detects added images", () => {
      const oldHtml = "<html><body><p>Text</p></body></html>";
      const newHtml = '<html><body><p>Text</p><img src="photo.jpg"></body></html>';
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.element === "images" && c.type === "added")).toBe(true);
    });
  });

  describe("page changes (SPA)", () => {
    it("detects added page", () => {
      const oldHtml = `<body><div x-show="currentPage === 'home'">Home</div></body>`;
      const newHtml = `<body><div x-show="currentPage === 'home'">Home</div><div x-show="currentPage === 'about'">About</div></body>`;
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.type === "added" && c.element === "page" && c.detail === "about")).toBe(true);
    });
  });

  describe("content/style changes", () => {
    it("detects text content change", () => {
      const oldHtml = "<html><body><p>Hello World</p></body></html>";
      const newHtml = "<html><body><p>Goodbye World</p></body></html>";
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.detail.includes("text content"))).toBe(true);
    });

    it("detects CSS-only change", () => {
      const oldHtml = '<html><body><p class="text-sm">Same</p></body></html>';
      const newHtml = '<html><body><p class="text-lg">Same</p></body></html>';
      const diff = diffHtml(oldHtml, newHtml);
      expect(diff.changes.some((c) => c.detail.includes("CSS") || c.detail.includes("layout"))).toBe(true);
    });
  });

  describe("size change", () => {
    it("tracks positive size change", () => {
      const newHtml = BASE_HTML + "<div>Extra content here</div>";
      const diff = diffHtml(BASE_HTML, newHtml);
      expect(diff.sizeChange).toBeGreaterThan(0);
    });

    it("tracks negative size change", () => {
      const diff = diffHtml(BASE_HTML, "<html></html>");
      expect(diff.sizeChange).toBeLessThan(0);
    });
  });

  describe("no changes", () => {
    it("reports no changes for identical HTML", () => {
      const diff = diffHtml(BASE_HTML, BASE_HTML);
      expect(diff.changes).toHaveLength(0);
      expect(diff.summary).toContain("No changes");
    });
  });

  describe("summary", () => {
    it("includes added items", () => {
      const newHtml = BASE_HTML.replace("</footer>", "<h2>FAQ</h2></footer>");
      const diff = diffHtml(BASE_HTML, newHtml);
      expect(diff.summary).toContain("Added");
    });

    it("includes size change", () => {
      const newHtml = BASE_HTML + "<div>Extra</div>";
      const diff = diffHtml(BASE_HTML, newHtml);
      expect(diff.summary).toContain("+");
    });
  });
});

describe("formatDiff", () => {
  it("returns empty for no changes", () => {
    const diff = diffHtml(BASE_HTML, BASE_HTML);
    expect(formatDiff(diff)).toBe("");
  });

  it("shows change icons", () => {
    const newHtml = BASE_HTML.replace("</footer>", "<h2>Pricing</h2></footer>");
    const diff = diffHtml(BASE_HTML, newHtml);
    const text = formatDiff(diff);
    expect(text).toContain("➕");
    expect(text).toContain("Pricing");
  });

  it("shows size change", () => {
    const newHtml = BASE_HTML + "<div>Extra content</div>";
    const diff = diffHtml(BASE_HTML, newHtml);
    const text = formatDiff(diff);
    expect(text).toContain("Size:");
  });

  it("limits displayed changes to 6", () => {
    // Create many changes
    let newHtml = BASE_HTML;
    for (let i = 0; i < 10; i++) {
      newHtml = newHtml.replace("</footer>", `<h2>Section ${i}</h2></footer>`);
    }
    const diff = diffHtml(BASE_HTML, newHtml);
    const text = formatDiff(diff);
    expect(text).toContain("more changes");
  });

  it("includes Changes header", () => {
    const newHtml = BASE_HTML.replace("Welcome", "Goodbye");
    const diff = diffHtml(BASE_HTML, newHtml);
    const text = formatDiff(diff);
    expect(text).toContain("Changes");
  });
});
