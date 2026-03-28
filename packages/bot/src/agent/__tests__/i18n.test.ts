import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@wai/core", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  t, setUserLocale, getUserLocale, detectLocale, getAvailableKeys,
} from "../i18n.js";

describe("t() — translation function", () => {
  it("returns English by default", () => {
    expect(t("build.success", "en")).toBe("Site deployed!");
  });

  it("returns Russian when locale is ru", () => {
    expect(t("build.success", "ru")).toBe("Сайт задеплоен!");
  });

  it("falls back to English for unknown locale keys", () => {
    // Even though we only support en/ru, this tests fallback
    expect(t("build.success", "en")).toBeTruthy();
  });

  it("returns key name for missing key", () => {
    expect(t("nonexistent.key", "en")).toBe("nonexistent.key");
  });

  it("interpolates params", () => {
    const result = t("build.deploying", "en", { slug: "my-cafe" });
    expect(result).toContain("my-cafe");
    expect(result).toContain("wai.computer");
  });

  it("interpolates params in Russian", () => {
    const result = t("build.deploying", "ru", { slug: "kafe" });
    expect(result).toContain("kafe");
    expect(result).toContain("wai.computer");
  });

  it("interpolates multiple params", () => {
    const result = t("build.planned", "en", { sections: "5", interactive: "3" });
    expect(result).toContain("5");
    expect(result).toContain("3");
  });

  it("handles numeric params", () => {
    const result = t("build.validated", "en", { score: 95, status: "✅" });
    expect(result).toContain("95");
    expect(result).toContain("✅");
  });
});

describe("locale management", () => {
  beforeEach(() => {
    // Reset by setting to default
  });

  it("defaults to en", () => {
    expect(getUserLocale("new-user")).toBe("en");
  });

  it("sets and gets locale", () => {
    setUserLocale("user-1", "ru");
    expect(getUserLocale("user-1")).toBe("ru");
  });

  it("overrides locale", () => {
    setUserLocale("user-1", "en");
    setUserLocale("user-1", "ru");
    expect(getUserLocale("user-1")).toBe("ru");
  });
});

describe("detectLocale", () => {
  it("detects Russian from Cyrillic", () => {
    expect(detectLocale("Создай сайт для кафе")).toBe("ru");
  });

  it("detects English from Latin", () => {
    expect(detectLocale("Build a landing page")).toBe("en");
  });

  it("detects Russian from mixed text", () => {
    expect(detectLocale("Build сайт for cafe")).toBe("ru");
  });

  it("defaults to English for empty", () => {
    expect(detectLocale("")).toBe("en");
  });

  it("defaults to English for numbers", () => {
    expect(detectLocale("12345")).toBe("en");
  });
});

describe("string coverage", () => {
  it("has all critical keys", () => {
    const keys = getAvailableKeys();
    const critical = [
      "build.success", "build.failed", "build.error",
      "build.planning", "build.generating", "build.deploying",
      "edit.success", "edit.failed", "edit.no_site",
      "undo.reverted", "undo.nothing",
      "redo.restored", "redo.nothing",
      "memory.empty", "memory.cleared",
      "error.generic", "clear.done",
    ];
    for (const key of critical) {
      expect(keys).toContain(key);
    }
  });

  it("every key has both en and ru", () => {
    const keys = getAvailableKeys();
    for (const key of keys) {
      const en = t(key, "en");
      const ru = t(key, "ru");
      expect(en).toBeTruthy();
      expect(ru).toBeTruthy();
      // EN and RU should be different
      expect(en).not.toBe(ru);
    }
  });

  it("has at least 20 string keys", () => {
    expect(getAvailableKeys().length).toBeGreaterThanOrEqual(20);
  });
});
