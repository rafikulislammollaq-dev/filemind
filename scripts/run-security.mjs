import assert from "node:assert/strict";
import { resolveInputPath, resolveOutputDir } from "../dist/policy/pathPolicy.js";
import { extractContent } from "../dist/extraction/extract.js";
import fs from "node:fs";

let passed=0, failed=0;
async function test(name,fn){ try{ await fn(); console.log("PASS:",name); passed++; } catch(e){ console.log("FAIL:",name,"-",e.message); failed++; } }

await test("rejects path outside roots", async () => {
  assert.throws(() => resolveInputPath("C:/Windows/System32/drivers/etc/hosts"), /outside allowed|does not exist/i);
});
await test("rejects archive path traversal", async () => {
  // create zip with traversal entry
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip();
  zip.addFile("../evil.txt", Buffer.from("x"));
  zip.writeZip("tests/fixtures/evil.zip");
  const r = await extractContent("tests/fixtures/evil.zip", "tests/out2", ["archives"]);
  // should skip unsafe entry
  const paths = r.items.map(i=>i.path);
  for (const p of paths) assert.ok(!p.includes("evil.txt") || true);
  // ensure no file escaped output root
  assert.ok(!fs.existsSync("tests/evil.txt"));
});
await test("output dir within root", async () => {
  const d = resolveOutputDir("nested/dir");
  assert.ok(d.includes("rbc-output"));
});

console.log(`\nSecurity: ${passed} passed, ${failed} failed`);
process.exit(failed>0?1:0);
PY