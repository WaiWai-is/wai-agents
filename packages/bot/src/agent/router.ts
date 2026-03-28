/**
 * Intent Router — classifies user messages and routes to the right model.
 *
 * Pattern matching first (instant, free), LLM fallback for ambiguous messages.
 * Supports English and Russian natural language patterns.
 */

import type { Intent } from "@wai/core";

// Model routing: cheap for classification, expensive for complex tasks
const MODEL_MAP: Record<Intent, string> = {
  search: "claude-haiku-4-5",
  voice_summary: "claude-haiku-4-5",
  digest: "claude-haiku-4-5",
  action: "claude-haiku-4-5",
  build: "claude-haiku-4-5",
  site_edit: "claude-haiku-4-5",
  coach: "claude-haiku-4-5",
  chat: "claude-haiku-4-5",
};

/**
 * Site edit patterns — detect when user wants to modify their last built site.
 * These are checked ONLY when the user has a stored site (context-dependent).
 */
const SITE_EDIT_PATTERNS_EN = [
  /^(?:change|modify|update|edit|fix|adjust|tweak|alter|replace)\b/i,
  /^(?:add|remove|delete|insert|move|swap|rearrange)\s+(?:a\s+)?(?:section|page|button|form|image|header|footer|menu|nav|link|text|color|font|background)/i,
  /^(?:make|set)\s+(?:the|it|this)?\s*(?:bigger|smaller|darker|lighter|wider|narrower|bolder|thinner)/i,
  /^(?:make|set)\s+(?:the|it|this)?\s*(?:background|color|text|font|header|hero|footer)/i,
  /(?:change|switch|set)\s+(?:the\s+)?(?:colou?r|theme|background|font|style)\s+(?:to|of)/i,
  /(?:translate|convert)\s+(?:to|into|everything)/i,
  /(?:dark\s*mode|light\s*mode|dark\s*theme|light\s*theme)/i,
];

const SITE_EDIT_PATTERNS_RU = [
  /^(?:поменяй|измени|обнови|отредактируй|исправь|подправь)\b/i,
  /^(?:добавь|удали|убери|вставь|перемести|замени)\s/i,
  /^(?:сделай|поставь)\s+(?:фон|цвет|текст|шрифт|кнопк|секци|страниц)/i,
  /^(?:сделай)\s+(?:больше|меньше|темнее|светлее|шире|уже|жирнее)/i,
  /(?:поменяй|измени|смени)\s+(?:цвет|тему|фон|шрифт|стиль)/i,
  /(?:переведи|перевод)\s+(?:на|в|всё)/i,
  /(?:тёмн|темн|светл)[\p{L}]*\s+(?:тем|режим)/iu,
];

/**
 * Check if a message looks like a site edit request.
 * Returns true if pattern matches — caller must verify user has a stored site.
 */
export function isSiteEditIntent(message: string): boolean {
  const lower = message.toLowerCase().trim();

  // Short messages (< 5 words) with edit-like words are likely edits
  const wordCount = lower.split(/\s+/).length;

  for (const pattern of SITE_EDIT_PATTERNS_EN) {
    if (pattern.test(lower)) return true;
  }

  for (const pattern of SITE_EDIT_PATTERNS_RU) {
    if (pattern.test(lower)) return true;
  }

  // Short imperative messages with site-related words
  if (wordCount <= 8) {
    const siteWords = /colou?r|background|font|section|page|header|footer|hero|menu|button|form|image|logo|theme|dark|light|bigger|smaller|цвет|фон|шрифт|секци|страниц|кнопк|картинк|логотип|тема/i;
    const actionWords = /change|add|remove|make|set|update|switch|поменяй|добавь|удали|сделай|убери|измени/i;
    if (siteWords.test(lower) && actionWords.test(lower)) return true;
  }

  return false;
}

export function classifyIntent(message: string, hasVoice = false): Intent {
  if (hasVoice) return "voice_summary";

  const lower = message.toLowerCase().trim();

  // Slash commands
  if (/^\/(search|find|найди|поиск)/.test(lower)) return "search";
  if (/^\/(digest|дайджест|summary)/.test(lower)) return "digest";
  if (/^\/(build|deploy|создай\s*сайт|сделай)/.test(lower)) return "build";
  if (/^\/(edit)/.test(lower)) return "site_edit";
  if (/^\/(coach|teach|научи|промпт)/.test(lower)) return "coach";
  if (/^\/(send|email|calendar|отправь|письмо)/.test(lower)) return "action";

  // Natural language patterns (skip LLM for obvious intents)
  const searchPatterns = [
    "search for", "find ", "what did", "when did", "who said",
    "найди", "поищи", "что говорил", "что обсуждали", "когда был",
    "where is", "show me", "look for", "покажи",
  ];
  if (searchPatterns.some((p) => lower.startsWith(p) || lower.includes(` ${p}`))) {
    return "search";
  }

  const buildPatterns = [
    "build ", "create ", "deploy ", "make a site", "make a bot",
    "построй", "создай", "задеплой", "сделай сайт", "сделай бот",
  ];
  if (buildPatterns.some((p) => lower.includes(p))) return "build";

  // Site edit detection (checked here for classification, but handler also checks)
  if (isSiteEditIntent(message)) return "site_edit";

  const actionPatterns = [
    "send email", "send a message", "create event", "schedule",
    "отправь письмо", "отправь сообщение", "создай событие",
  ];
  if (actionPatterns.some((p) => lower.includes(p))) return "action";

  const digestPatterns = ["digest", "summary of", "what happened", "дайджест", "что было"];
  if (digestPatterns.some((p) => lower.includes(p))) return "digest";

  // Default to chat for everything else
  return "chat";
}

export function getModelForIntent(intent: Intent): string {
  return MODEL_MAP[intent] ?? MODEL_MAP.chat;
}
