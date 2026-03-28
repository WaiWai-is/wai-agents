import { describe, it, expect, vi } from "vitest";

vi.mock("@wai/core", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { analyzePerformance, formatPerfReport, formatCombinedScores } from "../perf.js";

const LIGHT_HTML = `<!DOCTYPE html>
<html><head>
<script src="https://cdn.tailwindcss.com" defer></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
</head><body><h1>Hello</h1></body></html>`;

const HEAVY_HTML = `<!DOCTYPE html><html><head>
<script src="a.js"></script>
<script src="b.js"></script>
<script src="c.js"></script>
<script src="d.js"></script>
<script src="e.js"></script>
<script src="f.js"></script>
<script src="g.js"></script>
<script src="h.js"></script>
<script src="i.js"></script>
<link rel="stylesheet" href="a.css">
<link rel="stylesheet" href="b.css">
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
</head><body>
${"<img src='photo.jpg'>".repeat(10)}
${"<p>Content block</p>".repeat(100)}
</body></html>`;

describe("analyzePerformance", () => {
  describe("lightweight site", () => {
    it("scores high for small site with defer", () => {
      const report = analyzePerformance(LIGHT_HTML);
      expect(report.score).toBeGreaterThanOrEqual(85);
      expect(report.grade).toMatch(/[AB]/);
    });

    it("counts external scripts", () => {
      const report = analyzePerformance(LIGHT_HTML);
      expect(report.metrics.externalScripts).toBe(2);
    });

    it("detects defer", () => {
      const report = analyzePerformance(LIGHT_HTML);
      expect(report.metrics.hasDeferScripts).toBe(true);
    });

    it("calculates HTML size", () => {
      const report = analyzePerformance(LIGHT_HTML);
      expect(report.metrics.htmlSizeKb).toBeGreaterThan(0);
      expect(report.metrics.htmlSizeKb).toBeLessThan(5);
    });

    it("estimates fast load time", () => {
      const report = analyzePerformance(LIGHT_HTML);
      expect(report.metrics.estimatedLoadMs).toBeLessThan(1000);
    });
  });

  describe("heavy site", () => {
    it("scores lower for heavy site", () => {
      const report = analyzePerformance(HEAVY_HTML);
      expect(report.score).toBeLessThan(80);
    });

    it("counts many external resources", () => {
      const report = analyzePerformance(HEAVY_HTML);
      expect(report.metrics.totalExternalResources).toBeGreaterThan(8);
    });

    it("detects fonts", () => {
      const report = analyzePerformance(HEAVY_HTML);
      expect(report.metrics.externalFonts).toBeGreaterThan(0);
    });

    it("counts images", () => {
      const report = analyzePerformance(HEAVY_HTML);
      expect(report.metrics.imageCount).toBe(10);
    });

    it("provides optimization tips", () => {
      const report = analyzePerformance(HEAVY_HTML);
      expect(report.tips.length).toBeGreaterThan(0);
      expect(report.tips.some((t) => t.includes("external resources") || t.includes("render-blocking") || t.includes("lazy"))).toBe(true);
    });

    it("estimates slower load", () => {
      const report = analyzePerformance(HEAVY_HTML);
      expect(report.metrics.estimatedLoadMs).toBeGreaterThan(500);
    });
  });

  describe("inline resources", () => {
    it("measures inline script size", () => {
      const html = "<html><body><script>const x = 1; const y = 2; console.log(x + y);</script></body></html>";
      const report = analyzePerformance(html);
      expect(report.metrics.inlineScriptKb).toBeGreaterThan(0);
    });

    it("measures inline style size", () => {
      const html = "<html><body><style>body { color: red; background: blue; }</style></body></html>";
      const report = analyzePerformance(html);
      expect(report.metrics.inlineStyleKb).toBeGreaterThan(0);
    });
  });

  describe("lazy loading", () => {
    it("detects lazy loading", () => {
      const html = '<html><body><img src="a.jpg" loading="lazy"></body></html>';
      const report = analyzePerformance(html);
      expect(report.metrics.hasLazyImages).toBe(true);
    });

    it("flags missing lazy loading for many images", () => {
      const html = `<html><body>${"<img src='x.jpg'>".repeat(5)}</body></html>`;
      const report = analyzePerformance(html);
      expect(report.tips.some((t) => t.includes("lazy"))).toBe(true);
    });
  });

  describe("score bounds", () => {
    it("never exceeds 100", () => {
      expect(analyzePerformance(LIGHT_HTML).score).toBeLessThanOrEqual(100);
    });

    it("never goes below 0", () => {
      const extreme = `<html>${"<script src='x.js'></script>".repeat(20)}</html>`;
      expect(analyzePerformance(extreme).score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("grade assignment", () => {
    it("A for 90+", () => {
      const html = '<html><body><script defer src="x.js"></script></body></html>';
      const report = analyzePerformance(html);
      if (report.score >= 90) expect(report.grade).toBe("A");
    });
  });
});

describe("formatPerfReport", () => {
  it("shows grade and score", () => {
    const report = analyzePerformance(LIGHT_HTML);
    const text = formatPerfReport(report);
    expect(text).toContain("/100");
    expect(text).toMatch(/[A-F]/);
  });

  it("shows size", () => {
    const report = analyzePerformance(LIGHT_HTML);
    const text = formatPerfReport(report);
    expect(text).toContain("KB");
  });

  it("shows external resource count", () => {
    const report = analyzePerformance(LIGHT_HTML);
    const text = formatPerfReport(report);
    expect(text).toContain("External");
  });

  it("shows estimated load time", () => {
    const report = analyzePerformance(LIGHT_HTML);
    const text = formatPerfReport(report);
    expect(text).toContain("ms");
  });

  it("shows defer/async flags", () => {
    const report = analyzePerformance(LIGHT_HTML);
    const text = formatPerfReport(report);
    expect(text).toContain("defer ✓");
  });

  it("shows tips for heavy sites", () => {
    const report = analyzePerformance(HEAVY_HTML);
    const text = formatPerfReport(report);
    expect(text).toContain("💡");
  });
});

describe("formatCombinedScores", () => {
  it("calculates average", () => {
    const text = formatCombinedScores(90, 80, 70);
    expect(text).toContain("80"); // avg
  });

  it("shows all three scores", () => {
    const text = formatCombinedScores(95, 85, 75);
    expect(text).toContain("95");
    expect(text).toContain("85");
    expect(text).toContain("75");
  });

  it("assigns grade based on average", () => {
    const text = formatCombinedScores(95, 95, 95);
    expect(text).toContain("A");
  });

  it("shows grade F for low scores", () => {
    const text = formatCombinedScores(20, 30, 10);
    expect(text).toContain("F");
  });
});
