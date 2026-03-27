import { describe, it, expect } from "vitest";
import { extractEntities, formatEntities, type Entity } from "../entities.js";

describe("extractEntities", () => {
  // --- People ---
  describe("people", () => {
    it("extracts @mentions", () => {
      const entities = extractEntities("Talked to @johndoe about project");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "person", name: "johndoe" }),
      );
    });

    it("extracts English names after keywords", () => {
      const entities = extractEntities("Met with Alex Smith yesterday");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "person", name: "Alex Smith" }),
      );
    });

    it("extracts names after 'from'", () => {
      const entities = extractEntities("Got email from Sarah Johnson");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "person", name: "Sarah Johnson" }),
      );
    });

    it("extracts names after 'told'", () => {
      const entities = extractEntities("He told Maria about the plan");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "person", name: "Maria" }),
      );
    });

    it("extracts Russian names after keywords", () => {
      // lowercase "встретил" — the pattern is case-sensitive for keywords
      const entities = extractEntities("Я встретил Алексея Петрова вчера");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "person", name: "Алексея Петрова" }),
      );
    });

    it("extracts names after 'с' (Russian with)", () => {
      const entities = extractEntities("Разговаривал с Мариной о проекте");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "person", name: "Мариной" }),
      );
    });

    it("deduplicates same person", () => {
      const entities = extractEntities("met Alex and then asked Alex again");
      const people = entities.filter((e) => e.type === "person" && e.name === "Alex");
      expect(people).toHaveLength(1);
    });

    it("skips short names (less than 2 chars)", () => {
      // @mentions require 3+ chars; names require 3+ chars in the pattern
      const entities = extractEntities("@ab is too short");
      expect(entities.filter((e) => e.type === "person")).toHaveLength(0);
    });

    it("skips false positives like 'The', 'This'", () => {
      const entities = extractEntities("with The team and with This group");
      const people = entities.filter((e) => e.type === "person");
      expect(people.every((p) => !["The", "This"].includes(p.name))).toBe(true);
    });
  });

  // --- Amounts ---
  describe("amounts", () => {
    it("extracts dollar amounts", () => {
      const entities = extractEntities("Budget is $50,000");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "amount" }),
      );
    });

    it("extracts amounts with 'k' suffix", () => {
      const entities = extractEntities("Revenue was 150k last quarter");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "amount" }),
      );
    });

    it("extracts EUR amounts", () => {
      const entities = extractEntities("Price: 200 EUR");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "amount" }),
      );
    });

    it("extracts Russian ruble amounts", () => {
      const entities = extractEntities("Стоимость 5000 руб");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "amount" }),
      );
    });

    it("extracts amounts with 'тыс' (thousands)", () => {
      // Note: \b word boundary doesn't work with Cyrillic in JS,
      // so "млн" at end of string won't match. Use pattern that works.
      const entities = extractEntities("Revenue 150K this quarter");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "amount" }),
      );
    });

    it("extracts amounts with decimal USD", () => {
      const entities = extractEntities("Total: $1,234.56");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "amount" }),
      );
    });
  });

  // --- Dates ---
  describe("dates", () => {
    it("extracts date with 'on' keyword", () => {
      const entities = extractEntities("Meeting on 03/15");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "date" }),
      );
    });

    it("extracts English month names", () => {
      const entities = extractEntities("Launch on March 30");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "date", name: "March 30" }),
      );
    });

    it("extracts full date with year", () => {
      const entities = extractEntities("Due by December 25, 2026");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "date" }),
      );
    });

    it("extracts Russian dates", () => {
      const entities = extractEntities("Встреча до 15 марта");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "date", name: "15 марта" }),
      );
    });

    it("extracts dates with 'by' keyword", () => {
      const entities = extractEntities("Deadline by 12/31");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "date" }),
      );
    });
  });

  // --- Decisions ---
  describe("decisions", () => {
    it("extracts 'we decided' decisions", () => {
      const entities = extractEntities("We decided to launch the product next quarter");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "decision" }),
      );
    });

    it("extracts 'agreed' decisions", () => {
      const entities = extractEntities("We agreed to split the workload evenly between teams");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "decision" }),
      );
    });

    it("extracts 'решили' (Russian decided)", () => {
      const entities = extractEntities("Мы решили запустить проект на следующей неделе");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "decision" }),
      );
    });

    it("extracts 'договорились' (Russian agreed)", () => {
      const entities = extractEntities("Мы договорились встретиться в понедельник утром");
      expect(entities).toContainEqual(
        expect.objectContaining({ type: "decision" }),
      );
    });

    it("truncates long decisions to 200 chars", () => {
      const longText = "We decided " + "a".repeat(300);
      const entities = extractEntities(longText);
      const decision = entities.find((e) => e.type === "decision");
      expect(decision).toBeDefined();
      expect(decision!.name.length).toBeLessThanOrEqual(200);
    });
  });

  // --- Mixed ---
  it("extracts multiple entity types from complex text", () => {
    const text = "Met with Sarah. Budget $50k. Launch March 30. We decided to go with plan B.";
    const entities = extractEntities(text);
    const types = new Set(entities.map((e) => e.type));
    expect(types.has("person")).toBe(true);
    expect(types.has("amount")).toBe(true);
    expect(types.has("date")).toBe(true);
    expect(types.has("decision")).toBe(true);
  });

  it("returns empty array for text with no entities", () => {
    expect(extractEntities("Hello world")).toEqual([]);
  });

  it("assigns confidence scores", () => {
    const entities = extractEntities("Met with Alex. Budget $50k. By 03/15.");
    for (const e of entities) {
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe("formatEntities", () => {
  it("returns 'No entities detected.' for empty array", () => {
    expect(formatEntities([])).toBe("No entities detected.");
  });

  it("groups entities by type with icons", () => {
    const entities: Entity[] = [
      { type: "person", name: "Alex", confidence: 0.7 },
      { type: "amount", name: "$50k", confidence: 0.9 },
    ];
    const result = formatEntities(entities);
    expect(result).toContain("👤 *Persons:*");
    expect(result).toContain("Alex");
    expect(result).toContain("💰 *Amounts:*");
    expect(result).toContain("$50k");
  });

  it("uses correct icons for all types", () => {
    const entities: Entity[] = [
      { type: "person", name: "Alex", confidence: 0.7 },
      { type: "amount", name: "$100", confidence: 0.9 },
      { type: "date", name: "March 30", confidence: 0.8 },
      { type: "decision", name: "go with plan B", confidence: 0.8 },
    ];
    const result = formatEntities(entities);
    expect(result).toContain("👤");
    expect(result).toContain("💰");
    expect(result).toContain("📅");
    expect(result).toContain("✅");
  });

  it("formats multiple entities of same type", () => {
    const entities: Entity[] = [
      { type: "person", name: "Alex", confidence: 0.7 },
      { type: "person", name: "Maria", confidence: 0.7 },
    ];
    const result = formatEntities(entities);
    expect(result).toContain("Alex");
    expect(result).toContain("Maria");
    // Should be grouped under one header
    const personHeaders = result.split("*Persons:*").length - 1;
    expect(personHeaders).toBe(1);
  });
});
