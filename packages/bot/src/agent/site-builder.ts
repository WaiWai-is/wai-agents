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
const TRACKING_ENDPOINT = "https://telegram.waiwai.is/api/v1/track";
const FORM_ENDPOINT = "https://telegram.waiwai.is/api/v1/form";

/**
 * Inject analytics snippet into generated HTML.
 * Inserts lightweight tracking JS before </body>.
 * Privacy-first: no cookies, no personal data, ~200 bytes.
 */
export function injectAnalytics(html: string, slug: string): string {
  const snippet = `<script>
(function(){var s='${slug}',e='${TRACKING_ENDPOINT}';var d={s:s,p:location.hash||'/',r:document.referrer||'direct',u:navigator.userAgent};try{navigator.sendBeacon(e,JSON.stringify(d))}catch(x){var i=new Image();i.src=e+'?d='+encodeURIComponent(JSON.stringify(d));}window.addEventListener('hashchange',function(){d.p=location.hash||'/';try{navigator.sendBeacon(e,JSON.stringify(d))}catch(x){}});})();
</script>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${snippet}\n</body>`);
  }
  return html + snippet;
}

/**
 * Inject form handler into generated HTML.
 * Intercepts all form submissions, POSTs data to API → forwarded to Telegram.
 */
export function injectFormHandler(html: string, slug: string): string {
  // Only inject if the site has forms
  if (!/<form[\s>]/i.test(html)) return html;

  const snippet = `<script>
(function(){var slug='${slug}',ep='${FORM_ENDPOINT}';document.addEventListener('submit',function(e){var f=e.target;if(f.tagName!=='FORM')return;e.preventDefault();var d={},fd=new FormData(f);fd.forEach(function(v,k){d[k]=v;});var b=f.querySelector('[type=submit]');if(b){b.disabled=true;b.textContent='Sending...';}fetch(ep,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug:slug,formId:f.id||'form',fields:d,page:location.hash||'/',ua:navigator.userAgent})}).then(function(r){return r.json()}).then(function(){if(b){b.textContent='✓ Sent!';b.style.background='#22c55e';b.style.color='#fff';}var m=document.createElement('div');m.style.cssText='position:fixed;top:20px;right:20px;background:#22c55e;color:#fff;padding:16px 24px;border-radius:12px;font-weight:600;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);';m.textContent='✓ Message sent!';document.body.appendChild(m);setTimeout(function(){m.remove()},4000);f.reset();setTimeout(function(){if(b){b.disabled=false;b.textContent='Send';}},3000);}).catch(function(){if(b){b.disabled=false;b.textContent='Send';}alert('Failed to send. Please try again.');});},true);})();
</script>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${snippet}\n</body>`);
  }
  return html + snippet;
}

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
 * MULTIPAGE_PROMPT — for sites with multiple pages and SPA routing.
 *
 * Uses Alpine.js hash-based routing: all pages in one HTML file,
 * navigation shows/hides page sections with smooth transitions.
 * Works as a static file on Cloudflare Pages — no server needed.
 */
const MULTIPAGE_PROMPT = `You are an elite frontend developer creating a MULTI-PAGE website as a Single Page Application.

## Project: {description}

## Pages to create: {pages}

## Tech Stack (MANDATORY)
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Google Fonts: Inter for body, plus one accent font
- Lucide Icons: <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
- Alpine.js: <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>

## SPA Routing Architecture (CRITICAL — follow exactly)

Use Alpine.js with hash-based routing. The navigation and page switching MUST work like this:

\`\`\`html
<body x-data="{ currentPage: window.location.hash.slice(1) || 'home' }"
      @hashchange.window="currentPage = window.location.hash.slice(1) || 'home'">

  <!-- Navigation (visible on all pages) -->
  <nav>
    <a href="#home" :class="currentPage === 'home' && 'text-primary-600 font-bold'">Home</a>
    <a href="#about" :class="currentPage === 'about' && 'text-primary-600 font-bold'">About</a>
    <a href="#services" :class="currentPage === 'services' && 'text-primary-600 font-bold'">Services</a>
    <a href="#contact" :class="currentPage === 'contact' && 'text-primary-600 font-bold'">Contact</a>
  </nav>

  <!-- Page: Home -->
  <main x-show="currentPage === 'home'" x-transition:enter="transition ease-out duration-300"
        x-transition:enter-start="opacity-0 translate-y-4" x-transition:enter-end="opacity-100 translate-y-0">
    <!-- Full page content here -->
  </main>

  <!-- Page: About -->
  <main x-show="currentPage === 'about'" x-transition:enter="transition ease-out duration-300"
        x-transition:enter-start="opacity-0 translate-y-4" x-transition:enter-end="opacity-100 translate-y-0">
    <!-- Full page content here -->
  </main>

  <!-- Shared footer (visible on all pages) -->
  <footer>...</footer>
</body>
\`\`\`

## Design System
- Same as single-page: cohesive color palette, Inter typography, generous spacing
- Navigation: sticky top bar with active page highlighting
- Page transitions: fade-in with slight upward slide (300ms)
- Mobile: hamburger menu that works across all pages
- Dark mode toggle that persists across page changes (use Alpine.js store)

## Each Page Must Have
- Full, rich content (NOT placeholder — realistic text, images, data)
- Proper heading hierarchy starting with h1
- At least 3-4 sections with varied layouts
- Responsive design (mobile + desktop)
- Scroll-to-top when changing pages

## Navigation Requirements
- Sticky/fixed navigation visible on ALL pages
- Active page link highlighted (different color/weight)
- Mobile hamburger menu with smooth slide-in
- Logo/brand name links to #home
- Smooth page transitions (Alpine.js x-transition)
- Hash-based routing (#home, #about, #services, #contact)
- Default to #home when no hash

## Output Rules
- Single HTML file — ALL pages within one file using x-show routing
- Start with <!DOCTYPE html>
- No markdown wrapping, no explanation
- Generate REAL content for each page
- Footer with "Made with Wai ✨" visible on all pages

Respond with ONLY the HTML code. No markdown, no explanation.`;

