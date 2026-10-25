import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const exec = promisify(execFile);

export async function pythonPilAvailable(): Promise<boolean> {
  try {
    await exec("python", ["-c", "import PIL; print('ok')"], { timeout: 10000 });
    return true;
  } catch { return false; }
}

export async function repairImageWithPil(inputPath: string, outputPath: string, timeoutMs = 60000): Promise<{ ok: boolean; error?: string }> {
  const script = `
import sys
from PIL import Image, ImageFile
ImageFile.LOAD_TRUNCATED_IMAGES = True
try:
    im = Image.open(sys.argv[1])
    im.load()
    im.save(sys.argv[2])
    print("OK")
except Exception as e:
    print("ERR:" + str(e))
    sys.exit(1)
`;
  try {
    const { stdout, stderr } = await exec("python", ["-c", script, inputPath, outputPath], { timeout: timeoutMs });
    if (String(stdout).trim().startsWith("OK")) return { ok: true };
    return { ok: false, error: (stdout || stderr || "").trim() };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
