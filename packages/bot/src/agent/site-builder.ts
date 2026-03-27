/**
 * Site Builder — generate and deploy websites from Telegram prompts.
 *
 * Two modes:
 * 1. Simple: Claude generates single HTML file → deploy to Cloudflare Pages
 * 2. Agent: Claude Agent SDK builds multi-file site → deploy to Cloudflare Pages
 *
 * All sites deployed to {slug}.wai.computer via Cloudflare Pages.
 */

import Anthropic from "@anthropic-ai/sdk";
import { config, log } from "@wai/core";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const DOMAIN = "wai.computer";

/**
 * SITE_PROMPT — the core prompt that determines site quality.
 *
 * Uses Tailwind CSS (CDN), Google Fonts, and Lucide Icons for professional output.
 * Few-shot structure ensures consistent, high-quality results.
 */
const SITE_PROMPT = `You are an elite frontend developer creating production-ready websites.
Your sites rival those built by Lovable.dev and Vercel's v0 — stunning, interactive, and professional.

## Project: {description}

## Tech Stack (MANDATORY — use ALL of these)
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Google Fonts: Inter for body, plus one accent font that fits the project
- Lucide Icons via CDN: <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  Use <i data-lucide="icon-name"></i> then call lucide.createIcons() at the end
- Alpine.js for interactivity: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>

## Design System
- Color palette: define a cohesive palette in Tailwind config (primary, secondary, accent colors)
- Typography: Inter as base, headings with tracking-tight, proper hierarchy (text-4xl → text-base)
- Spacing: generous padding (py-20, px-6), sections with clear visual separation
- Rounded corners: rounded-2xl for cards, rounded-full for avatars/badges
- Shadows: shadow-lg for cards, shadow-xl on hover with transition
- Gradients: use gradient backgrounds for hero sections (from-primary-600 to-primary-800)
- Dark mode: implement dark mode toggle with Alpine.js + Tailwind dark: prefix

## Interactive Elements (use Alpine.js x-data, x-show, x-on, x-transition)
- Mobile hamburger menu with smooth slide-in animation
- Smooth scroll navigation between sections
- FAQ accordion with expand/collapse animations
- Tabs for content switching
- Modal dialogs for CTAs
- Form validation with real-time feedback
- Toast notifications
- Counter animations (numbers counting up on scroll)
- Image lightbox/gallery with navigation

## Required Sections (adapt to project context)
1. Hero — bold headline, subtext, CTA button with hover animation, optional background image/gradient
2. Features/Services — 3-4 cards with icons, hover lift effect
3. Social Proof — testimonials carousel or grid, star ratings
4. Pricing/Menu — clean pricing table or product grid
5. FAQ — accordion with smooth animations
6. Contact/CTA — form with validation, or strong call-to-action
7. Footer — links, social icons, "Made with Wai ✨"

## Quality Checklist
✓ Mobile-first responsive (looks perfect on phone AND desktop)
✓ Smooth transitions on ALL interactive elements (transition-all duration-300)
✓ Accessible (proper heading hierarchy, alt text, aria labels, focus states)
✓ Fast loading (no heavy images, use SVG/icons, lazy load if needed)
✓ Scroll animations (elements fade/slide in as user scrolls — use IntersectionObserver)
✓ Professional copywriting (generate realistic, compelling text — NOT "Lorem ipsum")
✓ Consistent spacing and alignment throughout
✓ Hover states on ALL clickable elements

## Output Rules
- Single HTML file with ALL CSS/JS inline or via CDN links above
- Start with <!DOCTYPE html> — no markdown wrapping, no explanation
- Tailwind config customization via <script> block before the CDN script
- Initialize Lucide icons and Alpine.js at end of body
- Generate REAL content that fits the project description — realistic names, prices, descriptions

Respond with ONLY the HTML code. No markdown, no explanation, no \`\`\` blocks.`;

/**
 * Generate a URL-safe slug from a name.
 */
export function generateSlug(name: string): string {
  const translit: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  let slug = "";
  for (const char of name.toLowerCase()) {
    if (translit[char]) slug += translit[char];
    else if (/[a-z0-9]/.test(char)) slug += char;
    else if (/[\s\-_]/.test(char)) slug += "-";
  }

  return slug.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50)
    || `site-${Math.random().toString(36).slice(2, 10)}`;
}

