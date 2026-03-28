import { describe, it, expect } from "vitest";
import { classifyIntent, getModelForIntent, isSiteEditIntent } from "../router.js";

describe("classifyIntent", () => {
  // Slash commands
  it("classifies /search as search", () => {
    expect(classifyIntent("/search budget")).toBe("search");
  });

  it("classifies /найди as search", () => {
    expect(classifyIntent("/найди бюджет")).toBe("search");
  });

  it("classifies /digest as digest", () => {
    expect(classifyIntent("/digest")).toBe("digest");
  });

  it("classifies /build as build", () => {
    expect(classifyIntent("/build landing page")).toBe("build");
  });

  it("classifies /edit as site_edit", () => {
    expect(classifyIntent("/edit change colors")).toBe("site_edit");
  });

  it("classifies /coach as coach", () => {
    expect(classifyIntent("/coach")).toBe("coach");
  });

  it("classifies /send as action", () => {
    expect(classifyIntent("/send email to Alex")).toBe("action");
  });

  // Voice
  it("classifies voice as voice_summary", () => {
    expect(classifyIntent("any text", true)).toBe("voice_summary");
  });

  // Natural language
  it("classifies 'what did Alex say' as search", () => {
    expect(classifyIntent("What did Alex say about pricing?")).toBe("search");
  });

  it("classifies 'найди' as search", () => {
    expect(classifyIntent("Найди что обсуждали")).toBe("search");
  });

  it("classifies 'build a site' as build", () => {
    expect(classifyIntent("Build a landing page for my cafe")).toBe("build");
  });

  it("classifies 'создай' as build", () => {
    expect(classifyIntent("Создай сайт для кафе")).toBe("build");
  });

  it("classifies 'send email' as action", () => {
    expect(classifyIntent("Send email to Alex about meeting")).toBe("action");
  });

  it("classifies general text as chat", () => {
    expect(classifyIntent("Hello, how are you?")).toBe("chat");
  });

  it("classifies empty as chat", () => {
    expect(classifyIntent("")).toBe("chat");
  });

  // Site edit via natural language
  it("classifies 'change the color' as site_edit", () => {
    expect(classifyIntent("Change the color to blue")).toBe("site_edit");
  });

  it("classifies 'поменяй цвет' as site_edit", () => {
    expect(classifyIntent("Поменяй цвет на синий")).toBe("site_edit");
  });

  it("classifies 'add a section' as site_edit", () => {
    expect(classifyIntent("Add a pricing section")).toBe("site_edit");
  });

  it("classifies 'добавь секцию' as site_edit", () => {
    expect(classifyIntent("Добавь секцию с отзывами")).toBe("site_edit");
  });

  it("classifies 'dark mode' as site_edit", () => {
    expect(classifyIntent("dark mode")).toBe("site_edit");
  });
});

describe("isSiteEditIntent", () => {
  // English patterns
  it("detects 'change the color to blue'", () => {
    expect(isSiteEditIntent("Change the color to blue")).toBe(true);
  });

  it("detects 'add a pricing section'", () => {
    expect(isSiteEditIntent("Add a pricing section")).toBe(true);
  });

  it("detects 'remove the footer'", () => {
    expect(isSiteEditIntent("Remove the footer")).toBe(true);
  });

  it("detects 'make it bigger'", () => {
    expect(isSiteEditIntent("Make the header bigger")).toBe(true);
  });

  it("detects 'switch to dark theme'", () => {
    expect(isSiteEditIntent("dark theme")).toBe(true);
  });

  it("detects 'translate to Russian'", () => {
    expect(isSiteEditIntent("Translate everything to Russian")).toBe(true);
  });

  it("detects 'update the background'", () => {
    expect(isSiteEditIntent("Update the background color")).toBe(true);
  });

  // Russian patterns
  it("detects 'поменяй цвет'", () => {
    expect(isSiteEditIntent("Поменяй цвет на красный")).toBe(true);
  });

  it("detects 'добавь кнопку'", () => {
    expect(isSiteEditIntent("Добавь кнопку заказа")).toBe(true);
  });

  it("detects 'удали секцию'", () => {
    expect(isSiteEditIntent("Удали секцию с отзывами")).toBe(true);
  });

  it("detects 'сделай фон темнее'", () => {
    expect(isSiteEditIntent("Сделай фон темнее")).toBe(true);
  });

  it("detects 'измени шрифт'", () => {
    expect(isSiteEditIntent("Измени шрифт заголовков")).toBe(true);
  });

  it("detects 'переведи на английский'", () => {
    expect(isSiteEditIntent("Переведи на английский")).toBe(true);
  });

  it("detects 'тёмная тема'", () => {
    expect(isSiteEditIntent("Сделай тёмную тему")).toBe(true);
  });

  // Short imperative with site words
  it("detects 'make background blue'", () => {
    expect(isSiteEditIntent("make background blue")).toBe(true);
  });

  it("detects 'change font color'", () => {
    expect(isSiteEditIntent("change font to serif")).toBe(true);
  });

  // NOT site edits
  it("does not detect general questions", () => {
    expect(isSiteEditIntent("How are you today?")).toBe(false);
  });

  it("does not detect search queries", () => {
    expect(isSiteEditIntent("What did Alex say about pricing?")).toBe(false);
  });

  it("does not detect build commands", () => {
    expect(isSiteEditIntent("Build me a landing page for my cafe")).toBe(false);
  });

  it("does not detect empty string", () => {
    expect(isSiteEditIntent("")).toBe(false);
  });

  it("does not detect random text", () => {
    expect(isSiteEditIntent("Today is a beautiful day for coding")).toBe(false);
  });
});

describe("getModelForIntent", () => {
  it("returns a model for every intent including site_edit", () => {
    const intents = ["search", "voice_summary", "digest", "action", "build", "site_edit", "coach", "chat"] as const;
    for (const intent of intents) {
      const model = getModelForIntent(intent);
      expect(model).toBeTruthy();
      expect(model).toContain("claude");
    }
  });
});
