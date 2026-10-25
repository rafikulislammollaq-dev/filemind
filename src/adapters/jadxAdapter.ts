import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const exec = promisify(execFile);

export async function jadxAvailable(): Promise<boolean> {
  try { await exec("jadx", ["--version"], { timeout: 15000, shell: true }); return true; } catch { return false; }
}

export async function jadxDecompile(inputPath: string, outputDir: string, timeoutMs = 300000): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const { stdout, stderr } = await exec("jadx", ["-d", outputDir, inputPath], { timeout: timeoutMs, shell: true, maxBuffer: 10*1024*1024 });
    return { ok: true, output: (stdout || "") + (stderr || "") };
  } catch (e: any) {
    return { ok: false, output: e?.stdout ?? "", error: e?.message ?? String(e) };
  }
}