/** Progress callback type for real-time status updates. */
export type ProgressCallback = (stage: string, detail: string) => Promise<void>;

/** Site plan created during the planning stage. */
export interface SitePlan {
  sections: string[];
  colorScheme: string;
  typography: string;
  interactiveElements: string[];
  estimatedComplexity: "simple" | "medium" | "complex";
}

const PLAN_PROMPT = `You are a web architect. Given a project description, create a brief site plan.

Project: {description}

Respond in this EXACT JSON format (no markdown, no explanation):
{
  "sections": ["Hero with gradient background", "Features grid (3 cards)", "Testimonials carousel", "Pricing table", "FAQ accordion", "Contact form", "Footer"],
  "colorScheme": "Deep blue primary (#1e40af), warm amber accent (#f59e0b), slate gray text",
  "typography": "Inter for body, Playfair Display for headings",
  "interactiveElements": ["Mobile hamburger menu", "FAQ accordion", "Dark mode toggle", "Form validation", "Scroll animations"],
  "estimatedComplexity": "medium"
}`;

/**
 * Plan a site before generation — the "Lovable planning stage".
 * Returns a structured plan that guides generation.
 */
export async function planSite(description: string): Promise<SitePlan> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  log.info({ service: "site-builder", action: "planning", description: description.slice(0, 100) });

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    messages: [
      { role: "user", content: PLAN_PROMPT.replace("{description}", description.slice(0, 2000)) },
    ],
  });

  let text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  // Strip markdown wrapping if present
  if (text.startsWith("```")) {
    text = text.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
  }

  try {
    const plan = JSON.parse(text) as SitePlan;
    log.info({ service: "site-builder", action: "planned", sections: plan.sections.length, complexity: plan.estimatedComplexity });
    return plan;
  } catch {
    log.warn({ service: "site-builder", action: "plan-parse-failed", text: text.slice(0, 200) });
    // Return a sensible default plan
    return {
      sections: ["Hero", "Features", "Testimonials", "Contact", "Footer"],
      colorScheme: "Blue primary, white background",
      typography: "Inter for body",
      interactiveElements: ["Mobile menu", "Dark mode toggle"],
      estimatedComplexity: "medium",
    };
  }
}

/**
 * Clean raw Claude output into valid HTML.
 */
export function cleanHtmlOutput(raw: string): string | null {
  let html = raw.trim();

  // Strip markdown code blocks
  if (html.startsWith("```")) {
    html = html.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();
  }

  // Extract HTML if wrapped in other text
  if (!html.startsWith("<!DOCTYPE") && !html.startsWith("<html")) {
    const match = html.match(/<!DOCTYPE html[\s\S]*<\/html>/i);
    if (match) html = match[0];
    else return null;
  }

  return html;
}

/**
 * Generate HTML for a site using Claude with planning context.
 */
export async function generateSiteHtml(
  description: string,
  plan?: SitePlan,
  onProgress?: ProgressCallback,
): Promise<string | null> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  log.info({ service: "site-builder", action: "generating", description: description.slice(0, 100) });

  // Build prompt with optional plan context
  let prompt = SITE_PROMPT.replace("{description}", description.slice(0, 3000));
  if (plan) {
    prompt += `\n\n## Site Plan (follow this structure)
- Sections: ${plan.sections.join(" → ")}
- Color scheme: ${plan.colorScheme}
- Typography: ${plan.typography}
- Interactive elements: ${plan.interactiveElements.join(", ")}`;
  }

  await onProgress?.("generating", "Writing HTML, CSS, and JavaScript...");

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  const html = cleanHtmlOutput(raw);

  if (html) {
    log.info({ service: "site-builder", action: "generated", htmlSize: html.length });
  } else {
    log.warn({ service: "site-builder", action: "generation-failed", rawLength: raw.length });
  }

  return html;
}

/**
 * Generate with retry — if first attempt fails, retry with simplified prompt.
 */
