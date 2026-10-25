import fs from "node:fs";
import path from "node:path";
import { resolveInputPath, resolveOutputDir } from "../policy/pathPolicy.js";
import { identifyFile } from "../identification/identify.js";
import { jadxAvailable, jadxDecompile } from "../adapters/jadxAdapter.js";
import { rizinAvailable, rizinInfo, rizinStrings } from "../adapters/rizinAdapter.js";

export async function analyzeSoftware(inputPath: string, outputDir?: string, timeoutMs = 300000) {
  const p = resolveInputPath(inputPath);
  const id = await identifyFile(p);
  const ext = id.detected?.ext ?? id.extension;
  const outDir = resolveOutputDir(outputDir);
  const jobDir = path.join(outDir, `software-${Date.now()}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const result: any = {
    path: p,
    detected: id.detected,
    tools: { jadx: await jadxAvailable(), rizin: await rizinAvailable() },
    actions: [],
    outputs: [],
    warnings: [],
    limitations: [],
  };

  const isApkOrJar = ext === "apk" || ext === "jar" || ext === "zip" && (id.structural_observations || []).some((s: string) => s.includes("APK") || s.includes("JAR"));
  // detect apk/jar by zip entries
  let isApk = false, isJar = false;
  if (ext === "zip" || ext === "apk" || ext === "jar") {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(p);
      const names = zip.getEntries().map(e => e.entryName);
      if (names.includes("AndroidManifest.xml")) isApk = true;
      if (names.includes("META-INF/MANIFEST.MF")) isJar = true;
    } catch {}
  }

  if ((ext === "apk" || isApk) && result.tools.jadx) {
    const ddir = path.join(jobDir, "jadx-output");
    const r = await jadxDecompile(p, ddir, timeoutMs);
    result.actions.push({ tool: "jadx", status: r.ok ? "ok" : "failed", detail: r.ok ? "decompiled" : r.error });
    if (r.ok) result.outputs.push(ddir);
    else result.warnings.push(r.error ?? "jadx failed");
  } else if (ext === "apk" || isApk) {
    result.limitations.push("jadx not available; cannot decompile APK");
  }

  if ((ext === "jar" || isJar) && result.tools.jadx) {
    const ddir = path.join(jobDir, "jadx-output");
    const r = await jadxDecompile(p, ddir, timeoutMs);
    result.actions.push({ tool: "jadx", status: r.ok ? "ok" : "failed", detail: r.ok ? "decompiled" : r.error });
    if (r.ok) result.outputs.push(ddir);
  }

  if ((ext === "elf" || ext === "exe" || ext === "dll") && result.tools.rizin) {
    const info = await rizinInfo(p);
    result.actions.push({ tool: "rizin", operation: "info", status: info.ok ? "ok" : "failed", output: info.output.slice(0, 8000) });
    const strs = await rizinStrings(p);
    const strPath = path.join(jobDir, "strings.txt");
    fs.writeFileSync(strPath, strs.output);
    result.outputs.push(strPath);
    result.actions.push({ tool: "rizin", operation: "strings", status: strs.ok ? "ok" : "failed", count: (strs.output.match(/\n/g) || []).length });
  } else if (ext === "elf" || ext === "exe" || ext === "dll") {
    result.limitations.push("rizin not available; only header parsing performed");
  }

  if (result.actions.length === 0) {
    result.limitations.push("No reverse-engineering action taken; file type may be unsupported or tools unavailable");
  }
  return result;
}
