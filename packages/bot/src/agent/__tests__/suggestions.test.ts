import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@wai/core", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  generateSuggestions, buildSuggestionKeyboard, parseSuggestionCallback,
  getSuggestionEditCommand, formatSuggestionsText,
  storeSuggestions, getStoredSuggestions, clearSuggestions,
} from "../suggestions.js";
import type { QualityReport } from "../validator.js";

// Minimal mocks for report types
const goodQuality: QualityReport = {
  score: 95, passed: true, issues: [],
  stats: { htmlSize: 5000, hasTailwind: true, hasAlpineJs: true, hasLucideIcons: true, hasGoogleFonts: true, headingCount: 5, sectionCount: 6, hasForm: true, hasFooter: true, hasViewport: true, hasDarkMode: true, interactiveCount: 10 },
};

const basicQuality: QualityReport = {
  score: 65, passed: true, issues: [],
  stats: { htmlSize: 2000, hasTailwind: true, hasAlpineJs: false, hasLucideIcons: false, hasGoogleFonts: false, headingCount: 2, sectionCount: 2, hasForm: false, hasFooter: true, hasViewport: true, hasDarkMode: false, interactiveCount: 1 },
};

describe("generateSuggestions", () => {
  it("suggests dark mode when missing", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    expect(suggestions.some((s) => s.id === "add-dark-mode")).toBe(true);
  });

  it("suggests contact form when missing", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    expect(suggestions.some((s) => s.id === "add-contact-form")).toBe(true);
  });

  it("returns useful suggestions with basic quality", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
    for (const s of suggestions) {
      expect(s.editCommand.length).toBeGreaterThan(0);
    }
  });

  it("does NOT suggest dark mode when already present", () => {
    const suggestions = generateSuggestions("<html></html>", goodQuality);
    expect(suggestions.some((s) => s.id === "add-dark-mode")).toBe(false);
  });

  it("suggests FAQ when missing", () => {
    const suggestions = generateSuggestions("<html><body><h2>Hero</h2></body></html>");
    expect(suggestions.some((s) => s.id === "add-faq")).toBe(true);
  });

  it("does NOT suggest FAQ when present", () => {
    const suggestions = generateSuggestions('<html><body><h2>FAQ</h2></body></html>');
    expect(suggestions.some((s) => s.id === "add-faq")).toBe(false);
  });

  it("returns max 3 suggestions", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it("sorts by priority (highest first)", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].priority).toBeLessThanOrEqual(suggestions[i - 1].priority);
    }
  });

  it("each suggestion has editCommand", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    for (const s of suggestions) {
      expect(s.editCommand.length).toBeGreaterThan(10);
    }
  });

  it("returns suggestions for perfect site", () => {
    const html = '<html><body><section id="faq"><h2>FAQ</h2></section><section id="pricing"><h2>Pricing</h2></section></body></html>';
    const suggestions = generateSuggestions(html, goodQuality);
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe("buildSuggestionKeyboard", () => {
  it("returns empty for no suggestions", () => {
    expect(buildSuggestionKeyboard([])).toEqual([]);
  });

  it("creates buttons with emoji labels", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    const keyboard = buildSuggestionKeyboard(suggestions);
    expect(keyboard.length).toBe(1);
    for (const btn of keyboard[0]) {
      expect(btn.text).toBeTruthy();
      expect(btn.callback_data).toMatch(/^suggest:/);
    }
  });
});

describe("parseSuggestionCallback", () => {
  it("parses valid callback", () => {
    expect(parseSuggestionCallback("suggest:add-dark-mode")).toBe("add-dark-mode");
  });

  it("returns undefined for invalid", () => {
    expect(parseSuggestionCallback("other:data")).toBeUndefined();
    expect(parseSuggestionCallback("")).toBeUndefined();
  });
});

describe("getSuggestionEditCommand", () => {
  it("returns edit command for known suggestion", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    const first = suggestions[0];
    const cmd = getSuggestionEditCommand(suggestions, first.id);
    expect(cmd).toBeTruthy();
    expect(cmd!.length).toBeGreaterThan(10);
  });

  it("returns undefined for unknown ID", () => {
    expect(getSuggestionEditCommand([], "unknown")).toBeUndefined();
  });
});

describe("formatSuggestionsText", () => {
  it("returns empty for no suggestions", () => {
    expect(formatSuggestionsText([])).toBe("");
  });

  it("includes suggestion labels", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    const text = formatSuggestionsText(suggestions);
    expect(text).toContain("Suggestions");
    for (const s of suggestions) {
      expect(text).toContain(s.label);
    }
  });

  it("includes /edit hint", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    const text = formatSuggestionsText(suggestions);
    expect(text).toContain("/edit");
  });
});

describe("suggestion storage", () => {
  beforeEach(() => clearSuggestions("user-1"));

  it("stores and retrieves suggestions", () => {
    const suggestions = generateSuggestions("<html></html>", basicQuality);
    storeSuggestions("user-1", suggestions);
    expect(getStoredSuggestions("user-1")).toEqual(suggestions);
  });

  it("returns empty for unknown user", () => {
    expect(getStoredSuggestions("unknown")).toEqual([]);
  });

  it("clears suggestions", () => {
    storeSuggestions("user-1", [{ id: "test", emoji: "🔥", label: "Test", editCommand: "test", priority: 50, category: "ux" }]);
    clearSuggestions("user-1");
    expect(getStoredSuggestions("user-1")).toEqual([]);
  });
});
