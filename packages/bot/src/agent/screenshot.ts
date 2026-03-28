/**
 * Screenshot service — capture site previews for Telegram.
 *
 * Strategy:
 * 1. Use external screenshot API (if configured)
 * 2. Generate a rich text preview card from the HTML
 *
 * The screenshot URL is sent as a photo in Telegram for instant visual feedback.
 */

import { log } from "@wai/core";

/** Screenshot result. */
export interface ScreenshotResult {
  /** URL to the screenshot image (if available). */
  imageUrl?: string;
  /** Text preview extracted from HTML (always available). */
  textPreview: string;
  /** OG-style metadata extracted from the site. */
  meta: {
    title: string;
    description: string;
    sections: string[];
    hasForm: boolean;
    hasDarkMode: boolean;
    pageCount: number;
  };
}

/**
 * Extract metadata from generated HTML for preview.
 */
export function extractSiteMeta(html: string): ScreenshotResult["meta"] {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch?.[1]?.trim() ?? h1Match?.[1]?.trim() ?? "Untitled Site";

  // Extract description from meta tag or first paragraph
  const metaDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const firstPMatch = html.match(/<p[^>]*>([^<]{20,200})/i);
  const description = metaDescMatch?.[1]?.trim() ?? firstPMatch?.[1]?.trim() ?? "";

  // Detect sections (h2 headings)
  const sectionMatches = html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi);
  const sections: string[] = [];
  for (const m of sectionMatches) {
    const text = m[1].trim();
    if (text.length > 1 && text.length < 80) {
      sections.push(text);
    }
  }

  // Detect features
  const hasForm = /<form[\s>]/i.test(html);
  const hasDarkMode = /dark:/i.test(html) || /dark\s*mode/i.test(html);

  // Count pages (Alpine.js SPA sections)
  const pageMatches = html.matchAll(/x-show\s*=\s*"currentPage\s*===\s*'([^']+)'/g);
  let pageCount = 0;
  for (const _ of pageMatches) {
    pageCount++;
  }
  if (pageCount === 0) pageCount = 1; // Single page

  log.info({
    service: "screenshot", action: "meta-extracted",
    title, sections: sections.length, hasForm, hasDarkMode, pageCount,
  });

  return { title, description, sections, hasForm, hasDarkMode, pageCount };
}

/**
 * Generate a screenshot URL using an external API.
 * Returns undefined if no screenshot service is configured.
 */
export function getScreenshotUrl(siteUrl: string, options?: {
  width?: number;
  height?: number;
  format?: "png" | "jpeg" | "webp";
}): string | undefined {
  const width = options?.width ?? 1280;
  const height = options?.height ?? 800;
  const format = options?.format ?? "png";

  // Use free screenshot APIs (no API key needed)
  // Option 1: microlink.io (generous free tier)
  const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(siteUrl)}&screenshot=true&meta=false&embed=screenshot.url&viewport.width=${width}&viewport.height=${height}&type=${format}`;

  log.info({ service: "screenshot", action: "url-generated", siteUrl, width, height });
  return microlinkUrl;
}

/**
 * Build a rich text preview for Telegram.
 * Used when screenshot is not available or as a complement.
 */
export function buildTextPreview(
  siteUrl: string,
  meta: ScreenshotResult["meta"],
  slug: string,
): string {
  const parts: string[] = [];

  // Header
  parts.push(`🌐 *${escapeMarkdown(meta.title)}*`);
  if (meta.description) {
    parts.push(`_${escapeMarkdown(meta.description.slice(0, 150))}_`);
  }
  parts.push("");

  // Stats line
  const stats: string[] = [];
  if (meta.pageCount > 1) stats.push(`📄 ${meta.pageCount} pages`);
  if (meta.sections.length > 0) stats.push(`📐 ${meta.sections.length} sections`);
  if (meta.hasForm) stats.push("📝 Form");
  if (meta.hasDarkMode) stats.push("🌙 Dark mode");
  if (stats.length > 0) {
    parts.push(stats.join(" • "));
    parts.push("");
  }

  // Sections preview
  if (meta.sections.length > 0) {
    const preview = meta.sections.slice(0, 5).map((s) => `  → ${escapeMarkdown(s)}`).join("\n");
    parts.push(`*Sections:*\n${preview}`);
    if (meta.sections.length > 5) {
      parts.push(`  _\\.\\.\\. and ${meta.sections.length - 5} more_`);
    }
    parts.push("");
  }

  // URL
  parts.push(`🔗 ${escapeMarkdown(siteUrl)}`);

  return parts.join("\n");
}

/**
 * Escape special characters for Telegram MarkdownV2.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

/**
 * Generate a full screenshot result for a site.
 */
export function generatePreview(
  siteUrl: string,
  slug: string,
  html: string,
): ScreenshotResult {
  const meta = extractSiteMeta(html);
  const imageUrl = getScreenshotUrl(siteUrl);
  const textPreview = buildTextPreview(siteUrl, meta, slug);

  return { imageUrl, textPreview, meta };
}