/** Page definitions for multi-page sites. */
export interface PageDefinition {
  id: string;
  title: string;
  description: string;
}

/**
 * Detect if a description implies a multi-page site.
 * Returns page definitions if multi-page, undefined if single-page.
 */
export function detectMultiPage(description: string): PageDefinition[] | undefined {
  const lower = description.toLowerCase();

  // Explicit multi-page indicators
  const multiPagePatterns = [
    /(\d+)\s*(?:pages?|страниц|стр)/i,
    /multi[- ]?page/i,
    /многостраничн/i,
    /несколько\s*страниц/i,
    /pages?:\s*(.+)/i,
    /страницы?:\s*(.+)/i,
  ];

  let isMultiPage = multiPagePatterns.some((p) => p.test(description));

  // Also detect implicit multi-page from listing page names
  const pageKeywords = [
    { id: "home", keywords: ["home", "главная", "main"] },
    { id: "about", keywords: ["about", "о нас", "о компании", "about us"] },
    { id: "services", keywords: ["services", "услуги", "сервисы"] },
    { id: "portfolio", keywords: ["portfolio", "портфолио", "работы", "projects", "проекты"] },
    { id: "contact", keywords: ["contact", "контакты", "связь", "contact us"] },
    { id: "pricing", keywords: ["pricing", "цены", "тарифы", "prices"] },
    { id: "blog", keywords: ["blog", "блог", "news", "новости"] },
    { id: "team", keywords: ["team", "команда", "наша команда"] },
    { id: "faq", keywords: ["faq", "вопросы", "чаво"] },
    { id: "gallery", keywords: ["gallery", "галерея", "фото"] },
  ];

  const matchedPages: PageDefinition[] = [];
  for (const page of pageKeywords) {
    if (page.keywords.some((kw) => lower.includes(kw))) {
      matchedPages.push({
        id: page.id,
        title: page.id.charAt(0).toUpperCase() + page.id.slice(1),
        description: `${page.id} page`,
      });
    }
  }

  // If 3+ page-like keywords detected, treat as multi-page
  if (matchedPages.length >= 3) {
    isMultiPage = true;
  }

  if (!isMultiPage) return undefined;

  // If we detected pages from keywords, use them
  if (matchedPages.length >= 2) {
    // Ensure "home" is always first
    if (!matchedPages.some((p) => p.id === "home")) {
      matchedPages.unshift({ id: "home", title: "Home", description: "home page" });
    }
    log.info({ service: "site-builder", action: "multipage-detected", pageCount: matchedPages.length, pages: matchedPages.map((p) => p.id).join(",") });
    return matchedPages;
  }

  // Default pages for generic multi-page request
  log.info({ service: "site-builder", action: "multipage-default" });
  return [
    { id: "home", title: "Home", description: "Landing/hero page" },
    { id: "about", title: "About", description: "About page" },
    { id: "services", title: "Services", description: "Services/features page" },
    { id: "contact", title: "Contact", description: "Contact page with form" },
  ];
}

/**
 * Generate a multi-page SPA HTML file.
 */
