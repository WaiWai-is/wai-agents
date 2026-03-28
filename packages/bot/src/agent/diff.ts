/**
 * Site Diff — detect and describe what changed between site versions.
 *
 * After each /edit, shows a human-readable summary:
 * "Changed: hero background color, added testimonials section, removed FAQ"
 *
 * Compares HTML structure, not raw text — focuses on user-visible changes.
 */

import { log } from "@wai/core";

/** A single detected change. */
export interface Change {
  type: "added" | "removed" | "modified";
  element: string;
  detail: string;
}

/** Diff result between two HTML versions. */
export interface DiffResult {
  changes: Change[];
  sizeChange: number; // bytes: positive = grew, negative = shrank
  sectionsAdded: string[];
  sectionsRemoved: string[];
  summary: string;
}

/**
 * Compare two HTML versions and describe changes.
 */
export function diffHtml(oldHtml: string, newHtml: string): DiffResult {
  const changes: Change[] = [];

  const oldSections = extractSections(oldHtml);
  const newSections = extractSections(newHtml);

  // Detect added/removed sections
  const sectionsAdded = newSections.filter((s) => !oldSections.includes(s));
  const sectionsRemoved = oldSections.filter((s) => !newSections.includes(s));

  for (const s of sectionsAdded) {
    changes.push({ type: "added", element: "section", detail: s });
  }
  for (const s of sectionsRemoved) {
    changes.push({ type: "removed", element: "section", detail: s });
  }

  // Detect color changes
  const oldColors = extractColors(oldHtml);
  const newColors = extractColors(newHtml);
  const colorChanges = detectSetChanges(oldColors, newColors);
  if (colorChanges.added.length > 0 || colorChanges.removed.length > 0) {
    changes.push({
      type: "modified",
      element: "colors",
      detail: `${colorChanges.added.length > 0 ? `+${colorChanges.added.join(", ")}` : ""} ${colorChanges.removed.length > 0 ? `-${colorChanges.removed.join(", ")}` : ""}`.trim(),
    });
  }

  // Detect form changes
  const oldForms = (oldHtml.match(/<form[\s>]/gi) ?? []).length;
  const newForms = (newHtml.match(/<form[\s>]/gi) ?? []).length;
  if (newForms > oldForms) {
    changes.push({ type: "added", element: "form", detail: `${newForms - oldForms} form(s) added` });
  } else if (newForms < oldForms) {
    changes.push({ type: "removed", element: "form", detail: `${oldForms - newForms} form(s) removed` });
  }

  // Detect dark mode change
  const oldDark = /dark:/i.test(oldHtml);
  const newDark = /dark:/i.test(newHtml);
  if (!oldDark && newDark) {
    changes.push({ type: "added", element: "feature", detail: "dark mode support" });
  } else if (oldDark && !newDark) {
    changes.push({ type: "removed", element: "feature", detail: "dark mode support" });
  }

  // Detect image/icon changes
  const oldImages = (oldHtml.match(/<img[\s>]/gi) ?? []).length;
  const newImages = (newHtml.match(/<img[\s>]/gi) ?? []).length;
  if (Math.abs(newImages - oldImages) > 0) {
    changes.push({
      type: newImages > oldImages ? "added" : "removed",
      element: "images",
      detail: `${Math.abs(newImages - oldImages)} image(s)`,
    });
  }

  // Detect page changes (SPA routing)
  const oldPages = extractPages(oldHtml);
  const newPages = extractPages(newHtml);
  const pagesAdded = newPages.filter((p) => !oldPages.includes(p));
  const pagesRemoved = oldPages.filter((p) => !newPages.includes(p));
  for (const p of pagesAdded) {
    changes.push({ type: "added", element: "page", detail: p });
  }
  for (const p of pagesRemoved) {
    changes.push({ type: "removed", element: "page", detail: p });
  }

  // If no structural changes detected but content differs
  if (changes.length === 0 && oldHtml !== newHtml) {
    // Check for text content changes
    const oldText = stripHtmlTags(oldHtml);
    const newText = stripHtmlTags(newHtml);
    if (oldText !== newText) {
      changes.push({ type: "modified", element: "content", detail: "text content updated" });
    } else {
      changes.push({ type: "modified", element: "styling", detail: "CSS/layout changes" });
    }
  }

  const sizeChange = newHtml.length - oldHtml.length;
  const summary = buildSummary(changes, sizeChange);

  log.info({ service: "diff", action: "compared", changes: changes.length, sizeChange });

  return { changes, sizeChange, sectionsAdded, sectionsRemoved, summary };
}

/**
 * Build a human-readable summary of changes.
 */
function buildSummary(changes: Change[], sizeChange: number): string {
  if (changes.length === 0) return "No changes detected";

  const parts: string[] = [];

  const added = changes.filter((c) => c.type === "added");
  const removed = changes.filter((c) => c.type === "removed");
  const modified = changes.filter((c) => c.type === "modified");

  if (added.length > 0) {
    parts.push(`Added: ${added.map((c) => c.detail).join(", ")}`);
  }
  if (removed.length > 0) {
    parts.push(`Removed: ${removed.map((c) => c.detail).join(", ")}`);
  }
  if (modified.length > 0) {
    parts.push(`Modified: ${modified.map((c) => c.detail).join(", ")}`);
  }

  const sizeStr = sizeChange > 0 ? `+${formatBytes(sizeChange)}` : `-${formatBytes(Math.abs(sizeChange))}`;
  parts.push(`(${sizeStr})`);

  return parts.join(" • ");
}

/**
 * Format diff for Telegram display.
 */
export function formatDiff(diff: DiffResult): string {
  if (diff.changes.length === 0) return "";

  const lines: string[] = ["📝 *Changes:*"];

  for (const change of diff.changes.slice(0, 6)) {
    const icon = change.type === "added" ? "➕" : change.type === "removed" ? "➖" : "✏️";
    lines.push(`${icon} ${change.detail}`);
  }

  if (diff.changes.length > 6) {
    lines.push(`_...and ${diff.changes.length - 6} more changes_`);
  }

  const sizeStr = diff.sizeChange >= 0 ? `+${formatBytes(diff.sizeChange)}` : `-${formatBytes(Math.abs(diff.sizeChange))}`;
  lines.push(`📏 Size: ${sizeStr}`);

  return lines.join("\n");
}

// --- Helpers ---

/** Extract h2 section headings. */
function extractSections(html: string): string[] {
  const matches = html.matchAll(/<h2[^>]*>([^<]{2,60})<\/h2>/gi);
  return [...matches].map((m) => m[1].trim());
}

/** Extract CSS color values. */
function extractColors(html: string): string[] {
  const matches = html.matchAll(/#[0-9a-fA-F]{3,8}\b/g);
  return [...new Set([...matches].map((m) => m[0].toLowerCase()))];
}

/** Extract SPA page IDs. */
function extractPages(html: string): string[] {
  const matches = html.matchAll(/currentPage\s*===\s*'([^']+)'/g);
  return [...matches].map((m) => m[1]);
}

/** Find added/removed items between two sets. */
function detectSetChanges(oldSet: string[], newSet: string[]): { added: string[]; removed: string[] } {
  const oldS = new Set(oldSet);
  const newS = new Set(newSet);
  return {
    added: [...newS].filter((x) => !oldS.has(x)),
    removed: [...oldS].filter((x) => !newS.has(x)),
  };
}

/** Strip HTML tags to get text content. */
function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Format bytes as human-readable. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}
