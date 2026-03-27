import { describe, it, expect } from "vitest";
import { buildSoulPrompt } from "../soul.js";

describe("buildSoulPrompt", () => {
  it("includes all 5 layers", () => {
    const prompt = buildSoulPrompt({});
    expect(prompt).toContain("[Identity]");
    expect(prompt).toContain("[Rules]");
    expect(prompt).toContain("[Context]");
    expect(prompt).toContain("[Available actions]");
  });

  it("includes three superpowers", () => {
    const prompt = buildSoulPrompt({});
    expect(prompt).toContain("MEMORY");
    expect(prompt).toContain("BUILD");
    expect(prompt).toContain("CHIEF OF STAFF");
  });

  it("includes user name when provided", () => {
    const prompt = buildSoulPrompt({ userName: "Mik" });
    expect(prompt).toContain("Mik");
  });

  it("uses Russian instructions for ru language", () => {
    const prompt = buildSoulPrompt({ userLanguage: "ru" });
    expect(prompt).toContain("русском");
  });

  it("uses Spanish instructions for es language", () => {
    const prompt = buildSoulPrompt({ userLanguage: "es" });
    expect(prompt).toContain("español");
  });

  it("uses Chinese instructions for zh language", () => {
    const prompt = buildSoulPrompt({ userLanguage: "zh" });
    expect(prompt).toContain("中文");
  });

  it("uses default English for unknown language", () => {
    const prompt = buildSoulPrompt({ userLanguage: "xx" });
    expect(prompt).toContain("same language");
  });

  it("includes memory when provided", () => {
    const prompt = buildSoulPrompt({
      memory: {
        identity: ["Likes coffee", "Works at startup"],
        working: ["Project deadline Friday"],
        recalled: ["Alex mentioned budget $50k"],
      },
    });
    expect(prompt).toContain("[About the user]");
    expect(prompt).toContain("Likes coffee");
    expect(prompt).toContain("[Current context]");
    expect(prompt).toContain("Project deadline");
    expect(prompt).toContain("[Recalled memories]");
    expect(prompt).toContain("Alex mentioned");
  });

  it("excludes empty memory sections", () => {
    const prompt = buildSoulPrompt({
      memory: { identity: [], working: [], recalled: [] },
    });
    expect(prompt).not.toContain("[About the user]");
    expect(prompt).not.toContain("[Current context]");
    expect(prompt).not.toContain("[Recalled memories]");
  });

  it("is compact (under 5KB)", () => {
    const prompt = buildSoulPrompt({
      userName: "Test",
      memory: {
        identity: ["a", "b", "c"],
        working: ["d", "e"],
        recalled: ["f", "g", "h"],
      },
    });
    expect(prompt.length).toBeLessThan(5000);
  });
});