export async function generateMultiPageHtml(
  description: string,
  pages: PageDefinition[],
  plan?: SitePlan,
  onProgress?: ProgressCallback,
  extraHints?: string,
  memoryContext?: string,
): Promise<string | null> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const pagesStr = pages.map((p) => `- ${p.title} (#${p.id}): ${p.description}`).join("\n");

  log.info({ service: "site-builder", action: "generating-multipage", pageCount: pages.length });

  let prompt = MULTIPAGE_PROMPT
    .replace("{description}", description.slice(0, 3000))
    .replace("{pages}", pagesStr);

  if (memoryContext) {
    prompt += `\n\n${memoryContext}\n\nApply these preferences to ALL pages.`;
  }

  if (plan) {
    prompt += `\n\n## Design Direction
- Color scheme: ${plan.colorScheme}
- Typography: ${plan.typography}
- Interactive: ${plan.interactiveElements.join(", ")}`;
  }

  if (extraHints) {
    prompt += `\n\n## Additional Requirements\n${extraHints}`;
  }

  await onProgress?.("generating", `Creating ${pages.length}-page SPA with routing...`);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 32000, // Multi-page needs more tokens
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  const html = cleanHtmlOutput(raw);

  if (html) {
    log.info({ service: "site-builder", action: "multipage-generated", htmlSize: html.length, pages: pages.length });
  } else {
    log.warn({ service: "site-builder", action: "multipage-failed", rawLength: raw.length });
  }

  return html;
}

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
  extraHints?: string,
  memoryContext?: string,
): Promise<string | null> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  log.info({ service: "site-builder", action: "generating", description: description.slice(0, 100) });

  // Build prompt with optional plan context
  let prompt = SITE_PROMPT.replace("{description}", description.slice(0, 3000));

  // Inject user memory (brand, style, preferences)
  if (memoryContext) {
    prompt += `\n\n${memoryContext}\n\nApply these preferences to the site design.`;
  }

  if (plan) {
    prompt += `\n\n## Site Plan (follow this structure)
- Sections: ${plan.sections.join(" → ")}
- Color scheme: ${plan.colorScheme}
- Typography: ${plan.typography}
- Interactive elements: ${plan.interactiveElements.join(", ")}`;
  }

  if (extraHints) {
    prompt += `\n\n## Additional Requirements\n${extraHints}`;
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
  extraHints?: string,
  memoryContext?: string,
): Promise<string | null> {
  // Attempt 1: full generation
  const html = await generateSiteHtml(description, plan, onProgress, extraHints, memoryContext);
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

/** A single version of a site. */
export interface SiteVersion {
  slug: string;
  html: string;
  description: string;
  action: "build" | "edit";
  actionDetail?: string;
  createdAt: Date;
}

/** Per-user site history. */
interface UserSiteHistory {
  versions: SiteVersion[];
  currentIndex: number;
}

const MAX_VERSIONS = 20;

/**
 * In-memory site version history per user.
 * Supports undo/redo by navigating version index.
 */
const siteHistoryStore = new Map<string, UserSiteHistory>();

function ensureHistory(userId: string): UserSiteHistory {
  if (!siteHistoryStore.has(userId)) {
    siteHistoryStore.set(userId, { versions: [], currentIndex: -1 });
  }
  return siteHistoryStore.get(userId)!;
}

/** Store a new version (from build or edit). Trims future versions if undo was used. */
export function storeSite(userId: string, slug: string, html: string, description: string, action: "build" | "edit" = "build", actionDetail?: string) {
  const history = ensureHistory(userId);

  // If we undid and then make a new change, discard future versions
  if (history.currentIndex < history.versions.length - 1) {
    history.versions = history.versions.slice(0, history.currentIndex + 1);
  }

  history.versions.push({
    slug, html, description, action,
    actionDetail,
    createdAt: new Date(),
  });

  // Limit history size
  if (history.versions.length > MAX_VERSIONS) {
    history.versions.shift();
  }

  history.currentIndex = history.versions.length - 1;
  log.info({ service: "site-builder", action: "version-stored", userId, slug, version: history.currentIndex + 1, total: history.versions.length });
}

/** Retrieve the current version of a user's site. */
export function getStoredSite(userId: string): { slug: string; html: string; description: string } | undefined {
  const history = siteHistoryStore.get(userId);
  if (!history || history.currentIndex < 0) return undefined;
  return history.versions[history.currentIndex];
}

/** Clear all site history for a user. */
export function clearStoredSite(userId: string) {
  siteHistoryStore.delete(userId);
}

/** Undo: go back one version. Returns the restored version or undefined if at start. */
export function undoSite(userId: string): SiteVersion | undefined {
  const history = siteHistoryStore.get(userId);
  if (!history || history.currentIndex <= 0) return undefined;

  history.currentIndex--;
  const version = history.versions[history.currentIndex];
  log.info({ service: "site-builder", action: "undo", userId, version: history.currentIndex + 1, total: history.versions.length });
  return version;
}

/** Redo: go forward one version. Returns the restored version or undefined if at end. */
export function redoSite(userId: string): SiteVersion | undefined {
  const history = siteHistoryStore.get(userId);
  if (!history || history.currentIndex >= history.versions.length - 1) return undefined;

  history.currentIndex++;
  const version = history.versions[history.currentIndex];
  log.info({ service: "site-builder", action: "redo", userId, version: history.currentIndex + 1, total: history.versions.length });
  return version;
}

/** Get version history info for a user. */
export function getSiteHistory(userId: string): {
  total: number;
  current: number;
  canUndo: boolean;
  canRedo: boolean;
  versions: Array<{ action: string; actionDetail?: string; createdAt: Date }>;
} {
  const history = siteHistoryStore.get(userId);
  if (!history || history.versions.length === 0) {
    return { total: 0, current: 0, canUndo: false, canRedo: false, versions: [] };
  }

  return {
    total: history.versions.length,
    current: history.currentIndex + 1,
    canUndo: history.currentIndex > 0,
    canRedo: history.currentIndex < history.versions.length - 1,
    versions: history.versions.map((v) => ({
      action: v.action,
      actionDetail: v.actionDetail,
      createdAt: v.createdAt,
    })),
  };
}

const EDIT_PROMPT = `You are editing an existing website. Apply the user's requested change to the HTML below.

## Current HTML
{currentHtml}

## User's Edit Request
{editRequest}

## Rules
- Apply ONLY the requested change — do NOT rewrite unrelated sections
- Keep all existing content, structure, styling, and JavaScript intact
- If the change affects colors/theme, update ALL related elements consistently
- If adding a new section, place it in the logical position
- Preserve the Tailwind CSS classes, Alpine.js directives, and Lucide icons
- Return the COMPLETE updated HTML starting with <!DOCTYPE html>
- No markdown wrapping, no explanation — ONLY the HTML`;

/**
 * Edit an existing site by applying a change request.
 * Uses the diffs approach — Claude sees existing HTML and applies targeted changes.
 */
export async function editSite(
  currentHtml: string,
  editRequest: string,
  onProgress?: ProgressCallback,
): Promise<string | null> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  log.info({ service: "site-builder", action: "editing", editRequest: editRequest.slice(0, 100), htmlSize: currentHtml.length });
  await onProgress?.("editing", `Applying: "${editRequest.slice(0, 60)}${editRequest.length > 60 ? "..." : ""}"...`);

  // Truncate HTML if extremely large to fit context
  const maxHtmlSize = 60000;
  const htmlForPrompt = currentHtml.length > maxHtmlSize
    ? currentHtml.slice(0, maxHtmlSize) + "\n<!-- ... truncated for context -->"
    : currentHtml;

  const prompt = EDIT_PROMPT
    .replace("{currentHtml}", htmlForPrompt)
    .replace("{editRequest}", editRequest);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  const html = cleanHtmlOutput(raw);

  if (html) {
    log.info({ service: "site-builder", action: "edited", newHtmlSize: html.length });
  } else {
    log.warn({ service: "site-builder", action: "edit-failed", rawLength: raw.length });
  }

  return html;
}

