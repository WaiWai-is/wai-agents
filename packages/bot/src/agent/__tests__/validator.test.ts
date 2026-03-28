import { describe, it, expect, vi } from "vitest";

vi.mock("@wai/core", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { validateSiteQuality, formatQualityReport } from "../validator.js";

// High-quality site HTML for testing
const GOOD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Site</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
</head>
<body x-data="{ open: false, dark: false }" :class="dark && 'dark'">
  <header>
    <h1>Welcome to Test</h1>
    <button @click="dark = !dark" class="dark:bg-gray-800">Toggle</button>
  </header>
  <section>
    <h2>Features</h2>
    <div x-show="open" x-transition>Content</div>
    <button x-on:click="open = !open">Show more</button>
  </section>
  <section>
    <h2>Contact</h2>
    <form><input x-model="name"><button type="submit">Send</button></form>
  </section>
  <footer>Made with Wai ✨</footer>
</body>
</html>`;

const MINIMAL_HTML = "<!DOCTYPE html><html><body><p>Hello</p></body></html>";
const TINY_HTML = "<p>Too short</p>";

describe("validateSiteQuality", () => {
  describe("high-quality site", () => {
    it("scores 90+ for a complete site", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.score).toBeGreaterThanOrEqual(90);
      expect(report.passed).toBe(true);
    });

    it("detects all tech stack", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.hasTailwind).toBe(true);
      expect(report.stats.hasAlpineJs).toBe(true);
      expect(report.stats.hasLucideIcons).toBe(true);
      expect(report.stats.hasGoogleFonts).toBe(true);
    });

    it("detects interactive elements", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.interactiveCount).toBeGreaterThan(0);
    });

    it("detects form", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.hasForm).toBe(true);
    });

    it("detects footer", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.hasFooter).toBe(true);
    });

    it("detects dark mode", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.hasDarkMode).toBe(true);
    });

    it("detects headings", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.headingCount).toBeGreaterThanOrEqual(2);
    });

    it("detects viewport", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.hasViewport).toBe(true);
    });
  });

  describe("minimal site", () => {
    it("scores lower for minimal HTML", () => {
      const report = validateSiteQuality(MINIMAL_HTML);
      expect(report.score).toBeLessThan(90);
    });

    it("flags missing Tailwind", () => {
      const report = validateSiteQuality(MINIMAL_HTML);
      expect(report.issues.some((i) => i.code === "NO_TAILWIND")).toBe(true);
    });

    it("flags missing viewport", () => {
      const report = validateSiteQuality(MINIMAL_HTML);
      expect(report.issues.some((i) => i.code === "NO_VIEWPORT")).toBe(true);
    });

    it("fails quality check (too minimal)", () => {
      const report = validateSiteQuality(MINIMAL_HTML);
      expect(report.passed).toBe(false);
    });
  });

  describe("too short HTML", () => {
    it("flags as error", () => {
      const report = validateSiteQuality(TINY_HTML);
      expect(report.issues.some((i) => i.code === "TOO_SHORT")).toBe(true);
    });

    it("fails quality check", () => {
      const report = validateSiteQuality(TINY_HTML);
      expect(report.passed).toBe(false);
    });

    it("scores very low", () => {
      const report = validateSiteQuality(TINY_HTML);
      expect(report.score).toBeLessThan(50);
    });
  });

  describe("missing DOCTYPE", () => {
    it("flags invalid HTML", () => {
      const report = validateSiteQuality("<div>No doctype or html tag</div>");
      expect(report.issues.some((i) => i.code === "INVALID_HTML")).toBe(true);
    });
  });

  describe("score bounds", () => {
    it("never exceeds 100", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.score).toBeLessThanOrEqual(100);
    });

    it("never goes below 0", () => {
      const report = validateSiteQuality("");
      expect(report.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("stats accuracy", () => {
    it("counts HTML size", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.htmlSize).toBe(GOOD_HTML.length);
    });

    it("counts sections", () => {
      const report = validateSiteQuality(GOOD_HTML);
      expect(report.stats.sectionCount).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("formatQualityReport", () => {
  it("shows grade A for high score", () => {
    const report = validateSiteQuality(GOOD_HTML);
    const text = formatQualityReport(report);
    expect(text).toContain("A");
    expect(text).toContain("🌟");
  });

  it("shows grade F for very low score", () => {
    const report = validateSiteQuality(TINY_HTML);
    const text = formatQualityReport(report);
    expect(text).toContain("F");
    expect(text).toContain("❌");
  });

  it("includes tech stack", () => {
    const report = validateSiteQuality(GOOD_HTML);
    const text = formatQualityReport(report);
    expect(text).toContain("Tailwind");
    expect(text).toContain("Alpine.js");
  });

  it("includes heading and section counts", () => {
    const report = validateSiteQuality(GOOD_HTML);
    const text = formatQualityReport(report);
    expect(text).toContain("headings");
    expect(text).toContain("sections");
    expect(text).toContain("interactive");
  });

  it("includes issue messages", () => {
    const report = validateSiteQuality(MINIMAL_HTML);
    const text = formatQualityReport(report);
    expect(text).toContain("⚠️");
  });

  it("shows score", () => {
    const report = validateSiteQuality(GOOD_HTML);
    const text = formatQualityReport(report);
    expect(text).toContain("/100");
  });
});
