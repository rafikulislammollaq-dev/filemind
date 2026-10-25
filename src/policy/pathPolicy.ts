import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { PathNotAllowedError } from "../util/errors.js";

export function resolveInputPath(p: string): string {
  if (typeof p !== "string" || !p.trim()) throw new PathNotAllowedError("path is required");
  const resolved = path.resolve(p);
  // ensure exists
  let real: string;
  try { real = fs.realpathSync(resolved); } catch { throw new PathNotAllowedError(`input path does not exist or is inaccessible: ${p}`); }
  const allowed = CONFIG.allowedInputRoots.some(root => {
    try {
      const rootReal = fs.existsSync(root) ? fs.realpathSync(root) : root;
      return real === rootReal || real.startsWith(rootReal + path.sep);
    } catch { return false; }
  });
  if (!allowed) throw new PathNotAllowedError(`path is outside allowed input roots: ${p}`);
  // reject if directory? allow files only for most ops; caller can check
  return real;
}

export function resolveOutputDir(p?: string): string {
  const base = CONFIG.outputRoot;
  if (!p) return base;
  const resolved = path.resolve(base, p);
  // ensure within base
  const realBase = fs.existsSync(base) ? fs.realpathSync(base) : base;
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new PathNotAllowedError(`output_dir must be inside output root: ${p}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

export function ensureFile(filePath: string): void {
  const st = fs.statSync(filePath);
  if (!st.isFile()) throw new PathNotAllowedError(`not a regular file: ${filePath}`);
}

export function checkFileSize(filePath: string): void {
  const st = fs.statSync(filePath);
  if (st.size > CONFIG.maxInputBytes) throw new Error(`file too large: ${st.size} bytes (limit ${CONFIG.maxInputBytes})`);
}
