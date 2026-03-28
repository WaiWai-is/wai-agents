/**
 * Performance Analyzer — lightweight page weight and speed analysis.
 *
 * Analyzes generated HTML for:
 * - Total page weight (HTML size)
 * - External resource count (scripts, stylesheets, fonts)
 * - Inline vs external resources ratio
 * - Render-blocking resources
 * - Image optimization hints
 * - Estimated load time
 */

import { log } from "@wai/core";

/** Performance report. */
export interface PerfReport {
  score: number; // 0-100
  grade: string; // A-F
  metrics: {
    htmlSizeKb: number;
    externalScripts: number;
    externalStyles: number;
    externalFonts: number;
    inlineScriptKb: number;
    inlineStyleKb: number;
    imageCount: number;
    totalExternalResources: number;
    hasDeferScripts: boolean;
    hasAsyncScripts: boolean;
    hasLazyImages: boolean;
    estimatedLoadMs: number;
  };
  tips: string[];
}

/**
 * Analyze site performance from HTML.
 */
export function analyzePerformance(html: string): PerfReport {
  const tips: string[] = [];
  let score = 100;

  // HTML size
  const htmlSizeKb = Math.round(html.length / 1024 * 10) / 10;

  // External scripts
  const extScripts = (html.match(/<script[^>]+src\s*=/gi) ?? []).length;

  // External stylesheets
  const extStyles = (html.match(/<link[^>]+stylesheet/gi) ?? []).length;

  // External fonts (Google Fonts, etc.)
  const extFonts = (html.match(/fonts\.googleapis|fonts\.gstatic/gi) ?? []).length;

  // Inline scripts
  const inlineScripts = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const inlineScriptKb = Math.round(inlineScripts.join("").length / 1024 * 10) / 10;

  // Inline styles
  const inlineStyles = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? [];
  const inlineStyleKb = Math.round(inlineStyles.join("").length / 1024 * 10) / 10;

  // Images
  const imageCount = (html.match(/<img[\s>]/gi) ?? []).length;

  // Defer/async detection
  const hasDeferScripts = /defer/i.test(html);
  const hasAsyncScripts = /async/i.test(html);
  const hasLazyImages = /loading\s*=\s*["']lazy/i.test(html);

  // Total external resources
  const totalExternal = extScripts + extStyles + extFonts;

  // Estimated load time (very rough heuristic)
  // Base: 200ms + 100ms per external resource + 50ms per 10KB
  const estimatedLoadMs = 200 + totalExternal * 100 + Math.round(htmlSizeKb / 10) * 50;

  // --- Scoring ---

  // Page size
  if (htmlSizeKb > 200) {
    score -= 20;
    tips.push("Page is very large (>200KB) — consider splitting into multiple files");
  } else if (htmlSizeKb > 100) {
    score -= 10;
    tips.push("Page is large (>100KB) — optimize inline styles/scripts");
  } else if (htmlSizeKb > 50) {
    score -= 5;
  }

  // External resources
  if (totalExternal > 8) {
    score -= 15;
    tips.push(`Too many external resources (${totalExternal}) — combine or remove unused`);
  } else if (totalExternal > 5) {
    score -= 5;
    tips.push(`${totalExternal} external resources — consider reducing`);
  }

  // Render-blocking
  const renderBlocking = extScripts - (html.match(/defer|async/gi) ?? []).length;
  if (renderBlocking > 2) {
    score -= 10;
    tips.push("Multiple render-blocking scripts — add defer or async attributes");
  }

  // Images without lazy loading
  if (imageCount > 3 && !hasLazyImages) {
    score -= 5;
    tips.push(`${imageCount} images without lazy loading — add loading="lazy"`);
  }

  // Bonuses
  if (hasDeferScripts) score = Math.min(100, score + 3);
  if (hasAsyncScripts) score = Math.min(100, score + 2);
  if (hasLazyImages && imageCount > 0) score = Math.min(100, score + 3);
  if (htmlSizeKb < 30) score = Math.min(100, score + 5); // Lightweight bonus
  if (totalExternal <= 3) score = Math.min(100, score + 3); // Few deps bonus

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

  if (tips.length === 0) {
    tips.push("Great performance! No major issues detected.");
  }

  log.info({ service: "perf", action: "analyzed", htmlSizeKb, totalExternal, score, grade });

  return {
    score,
    grade,
    metrics: {
      htmlSizeKb, externalScripts: extScripts, externalStyles: extStyles,
      externalFonts: extFonts, inlineScriptKb, inlineStyleKb,
      imageCount, totalExternalResources: totalExternal,
      hasDeferScripts, hasAsyncScripts, hasLazyImages, estimatedLoadMs,
    },
    tips,
  };
}

/**
 * Format performance report for Telegram.
 */
export function formatPerfReport(report: PerfReport): string {
  const emoji = report.score >= 90 ? "🚀" : report.score >= 75 ? "⚡" : report.score >= 60 ? "🐢" : "🐌";

  const lines = [
    `${emoji} *Performance: ${report.grade}* (${report.score}/100)\n`,
    `📦 Size: ${report.metrics.htmlSizeKb}KB`,
    `🔗 External: ${report.metrics.totalExternalResources} resources`,
    `⏱️ Est. load: ~${report.metrics.estimatedLoadMs}ms`,
  ];

  // Feature flags
  const features: string[] = [];
  if (report.metrics.hasDeferScripts) features.push("defer ✓");
  if (report.metrics.hasAsyncScripts) features.push("async ✓");
  if (report.metrics.hasLazyImages) features.push("lazy ✓");
  if (features.length > 0) lines.push(`🔧 ${features.join(", ")}`);

  // Tips
  if (report.tips.length > 0 && !report.tips[0].startsWith("Great")) {
    lines.push("\n*Tips:*");
    for (const tip of report.tips.slice(0, 3)) {
      lines.push(`💡 ${tip}`);
    }
  }

  return lines.join("\n");
}

/**
 * Combine all three scores into a single dashboard line.
 */
export function formatCombinedScores(quality: number, a11y: number, perf: number): string {
  const avg = Math.round((quality + a11y + perf) / 3);
  const grade = avg >= 90 ? "A" : avg >= 75 ? "B" : avg >= 60 ? "C" : avg >= 50 ? "D" : "F";

  return `📊 *Overall: ${grade}* (${avg}/100) — Quality: ${quality} | A11y: ${a11y} | Perf: ${perf}`;
}