/**
 * Edit and redeploy a site — the edit entry point.
 *
 * Flow: Retrieve stored site → Edit HTML → Deploy
 */
export async function editAndDeploySite(
  userId: string,
  editRequest: string,
  onProgress?: ProgressCallback,
): Promise<BuildSiteResult> {
  const stored = getStoredSite(userId);
  if (!stored) {
    return { success: false, error: "No site to edit. Use /build first to create one." };
  }

  // Extract memories from edit (learn preferences)
  const { extractMemoriesFromEdit } = await import("./memory.js");
  extractMemoriesFromEdit(userId, editRequest);

  await onProgress?.("editing", `Editing ${stored.slug}.wai.computer...`);

  const updatedHtml = await editSite(stored.html, editRequest, onProgress);
  if (!updatedHtml) {
    return { success: false, slug: stored.slug, error: "Failed to apply edit" };
  }

  // Deploy updated version
  await onProgress?.("deploying", `Redeploying ${stored.slug}.wai.computer...`);
  const result = await deployToCloudflare(stored.slug, updatedHtml);

  if (result.success) {
    // Store as new version with edit details
    storeSite(userId, stored.slug, updatedHtml, stored.description, "edit", editRequest.slice(0, 100));
  }

  return { ...result, slug: stored.slug, fileCount: 1 };
}

