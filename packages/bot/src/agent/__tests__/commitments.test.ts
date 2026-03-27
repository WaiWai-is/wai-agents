import { describe, it, expect } from "vitest";
import { detectCommitments, formatCommitments } from "../commitments.js";

describe("detectCommitments", () => {
  it("detects 'I'll send'", () => {
    const r = detectCommitments("I'll send you the report tomorrow");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].direction).toBe("i_promised");
  });

  it("detects 'I will prepare'", () => {
    const r = detectCommitments("I will prepare the presentation by Friday");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].direction).toBe("i_promised");
  });

  it("detects Russian 'я отправлю'", () => {
    const r = detectCommitments("Я отправлю тебе документ");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].direction).toBe("i_promised");
  });

  it("detects 'he said he'd'", () => {
    const r = detectCommitments("Alex said he'd send the contract by Monday");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });

  it("detects Russian 'обещал'", () => {
    const r = detectCommitments("Саша обещал прислать контракт");
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].direction).toBe("they_promised");
  });

  it("extracts deadline 'by Friday'", () => {
    const r = detectCommitments("I'll send it by Friday");
    expect(r[0]?.deadline?.toLowerCase()).toContain("friday");
  });

  it("returns empty for no commitments", () => {
    expect(detectCommitments("The weather is nice today")).toHaveLength(0);
  });

  it("detects voice message commitments", () => {
    expect(detectCommitments("", "Mik")).toHaveLength(0);
  });
});

describe("formatCommitments", () => {
  it("formats empty list", () => {
    expect(formatCommitments([])).toContain("No open");
  });

  it("formats i_promised", () => {
    const result = formatCommitments([
      { who: "me", what: "send report", direction: "i_promised", deadline: "Friday" },
    ]);
    expect(result).toContain("What you promised");
    expect(result).toContain("send report");
    expect(result).toContain("Friday");
  });

  it("formats they_promised", () => {
    const result = formatCommitments([
      { who: "Alex", what: "send contract", direction: "they_promised", deadline: null },
    ]);
    expect(result).toContain("What others promised");
    expect(result).toContain("Alex");
  });
});
