/**
 * Internationalization — bot messages in user's language.
 *
 * Supports English and Russian with fallback to English.
 * Language is detected from user's message or stored in memory.
 * All user-facing strings go through t() function.
 */

import { log } from "@wai/core";

export type Locale = "en" | "ru";

/** All translatable strings. */
const STRINGS: Record<string, Record<Locale, string>> = {
  // Build flow
  "build.planning": {
    en: "Analyzing your description and planning the site architecture...",
    ru: "Анализирую описание и планирую архитектуру сайта...",
  },
  "build.template_matched": {
    en: 'Using "{name}" template — {sections} sections, {interactive} interactive elements',
    ru: 'Использую шаблон "{name}" — {sections} секций, {interactive} интерактивных элементов',
  },
  "build.planned": {
    en: "Plan ready: {sections} sections, {interactive} interactive elements",
    ru: "План готов: {sections} секций, {interactive} интерактивных элементов",
  },
  "build.generating": {
    en: "Writing HTML, CSS, and JavaScript...",
    ru: "Пишу HTML, CSS и JavaScript...",
  },
  "build.generating_multipage": {
    en: "Creating {count}-page SPA with routing...",
    ru: "Создаю {count}-страничный SPA с роутингом...",
  },
  "build.retrying": {
    en: "First attempt failed, retrying with adjusted approach...",
    ru: "Первая попытка не удалась, пробую другой подход...",
  },
  "build.validated": {
    en: "Quality: {score}/100 {status}",
    ru: "Качество: {score}/100 {status}",
  },
  "build.deploying": {
    en: "Deploying to {slug}.wai.computer...",
    ru: "Деплою на {slug}.wai.computer...",
  },
  "build.progress": {
    en: "Building your site...",
    ru: "Строю ваш сайт...",
  },
  "build.success": {
    en: "Site deployed!",
    ru: "Сайт задеплоен!",
  },
  "build.failed": {
    en: "Try a more detailed description.",
    ru: "Попробуйте более подробное описание.",
  },
  "build.error": {
    en: "Failed to build site. Please try again.",
    ru: "Не удалось создать сайт. Попробуйте ещё раз.",
  },

  // Edit flow
  "edit.editing": {
    en: "Editing your site...",
    ru: "Редактирую ваш сайт...",
  },
  "edit.success": {
    en: "Site updated!",
    ru: "Сайт обновлён!",
  },
  "edit.failed": {
    en: "Failed to apply edit",
    ru: "Не удалось применить изменение",
  },
  "edit.no_site": {
    en: "No site to edit. Use /build first to create one.",
    ru: "Нет сайта для редактирования. Сначала используйте /build.",
  },

  // Undo/Redo
  "undo.reverted": {
    en: "Reverted to version {current}/{total}",
    ru: "Откат к версии {current}/{total}",
  },
  "undo.nothing": {
    en: "Nothing to undo. This is the first version.",
    ru: "Нечего отменять. Это первая версия.",
  },
  "redo.restored": {
    en: "Restored version {current}/{total}",
    ru: "Восстановлена версия {current}/{total}",
  },
  "redo.nothing": {
    en: "Nothing to redo. This is the latest version.",
    ru: "Нечего восстанавливать. Это последняя версия.",
  },

  // Memory
  "memory.empty": {
    en: "I don't have any memories about you yet. Start using /build and I'll learn your preferences!",
    ru: "У меня пока нет воспоминаний о вас. Начните использовать /build, и я выучу ваши предпочтения!",
  },
  "memory.header": {
    en: "What I remember about you:",
    ru: "Что я помню о вас:",
  },
  "memory.cleared": {
    en: "All memories cleared. Fresh start!",
    ru: "Вся память очищена. Начинаем заново!",
  },

  // Stats
  "stats.no_site": {
    en: "No site to show stats for. Use /build first.",
    ru: "Нет сайта для показа статистики. Сначала используйте /build.",
  },
  "stats.no_visitors": {
    en: "No visitors yet. Share your site link to get traffic!",
    ru: "Пока нет посетителей. Поделитесь ссылкой!",
  },

  // Export
  "export.packaging": {
    en: "Packaging your site...",
    ru: "Упаковываю ваш сайт...",
  },
  "export.no_site": {
    en: "No site to export. Use /build first.",
    ru: "Нет сайта для экспорта. Сначала используйте /build.",
  },
  "export.ready": {
    en: "Ready to deploy anywhere!",
    ru: "Готов к деплою куда угодно!",
  },

  // General
  "error.generic": {
    en: "Something went wrong. Please try again.",
    ru: "Произошла ошибка. Попробуйте ещё раз.",
  },
  "clear.done": {
    en: "Conversation cleared. Fresh start!",
    ru: "Диалог очищен. Начинаем заново!",
  },
  "no_site": {
    en: "No site found. Use /build first.",
    ru: "Сайт не найден. Сначала используйте /build.",
  },
};

/** Per-user language preference. */
const userLocales = new Map<string, Locale>();

/**
 * Set a user's preferred locale.
 */
export function setUserLocale(userId: string, locale: Locale) {
  userLocales.set(userId, locale);
  log.debug({ service: "i18n", action: "locale-set", userId, locale });
}

/**
 * Get a user's locale (default: "en").
 */
export function getUserLocale(userId: string): Locale {
  return userLocales.get(userId) ?? "en";
}

/**
 * Detect locale from text content.
 */
export function detectLocale(text: string): Locale {
  // Check for Cyrillic characters
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  return "en";
}

/**
 * Translate a string key with optional interpolation.
 */
export function t(key: string, locale: Locale, params?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  if (!entry) {
    log.warn({ service: "i18n", action: "missing-key", key, locale });
    return key;
  }

  let text = entry[locale] ?? entry.en;

  // Interpolate params: {name} → value
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }

  return text;
}

/**
 * Get all available string keys.
 */
export function getAvailableKeys(): string[] {
  return Object.keys(STRINGS);
}
