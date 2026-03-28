import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@wai/core", () => ({
  config: { anthropicApiKey: "test-key", cloudflareApiToken: "", cloudflareAccountId: "" },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn() },
  })),
}));

import {
  storeSite, getStoredSite, clearStoredSite,
  undoSite, redoSite, getSiteHistory,
} from "../site-builder.js";

beforeEach(() => {
  clearStoredSite("user-1");
});

describe("version history", () => {
  it("stores first version", () => {
    storeSite("user-1", "my-site", "<html>V1</html>", "Test site", "build", "Initial build");
    const stored = getStoredSite("user-1");
    expect(stored).toBeDefined();
    expect(stored!.html).toBe("<html>V1</html>");
  });

  it("stores multiple versions", () => {
    storeSite("user-1", "my-site", "<html>V1</html>", "Test", "build", "Build");
    storeSite("user-1", "my-site", "<html>V2</html>", "Test", "edit", "Changed color");
    storeSite("user-1", "my-site", "<html>V3</html>", "Test", "edit", "Added section");

    const history = getSiteHistory("user-1");
    expect(history.total).toBe(3);
    expect(history.current).toBe(3);
  });

  it("getStoredSite returns current version", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    expect(getStoredSite("user-1")!.html).toBe("<html>V2</html>");
  });
});

describe("undo", () => {
  it("undoes to previous version", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build", "Build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit", "Edit 1");

    const version = undoSite("user-1");
    expect(version).toBeDefined();
    expect(version!.html).toBe("<html>V1</html>");
    expect(version!.action).toBe("build");
  });

  it("returns undefined when at first version", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    expect(undoSite("user-1")).toBeUndefined();
  });

  it("returns undefined for unknown user", () => {
    expect(undoSite("unknown")).toBeUndefined();
  });

  it("can undo multiple times", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    storeSite("user-1", "s", "<html>V3</html>", "T", "edit");

    undoSite("user-1"); // V3 → V2
    const v1 = undoSite("user-1"); // V2 → V1
    expect(v1!.html).toBe("<html>V1</html>");
    expect(undoSite("user-1")).toBeUndefined(); // At start
  });

  it("getStoredSite reflects undo", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    undoSite("user-1");
    expect(getStoredSite("user-1")!.html).toBe("<html>V1</html>");
  });
});

describe("redo", () => {
  it("redoes to next version", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit", "Edit 1");
    undoSite("user-1"); // Go to V1

    const version = redoSite("user-1");
    expect(version).toBeDefined();
    expect(version!.html).toBe("<html>V2</html>");
    expect(version!.actionDetail).toBe("Edit 1");
  });

  it("returns undefined when at latest version", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    expect(redoSite("user-1")).toBeUndefined();
  });

  it("returns undefined for unknown user", () => {
    expect(redoSite("unknown")).toBeUndefined();
  });

  it("undo then redo returns to same version", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    undoSite("user-1");
    redoSite("user-1");
    expect(getStoredSite("user-1")!.html).toBe("<html>V2</html>");
  });
});

describe("undo + new edit discards future", () => {
  it("new version after undo trims future versions", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    storeSite("user-1", "s", "<html>V3</html>", "T", "edit");

    undoSite("user-1"); // V3 → V2
    undoSite("user-1"); // V2 → V1

    // New edit from V1 — should discard V2 and V3
    storeSite("user-1", "s", "<html>V4</html>", "T", "edit", "New edit");

    const history = getSiteHistory("user-1");
    expect(history.total).toBe(2); // V1 + V4
    expect(history.current).toBe(2);
    expect(getStoredSite("user-1")!.html).toBe("<html>V4</html>");

    // Redo should not work (future was discarded)
    expect(redoSite("user-1")).toBeUndefined();
  });
});

describe("getSiteHistory", () => {
  it("returns empty for unknown user", () => {
    const h = getSiteHistory("unknown");
    expect(h.total).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it("canUndo is false for single version", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    expect(getSiteHistory("user-1").canUndo).toBe(false);
  });

  it("canUndo is true for multiple versions", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    expect(getSiteHistory("user-1").canUndo).toBe(true);
  });

  it("canRedo is true after undo", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    undoSite("user-1");
    expect(getSiteHistory("user-1").canRedo).toBe(true);
  });

  it("includes version details", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build", "Initial");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit", "Changed color");

    const h = getSiteHistory("user-1");
    expect(h.versions).toHaveLength(2);
    expect(h.versions[0].action).toBe("build");
    expect(h.versions[0].actionDetail).toBe("Initial");
    expect(h.versions[1].action).toBe("edit");
    expect(h.versions[1].actionDetail).toBe("Changed color");
  });
});

describe("max versions limit", () => {
  it("trims to MAX_VERSIONS (20)", () => {
    for (let i = 0; i < 25; i++) {
      storeSite("user-1", "s", `<html>V${i}</html>`, "T", "edit", `Edit ${i}`);
    }
    const h = getSiteHistory("user-1");
    expect(h.total).toBeLessThanOrEqual(20);
  });
});

describe("clearStoredSite", () => {
  it("clears all history", () => {
    storeSite("user-1", "s", "<html>V1</html>", "T", "build");
    storeSite("user-1", "s", "<html>V2</html>", "T", "edit");
    clearStoredSite("user-1");
    expect(getStoredSite("user-1")).toBeUndefined();
    expect(getSiteHistory("user-1").total).toBe(0);
  });
});
