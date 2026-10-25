import { describe, it, expect } from "vitest";
import { identifyFile } from "../dist/identification/identify.js";
import { analyzeIntegrity } from "../dist/analysis/integrity.js";

describe("identification", () => {
  it("identifies png", async () => {
    const r = await identifyFile("tests/fixtures/sample.png");
    expect(r.detected?.ext).toBe("png");
    expect(r.confidence).toBe("Strongly supported");
  });
  it("identifies pdf", async () => {
    const r = await identifyFile("tests/fixtures/sample.pdf");
    expect(r.detected?.ext).toBe("pdf");
  });
  it("text heuristic", async () => {
    const r = await identifyFile("tests/fixtures/sample.txt");
    expect(r.detected?.ext).toBe("txt");
  });
});

describe("integrity", () => {
  it("valid pdf", async () => {
    const r = await analyzeIntegrity("tests/fixtures/sample.pdf");
    expect(r.integrity).toBe("valid");
  });
  it("truncated pdf", async () => {
    const r = await analyzeIntegrity("tests/fixtures/trunc.pdf");
    expect(["invalid","incomplete"]).toContain(r.integrity);
  });
});