/** Result of buildSite with plan details. */
export interface BuildSiteResult {
  success: boolean;
  url?: string;
  slug?: string;
  error?: string;
  fileCount?: number;
  plan?: SitePlan;
  quality?: import("./validator.js").QualityReport;
}

/**
 * Build and deploy a site — the main entry point.
 *
 * Flow: Plan → Generate (with retry) → Deploy → Store for edits
 * Uses simple mode by default, agent mode for complex descriptions.
 */
export async function buildSite(
  description: string,
  name?: string,
  mode: "simple" | "agent" = "simple",
  onProgress?: ProgressCallback,
  userId?: string,
): Promise<BuildSiteResult> {
  const slug = generateSlug(name ?? description.split(".")[0] ?? description.slice(0, 30));

  if (mode === "agent") {
    const result = await buildSiteWithAgent(description, slug);
    return { ...result, slug };
  }

  // Step 1: Detect template or plan from scratch
  const { detectTemplate } = await import("./templates.js");
  const template = detectTemplate(description);

  let plan: SitePlan;
  let extraPromptHints = "";

  if (template) {
    plan = template.plan;
    extraPromptHints = template.promptHints;
    await onProgress?.("planning", `Using "${template.name}" template — ${plan.sections.length} sections, ${plan.interactiveElements.length} interactive elements`);
    log.info({ service: "site-builder", action: "template-matched", template: template.id, slug });
  } else {
    await onProgress?.("planning", "Analyzing your description and planning the site architecture...");
    plan = await planSite(description);
    await onProgress?.("planned", `Plan ready: ${plan.sections.length} sections, ${plan.interactiveElements.length} interactive elements`);
  }

  // Step 2: Load user memory for personalization
  let memoryContext = "";
  if (userId) {
    const { buildMemoryContext, extractMemoriesFromBuild } = await import("./memory.js");
    memoryContext = buildMemoryContext(userId);
    if (memoryContext) {
      log.info({ service: "site-builder", action: "memory-injected", userId, memorySize: memoryContext.length });
    }
    // Extract memories from this build (async, fire-and-forget)
    extractMemoriesFromBuild(userId, description, slug);
  }

  // Step 3: Check if multi-page site requested
  const pages = detectMultiPage(description);
  let html: string | null;

  if (pages) {
    await onProgress?.("generating", `Creating ${pages.length}-page SPA: ${pages.map((p) => p.title).join(", ")}...`);
    html = await generateMultiPageHtml(description, pages, plan, onProgress, extraPromptHints, memoryContext);
    // Retry with single-page if multi-page fails
    if (!html) {
      log.warn({ service: "site-builder", action: "multipage-retry-single", slug });
      await onProgress?.("retrying", "Multi-page generation failed, creating single-page version...");
      html = await generateSiteHtmlWithRetry(description, plan, onProgress, extraPromptHints, memoryContext);
    }
  } else {
    html = await generateSiteHtmlWithRetry(description, plan, onProgress, extraPromptHints, memoryContext);
  }

  if (!html) {
    return { success: false, slug, error: "Failed to generate HTML after 2 attempts", plan };
  }

  // Step 4: Validate quality
  const { validateSiteQuality } = await import("./validator.js");
  const quality = validateSiteQuality(html);
  await onProgress?.("validated", `Quality: ${quality.score}/100 ${quality.passed ? "✅" : "⚠️"}`);
  log.info({ service: "site-builder", action: "quality-check", slug, score: quality.score, issues: quality.issues.length });

  // Step 5: Inject SEO + analytics + form handler
  const { injectSeoTags } = await import("./seo.js");
  html = injectSeoTags(html, slug, description);
  html = injectAnalytics(html, slug);
  html = injectFormHandler(html, slug);

  // Step 6: Deploy
  await onProgress?.("deploying", `Deploying to ${slug}.wai.computer...`);
  const result = await deployToCloudflare(slug, html);

  // Step 7: Store version + register owner for form notifications
  if (result.success && userId) {
    storeSite(userId, slug, html, description, "build", description.slice(0, 100));
    const { registerSiteOwner } = await import("./forms.js");
    registerSiteOwner(slug, userId);
  }

  return { ...result, slug, fileCount: 1, plan, quality };
}
