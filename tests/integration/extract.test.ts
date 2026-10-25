import { describe, it, expect } from "vitest";
import { extractContent } from "../dist/extraction/extract.js";
import { recoverFile } from "../dist/recovery/recover.js";
import fs from "node:fs";

describe("extraction", () => {
  it("extracts pdf text", async () => {
    const r = await extractContent("tests/fixtures/sample.pdf", "tests/out2", ["text"]);
    expect(r.items.length).toBeGreaterThan(0);
    const txt = fs.readFileSync(r.items[0].path, "utf8");
    expect(txt).toContain("Hello FileMind");
  });
  it("extracts zip entries", async () => {
    // create zip
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    zip.addFile("a.txt", Buffer.from("hi"));
    zip.writeZip("tests/fixtures/sample.zip");
    const r = await extractContent("tests/fixtures/sample.zip", "tests/out2", ["archives"]);
    expect(r.items.length).toBeGreaterThan(0);
  });
});

describe("recovery", () => {
  it("recovers image", async () => {
    const r = await recoverFile("tests/fixtures/sample.png", "tests/out2", "image_decode");
    expect(r.classification).toBe("complete");
    expect(r.output_paths.length).toBe(1);
  });
  it("validates recovery", async () => {
    const { validateRecovery } = await import("../dist/recovery/validate.js");
    const r = await recoverFile("tests/fixtures/sample.png", "tests/out2", "image_decode");
    const v = await validateRecovery("tests/fixtures/sample.png", r.output_paths[0], "png");
    expect(v.decoding.success).toBe(true);
    expect(v.byte_identical).toBe(true);
  });
});
