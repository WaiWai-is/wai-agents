import { describe, it, expect } from "vitest";
import { classifyIntent, getModelForIntent } from "../router.js";

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
});

describe("getModelForIntent", () => {
  it("returns a model for every intent", () => {
    const intents = ["search", "voice_summary", "digest", "action", "build", "coach", "chat"] as const;
    for (const intent of intents) {
      const model = getModelForIntent(intent);
      expect(model).toBeTruthy();
      expect(model).toContain("claude");
    }
  });
});
