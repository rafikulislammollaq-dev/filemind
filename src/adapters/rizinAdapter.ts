import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export async function rizinAvailable(): Promise<boolean> {
  try { await exec("rizin", ["-v"], { timeout: 15000 }); return true; } catch { return false; }
}

export async function rizinInfo(inputPath: string, timeoutMs = 60000): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const { stdout, stderr } = await exec("rizin", ["-q", "-c", "iI; iS", inputPath], { timeout: timeoutMs, maxBuffer: 10*1024*1024 });
    return { ok: true, output: (stdout || "") + (stderr || "") };
  } catch (e: any) {
    return { ok: false, output: e?.stdout ?? "", error: e?.message ?? String(e) };
  }
}

export async function rizinStrings(inputPath: string, timeoutMs = 60000): Promise<{ ok: boolean; output: string; error?: string }> {
  try {
    const { stdout, stderr } = await exec("rizin", ["-q", "-c", "iz", inputPath], { timeout: timeoutMs, maxBuffer: 10*1024*1024 });
    return { ok: true, output: (stdout || "") + (stderr || "") };
  } catch (e: any) {
    return { ok: false, output: e?.stdout ?? "", error: e?.message ?? String(e) };
  }
}
