import { describe, it, expect } from "vitest";
import { resolveInputPath, resolveOutputDir } from "../dist/policy/pathPolicy.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("pathPolicy", () => {
  it("rejects traversal", () => {
    expect(() => resolveInputPath("C:\\nonexistent\\..\\..\\Windows\\System32\\drivers\\etc\\hosts")).toThrow();
  });
  it("allows existing fixture", () => {
    const p = resolveInputPath("tests/fixtures/sample.txt");
    expect(p).toContain("sample.txt");
  });
  it("output dir inside root", () => {
    const d = resolveOutputDir("sub");
    expect(d.startsWith(process.env.FILEMIND_OUTPUT_DIR || os.tmpdir())).toBe(true);
  });
});
