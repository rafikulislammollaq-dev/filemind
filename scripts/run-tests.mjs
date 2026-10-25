import assert from "node:assert/strict";
import { identifyFile } from "../dist/identification/identify.js";
import { analyzeIntegrity } from "../dist/analysis/integrity.js";
import { extractContent } from "../dist/extraction/extract.js";
import { recoverFile } from "../dist/recovery/recover.js";
import { validateRecovery } from "../dist/recovery/validate.js";
import { resolveInputPath, resolveOutputDir } from "../dist/policy/pathPolicy.js";
import fs from "node:fs";

const P = (f) => "tests/fixtures/" + f;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("PASS:", name); passed++; }
  catch (e) { console.log("FAIL:", name, "-", e.message); failed++; }
}

await test("pathPolicy resolve input", async () => {
  const p = resolveInputPath(P("sample.txt"));
  assert.ok(p.includes("sample.txt"));
});

await test("pathPolicy rejects traversal", async () => {
  assert.throws(() => resolveInputPath("C:\\nope\\..\\..\\Windows\\System32\\x"), /not allowed|does not exist/i);
});

await test("identify png", async () => {
  const r = await identifyFile(P("sample.png"));
  assert.equal(r.detected.ext, "png");
  assert.equal(r.confidence, "Strongly supported");
});

await test("identify pdf", async () => {
  const r = await identifyFile(P("sample.pdf"));
  assert.equal(r.detected.ext, "pdf");
});

await test("identify text", async () => {
  const r = await identifyFile(P("sample.txt"));
  assert.equal(r.detected.ext, "txt");
});

await test("integrity valid pdf", async () => {
  const r = await analyzeIntegrity(P("sample.pdf"));
  assert.equal(r.integrity, "valid");
});

await test("integrity truncated pdf", async () => {
  const r = await analyzeIntegrity(P("trunc.pdf"));
  assert.ok(["invalid","incomplete"].includes(r.integrity));
});

await test("extract pdf text", async () => {
  const r = await extractContent(P("sample.pdf"), "tests/out2", ["text"]);
  assert.ok(r.items.length > 0);
  const txt = fs.readFileSync(r.items[0].path, "utf8");
  assert.ok(txt.includes("Hello FileMind"));
});

await test("extract zip", async () => {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip();
  zip.addFile("a.txt", Buffer.from("hi"));
  zip.writeZip(P("sample.zip"));
  const r = await extractContent(P("sample.zip"), "tests/out2", ["archives"]);
  assert.ok(r.items.length > 0);
});

await test("recover image", async () => {
  const r = await recoverFile(P("sample.png"), "tests/out2", "image_decode");
  assert.equal(r.classification, "complete");
  assert.equal(r.output_paths.length, 1);
});

await test("validate recovery image", async () => {
  const r = await recoverFile(P("sample.png"), "tests/out2", "image_decode");
  const v = await validateRecovery(P("sample.png"), r.output_paths[0], "png");
  assert.equal(v.decoding.success, true);
  assert.equal(v.byte_identical, true);
});

await test("sqlite metadata", async () => {
  const r = await (await import("../dist/metadata/metadata.js")).inspectMetadata(P("sample.sqlite"));
  const keys = r.fields.map(f=>f.key);
  assert.ok(keys.includes("sqlite.tables"));
  assert.ok(keys.includes("sqlite.integrity_check"));
});

await test("sqlite integrity", async () => {
  const r = await (await import("../dist/analysis/integrity.js")).analyzeIntegrity(P("sample.sqlite"));
  assert.equal(r.integrity, "valid");
});

await test("sqlite recovery", async () => {
  const r = await recoverFile(P("sample.sqlite"), "tests/out2", "sqlite_check");
  assert.equal(r.classification, "complete");
});

await test("wav metadata", async () => {
  // create a minimal wav
  const { writeFileSync } = await import("node:fs");
  const buf = Buffer.alloc(44);
  buf.write("RIFF",0); buf.writeUInt32LE(36,4); buf.write("WAVE",8);
  buf.write("fmt ",12); buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20); buf.writeUInt16LE(1,22);
  buf.writeUInt32LE(8000,24); buf.writeUInt32LE(16000,28); buf.writeUInt16LE(2,32); buf.writeUInt16LE(16,34);
  buf.write("data",36); buf.writeUInt32LE(0,40);
  writeFileSync(P("sample.wav"), buf);
  const r = await (await import("../dist/metadata/metadata.js")).inspectMetadata(P("sample.wav"));
  const keys = r.fields.map(f=>f.key);
  assert.ok(keys.includes("audio.sample_rate"));
});

await test("mp4 box parse", async () => {
  // minimal mp4 with ftyp box
  const { writeFileSync } = await import("node:fs");
  const ftyp = Buffer.alloc(20);
  ftyp.writeUInt32BE(20,0); ftyp.write("ftyp",4); ftyp.write("isom",8);
  writeFileSync(P("sample.mp4"), ftyp);
  const r = await (await import("../dist/metadata/metadata.js")).inspectMetadata(P("sample.mp4"));
  const keys = r.fields.map(f=>f.key);
  assert.ok(keys.includes("mp4.top_level_boxes"));
});
await test("pdf text recovery on valid pdf", async () => {
  const r = await recoverFile(P("sample.pdf"), "tests/out2", "pdf_text_extraction");
  assert.equal(r.status, "success");
  assert.ok(r.output_paths.length > 0);
});

await test("get job report", async () => {
  const { investigateFile, getJob } = await import("../dist/orchestration/investigate.js");
  const r = await investigateFile(P("sample.txt"), "investigate", 8, 30000, 10*1024*1024, "tests/out2");
  const j = getJob(r.job_id);
  assert.ok(j);
  assert.equal(j.job_id, r.job_id);
});
await test("pdf repair", async () => {
  const r = await recoverFile(P("trunc.pdf"), "tests/out2", "pdf_repair");
  // may be failed or partial; just ensure no crash and output path if success
  assert.ok(r.classification);
});

await test("image transcode", async () => {
  const r = await recoverFile(P("sample.png"), "tests/out2", "image_transcode");
  assert.equal(r.classification, "structural_repair");
  assert.ok(r.output_paths.length > 0);
});
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);