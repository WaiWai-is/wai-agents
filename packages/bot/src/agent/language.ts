/**
 * Language detection — 13 languages without LLM.
 */

export function detectLanguage(text: string): string {
  if (!text?.trim()) return "en";

  // Remove URLs, numbers
  const clean = text.replace(/https?:\/\/\S+|\d+/g, "").replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, "").trim();
  if (!clean) return "en";

  // Count by script
  let cyrillic = 0, latin = 0, arabic = 0, cjk = 0, hangul = 0, japanese = 0;

  for (const char of clean) {
    if (char >= "\u0400" && char <= "\u04ff") cyrillic++;
    else if ((char >= "A" && char <= "z")) latin++;
    else if (char >= "\u0600" && char <= "\u06ff") arabic++;
    else if (char >= "\u4e00" && char <= "\u9fff") cjk++;
    else if (char >= "\uac00" && char <= "\ud7a3") hangul++;
    else if (char >= "\u3040" && char <= "\u30ff") japanese++;
  }

  const total = cyrillic + latin + arabic + cjk + hangul + japanese;
  if (total === 0) return "en";

  // Dominant script
  if (cyrillic / total > 0.3) {
    // Distinguish Ukrainian from Russian
    const hasUkrainian = /[іїєґ]/.test(clean.toLowerCase());
    return hasUkrainian ? "uk" : "ru";
  }
  if (arabic / total > 0.3) return "ar";
  if (cjk / total > 0.3) return "zh";
  if (hangul / total > 0.3) return "ko";
  if (japanese / total > 0.3) return "ja";

  // Latin script — detect specific language
  const lower = clean.toLowerCase();
  const words = new Set(lower.split(/\s+/));

  const langMarkers: [string, string[]][] = [
    ["es", ["el", "la", "los", "las", "de", "del", "que", "por", "con", "para", "está"]],
    ["fr", ["le", "la", "les", "des", "est", "une", "que", "dans", "pour", "avec"]],
    ["de", ["der", "die", "das", "und", "ist", "ein", "eine", "nicht", "mit", "auf"]],
    ["pt", ["uma", "não", "para", "com", "são", "mais", "está", "muito"]],
    ["it", ["il", "che", "non", "una", "sono", "per", "della", "con", "questo"]],
    ["tr", ["bir", "ve", "bu", "için", "ile", "var", "olan", "gibi"]],
  ];

  for (const [lang, markers] of langMarkers) {
    if (markers.filter((m) => words.has(m)).length >= 2) return lang;
  }

  return "en";
}
