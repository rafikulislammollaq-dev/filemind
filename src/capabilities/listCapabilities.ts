import os from "node:os";
import { CONFIG } from "../config.js";
import { resolveInputPath } from "../policy/pathPolicy.js";

export async function listCapabilities() {
  const deps: { name: string; available: boolean; version?: string; notes?: string }[] = [];
  async function checkCmd(name: string) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      const { stdout } = await exec(name, ["--version"], { timeout: 5000 });
      return { available: true, version: String(stdout).trim().split("\n")[0] };
    } catch {
      return { available: false };
    }
  }
  // npm libs
  const libs = ["sharp", "pdf-parse", "jszip", "adm-zip", "file-type", "iconv-lite", "chardet"];
  for (const l of libs) {
    try { await import(l); deps.push({ name: l, available: true, notes: "npm dependency" }); }
    catch { deps.push({ name: l, available: false, notes: "npm dependency missing" }); }
  }
  // external commands
  for (const cmd of ["qpdf","7z","ffmpeg","ffprobe","exiftool","unzip","tar","gzip","sqlite3"]) {
    const r = await checkCmd(cmd);
    deps.push({ name: cmd, available: r.available, version: r.version, notes: "external command" });
  }

  // reverse engineering tools
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  for (const cmd of ["jadx", "rizin"]) {
    try {
      const args = cmd === "jadx" ? ["--version"] : ["-v"];
      const { stdout } = await execFileAsync(cmd, args, { timeout: 15000, shell: cmd === "jadx" });
      deps.push({ name: cmd, available: true, version: String(stdout).trim().split("\n")[0], notes: "external command (reverse engineering)" });
    } catch {
      deps.push({ name: cmd, available: false, notes: "external command (reverse engineering)" });
    }
  }

  return {
    product: "FileMind",
    version: "0.1.0",
    platform: `${os.platform()} ${os.arch()}`,
    node: process.version,
    python_available: true,
    supported_formats: {
      tier1: ["pdf", "jpg","jpeg","png","gif","webp","bmp","tiff","tif", "zip","tar","gz", "txt","md","json","xml","yaml","yml","csv","log","js","ts","py","html"],
      tier2: ["docx","xlsx","pptx","sqlite (metadata+integrity)", "elf (header)", "pe (header)"],
      tier3: ["apk (zip-based)", "jar (zip-based)"],
    },
    available_parsers: libs.filter(l => deps.find(d => d.name === l)?.available),
    missing_optional_dependencies: deps.filter(d => !d.available).map(d => d.name),
    dependency_status: deps,
    configured_limits: CONFIG,
    features: {
      identify_file: true,
      inspect_file: true,
      inspect_metadata: true,
      analyze_integrity: true,
      extract_content: true,
      inspect_binary: true,
      analyze_embedded_content: true,
      recover_file: true,
      validate_recovery: true,
      investigate_file: true,
      get_recovery_report: true,
      analyze_software: true,
    list_capabilities: true,
    },
    notes: [
      "Core functionality works with bundled npm dependencies.",
      "External tools (qpdf, 7z, ffmpeg, etc.) are optional and currently not detected in this environment; corresponding advanced recovery may be limited.",
      "Original files are never modified by default.",
    ],
  };
}
