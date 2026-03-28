/**
 * Site Quality Validator — checks generated HTML before deployment.
 *
 * Catches common generation failures:
 * - Missing tech stack (Tailwind, Alpine.js, Lucide)
 * - No interactive elements
 * - Too short (likely incomplete generation)
 * - Missing responsive meta viewport
 * - No heading hierarchy
 * - Missing footer
 *
 * Returns a quality score and actionable issues.
 */

import { log } from "@wai/core";

/** Quality check result. */
export interface QualityIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
}

/** Overall quality report. */
export interface QualityReport {
  score: number; // 0-100
  passed: boolean; // score >= 50
  issues: QualityIssue[];
  stats: {
    htmlSize: number;
    hasTailwind: boolean;
    hasAlpineJs: boolean;
    hasLucideIcons: boolean;
    hasGoogleFonts: boolean;
    headingCount: number;
    sectionCount: number;
    hasForm: boolean;
    hasFooter: boolean;
    hasViewport: boolean;
    hasDarkMode: boolean;
    interactiveCount: number;
  };
}

/**
 * Validate generated HTML quality.
 */
export function validateSiteQuality(html: string): QualityReport {
  const issues: QualityIssue[] = [];
  let score = 100;

  // Stats detection
  const stats = {
    htmlSize: html.length,
    hasTailwind: /tailwindcss|cdn\.tailwindcss/i.test(html),
    hasAlpineJs: /alpinejs|x-data|x-show|x-on/i.test(html),
    hasLucideIcons: /lucide|data-lucide/i.test(html),
    hasGoogleFonts: /fonts\.googleapis/i.test(html),
    headingCount: (html.match(/<h[1-6][^>]*>/gi) ?? []).length,
    sectionCount: (html.match(/<(?:section|main|article)[^>]*>/gi) ?? []).length,
    hasForm: /<form[\s>]/i.test(html),
    hasFooter: /<footer[\s>]/i.test(html),
    hasViewport: /viewport/i.test(html),
    hasDarkMode: /dark:/i.test(html),
    interactiveCount: countInteractiveElements(html),
  };

  // Critical checks (errors — reduce score heavily)
  if (stats.htmlSize < 500) {
    issues.push({ severity: "error", code: "TOO_SHORT", message: "HTML is too short (<500 chars) — likely incomplete generation" });
    score -= 40;
  } else if (stats.htmlSize < 2000) {
    issues.push({ severity: "warning", code: "SHORT", message: "HTML is short (<2KB) — may be missing sections" });
    score -= 15;
  }

  if (!html.includes("<!DOCTYPE") && !html.includes("<html")) {
    issues.push({ severity: "error", code: "INVALID_HTML", message: "Missing DOCTYPE or <html> tag" });
    score -= 30;
  }

  // Tech stack checks (warnings)
  if (!stats.hasTailwind) {
    issues.push({ severity: "warning", code: "NO_TAILWIND", message: "Tailwind CSS not detected" });
    score -= 10;
  }

  if (!stats.hasAlpineJs) {
    issues.push({ severity: "warning", code: "NO_ALPINE", message: "Alpine.js not detected — site may lack interactivity" });
    score -= 5;
  }

  if (!stats.hasViewport) {
    issues.push({ severity: "warning", code: "NO_VIEWPORT", message: "Missing viewport meta — may not be mobile-responsive" });
    score -= 10;
  }

  // Content checks
  if (stats.headingCount === 0) {
    issues.push({ severity: "warning", code: "NO_HEADINGS", message: "No heading tags found" });
    score -= 10;
  }

  if (!stats.hasFooter) {
    issues.push({ severity: "info", code: "NO_FOOTER", message: "No <footer> tag found" });
    score -= 5;
  }

  if (stats.interactiveCount === 0) {
    issues.push({ severity: "info", code: "NO_INTERACTIVE", message: "No interactive elements detected (no Alpine.js directives)" });
    score -= 5;
  }

  // Bonus points
  if (stats.hasGoogleFonts) score = Math.min(100, score + 2);
  if (stats.hasLucideIcons) score = Math.min(100, score + 2);
  if (stats.hasDarkMode) score = Math.min(100, score + 3);
  if (stats.hasForm) score = Math.min(100, score + 2);
  if (stats.interactiveCount >= 3) score = Math.min(100, score + 3);

  score = Math.max(0, Math.min(100, score));

  log.info({
    service: "validator", action: "validated",
    score, issues: issues.length,
    htmlSize: stats.htmlSize,
    hasTailwind: stats.hasTailwind,
  });

  return {
    score,
    passed: score >= 50,
    issues,
    stats,
  };
}

/**
 * Count interactive elements (Alpine.js directives).
 */
function countInteractiveElements(html: string): number {
  const directives = [
    /x-show/gi, /x-on:/gi, /@click/gi, /x-transition/gi,
    /x-bind/gi, /x-model/gi, /x-for/gi, /x-if/gi,
  ];
  let count = 0;
  for (const d of directives) {
    count += (html.match(d) ?? []).length;
  }
  return count;
}

/**
 * Format quality report for logging/display.
 */
export function formatQualityReport(report: QualityReport): string {
  const grade = report.score >= 90 ? "A" : report.score >= 75 ? "B" : report.score >= 60 ? "C" : report.score >= 50 ? "D" : "F";
  const emoji = report.score >= 90 ? "🌟" : report.score >= 75 ? "✅" : report.score >= 60 ? "⚠️" : "❌";

  const lines = [`${emoji} Quality: ${grade} (${report.score}/100)`];

  if (report.issues.length > 0) {
    for (const issue of report.issues) {
      const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
      lines.push(`${icon} ${issue.message}`);
    }
  }

  // Stats summary
  const features: string[] = [];
  if (report.stats.hasTailwind) features.push("Tailwind");
  if (report.stats.hasAlpineJs) features.push("Alpine.js");
  if (report.stats.hasLucideIcons) features.push("Lucide");
  if (report.stats.hasGoogleFonts) features.push("Fonts");
  if (report.stats.hasDarkMode) features.push("Dark mode");
  if (report.stats.hasForm) features.push("Form");

  if (features.length > 0) {
    lines.push(`🔧 ${features.join(" • ")}`);
  }

  lines.push(`📐 ${report.stats.headingCount} headings, ${report.stats.sectionCount} sections, ${report.stats.interactiveCount} interactive`);

  return lines.join("\n");
}