export async function generateSiteHtmlWithRetry(
  description: string,
  plan?: SitePlan,
  onProgress?: ProgressCallback,
): Promise<string | null> {
  // Attempt 1: full generation
  const html = await generateSiteHtml(description, plan, onProgress);
  if (html) return html;

  // Attempt 2: retry with simplified instructions
  log.info({ service: "site-builder", action: "retrying", description: description.slice(0, 100) });
  await onProgress?.("retrying", "First attempt failed, retrying with adjusted approach...");

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const retryPrompt = `Generate a single-page website for: ${description.slice(0, 2000)}

Use Tailwind CSS CDN (<script src="https://cdn.tailwindcss.com"></script>).
Include: hero section, main content, footer with "Made with Wai ✨".
Mobile responsive. Modern design.

Respond with ONLY the HTML starting with <!DOCTYPE html>. No markdown.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8000,
    messages: [{ role: "user", content: retryPrompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  const retryHtml = cleanHtmlOutput(raw);

  if (retryHtml) {
    log.info({ service: "site-builder", action: "retry-succeeded", htmlSize: retryHtml.length });
  } else {
    log.error({ service: "site-builder", action: "retry-failed" });
  }

  return retryHtml;
}

/**
 * Deploy HTML to Cloudflare Pages.
 */
export async function deployToCloudflare(slug: string, html: string): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  const { cloudflareApiToken, cloudflareAccountId } = config;

  if (!cloudflareApiToken || !cloudflareAccountId) {
    return { success: false, error: "Cloudflare credentials not configured" };
  }

  log.info({ service: "site-builder", action: "deploying", slug });

  try {
    const crypto = await import("crypto");
    const contentHash = crypto.createHash("md5").update(html).digest("hex");
    const manifest = JSON.stringify({ "/index.html": contentHash });

    const formData = new FormData();
    formData.append("manifest", manifest);
    formData.append(contentHash, new Blob([html], { type: "text/html" }), "index.html");

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/pages/projects/wai-sites/deployments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cloudflareApiToken}` },
        body: formData,
      },
    );

    const data = await response.json() as { success: boolean; result?: { url: string } };

    if (data.success) {
      const url = `https://${slug}.${DOMAIN}`;
      log.info({ service: "site-builder", action: "deployed", slug, url });
      return { success: true, url };
    }

    log.error({ service: "site-builder", action: "deploy-failed", error: JSON.stringify(data) });
    return { success: false, error: "Cloudflare deploy failed" };
  } catch (error) {
    log.error({ service: "site-builder", action: "deploy-error", error: String(error) });
    return { success: false, error: String(error) };
  }
}

/**
 * Deploy a directory of files to Cloudflare Pages.
 * Reads all files recursively, builds manifest with MD5 hashes.
 */
export async function deployDirectoryToCloudflare(slug: string, dir: string): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  const { cloudflareApiToken, cloudflareAccountId } = config;

  if (!cloudflareApiToken || !cloudflareAccountId) {
    return { success: false, error: "Cloudflare credentials not configured" };
  }

  log.info({ service: "site-builder", action: "deploying-directory", slug, dir });

  try {
    const files = await collectFiles(dir, dir);

    if (files.length === 0) {
      return { success: false, error: "No files generated" };
    }

    const manifest: Record<string, string> = {};
    const formData = new FormData();

    for (const file of files) {
      const content = await readFile(file.absolutePath);
      const hash = createHash("md5").update(content).digest("hex");
      manifest[file.relativePath] = hash;
      formData.append(hash, new Blob([content]), file.relativePath.slice(1));
    }

    formData.append("manifest", JSON.stringify(manifest));

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/pages/projects/wai-sites/deployments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cloudflareApiToken}` },
        body: formData,
      },
    );

    const data = await response.json() as { success: boolean; result?: { url: string } };

    if (data.success) {
      const url = `https://${slug}.${DOMAIN}`;
      log.info({ service: "site-builder", action: "deployed-directory", slug, url, fileCount: files.length });
      return { success: true, url };
    }

    log.error({ service: "site-builder", action: "deploy-directory-failed", error: JSON.stringify(data) });
    return { success: false, error: "Cloudflare deploy failed" };
  } catch (error) {
    log.error({ service: "site-builder", action: "deploy-directory-error", error: String(error) });
    return { success: false, error: String(error) };
  }
}

