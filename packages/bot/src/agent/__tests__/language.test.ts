import { describe, it, expect } from "vitest";
import { detectLanguage } from "../language.js";

describe("detectLanguage", () => {
  it("detects English", () => expect(detectLanguage("Hello world")).toBe("en"));
  it("detects Russian", () => expect(detectLanguage("Привет мир")).toBe("ru"));
  it("detects Ukrainian", () => expect(detectLanguage("Привіт як справи")).toBe("uk"));
  it("detects Spanish", () => expect(detectLanguage("Hola el proyecto está listo para la presentación")).toBe("es"));
  it("detects French", () => expect(detectLanguage("Bonjour le projet est dans une phase avancée")).toBe("fr"));
  it("detects German", () => expect(detectLanguage("Das ist ein sehr gutes Projekt")).toBe("de"));
  it("detects Arabic", () => expect(detectLanguage("مرحبا كيف حالك")).toBe("ar"));
  it("detects Chinese", () => expect(detectLanguage("你好项目进展如何")).toBe("zh"));
  it("detects Korean", () => expect(detectLanguage("안녕하세요 프로젝트는 어떻게")).toBe("ko"));
  it("detects Japanese", () => expect(detectLanguage("こんにちは")).toBe("ja"));
  it("defaults to en for empty", () => expect(detectLanguage("")).toBe("en"));
  it("defaults to en for numbers", () => expect(detectLanguage("123456")).toBe("en"));
  it("defaults to en for emoji", () => expect(detectLanguage("👍🎉")).toBe("en"));
});