/** Recursively collect files from a directory. */
async function collectFiles(dir: string, root: string): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: Array<{ absolutePath: string; relativePath: string }> = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, root));
    } else if (entry.isFile()) {
      const rel = "/" + fullPath.slice(root.length + 1);
      files.push({ absolutePath: fullPath, relativePath: rel });
    }
  }

  return files;
}

/**
 * Build a multi-file site using Claude Agent SDK.
 * Agent writes files to a temp directory, then we deploy all of them.
 */
export async function buildSiteWithAgent(description: string, slug: string): Promise<{
  success: boolean;
  url?: string;
  error?: string;
  fileCount?: number;
}> {
  const workdir = await mkdtemp(join(tmpdir(), "wai-site-"));

  log.info({ service: "site-builder", action: "agent-build-start", slug, workdir });

  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");

    for await (const message of query({
      prompt: `Create a production-quality static website. Write ALL files to the current directory.

Project: ${description}

Tech stack:
- Tailwind CSS via CDN (cdn.tailwindcss.com)
- Alpine.js for interactivity (cdn.jsdelivr.net/npm/alpinejs@3)
- Lucide Icons (unpkg.com/lucide@latest)
- Google Fonts: Inter + one accent font

Create these files:
1. index.html — main page with all sections (hero, features, testimonials, pricing, FAQ, contact, footer)
2. style.css — custom styles beyond Tailwind (animations, scroll effects)
3. app.js — Alpine.js components, scroll animations, form handling, dark mode toggle

Requirements:
- Mobile-first responsive design
- Dark mode support
- Smooth animations and transitions on all interactive elements
- Real content (not lorem ipsum) — generate compelling copy that fits the project
- Professional color palette defined in Tailwind config
- Accessible (aria labels, focus states, semantic HTML)
- Footer: "Made with Wai ✨"`,
      options: {
        cwd: workdir,
        allowedTools: ["Write", "Read"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 20,
        model: "claude-haiku-4-5",
      },
    })) {
      if ("result" in message) {
        log.info({ service: "site-builder", action: "agent-build-done", slug });
      }
    }

    const files = await collectFiles(workdir, workdir);
    log.info({ service: "site-builder", action: "agent-files-generated", slug, fileCount: files.length });

    if (files.length === 0) {
      return { success: false, error: "Agent produced no files" };
    }

    const result = await deployDirectoryToCloudflare(slug, workdir);
    return { ...result, fileCount: files.length };
  } catch (error) {
    log.error({ service: "site-builder", action: "agent-build-error", slug, error: String(error) });
    return { success: false, error: String(error) };
  } finally {
    // Clean up temp directory
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Result of buildSite with plan details. */
export interface BuildSiteResult {
  success: boolean;
  url?: string;
  slug?: string;
  error?: string;
  fileCount?: number;
  plan?: SitePlan;
}

/**
 * Build and deploy a site — the main entry point.
 *
 * Flow: Plan → Generate (with retry) → Deploy
 * Uses simple mode by default, agent mode for complex descriptions.
 */
export async function buildSite(
  description: string,
  name?: string,
  mode: "simple" | "agent" = "simple",
  onProgress?: ProgressCallback,
): Promise<BuildSiteResult> {
  const slug = generateSlug(name ?? description.split(".")[0] ?? description.slice(0, 30));

  if (mode === "agent") {
    const result = await buildSiteWithAgent(description, slug);
    return { ...result, slug };
  }

  // Step 1: Plan the site
  await onProgress?.("planning", "Analyzing your description and planning the site architecture...");
  const plan = await planSite(description);
  await onProgress?.("planned", `Plan ready: ${plan.sections.length} sections, ${plan.interactiveElements.length} interactive elements`);

  // Step 2: Generate HTML with retry on failure
  const html = await generateSiteHtmlWithRetry(description, plan, onProgress);
  if (!html) {
    return { success: false, slug, error: "Failed to generate HTML after 2 attempts", plan };
  }

  // Step 3: Deploy
  await onProgress?.("deploying", `Deploying to ${slug}.wai.computer...`);
  const result = await deployToCloudflare(slug, html);
  return { ...result, slug, fileCount: 1, plan };
}
