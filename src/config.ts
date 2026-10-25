import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface RBCConfig {
  allowedInputRoots: string[];
  outputRoot: string;
  tempRoot: string;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxExtractedItems: number;
  maxArchiveDepth: number;
  maxRuntimeMs: number;
  maxInspectBytes: number;
  maxBinaryOutputBytes: number;
}

function parseList(v: string | undefined): string[] | null {
  if (!v) return null;
  return v.split(/[,;]/).map(s => s.trim()).filter(Boolean);
}

export function loadConfig(): RBCConfig {
  const roots = parseList(process.env.RBC_ALLOWED_INPUTS) ?? [process.cwd(), os.homedir(), os.tmpdir()];
  const outputRoot = process.env.RBC_OUTPUT_DIR ?? path.join(os.tmpdir(), "rbc-output");
  const tempRoot = process.env.RBC_TEMP_DIR ?? path.join(os.tmpdir(), "rbc-temp");
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  const maxInputBytes = Number(process.env.RBC_MAX_INPUT_BYTES ?? 100 * 1024 * 1024);
  return {
    allowedInputRoots: roots.map(r => path.resolve(r)),
    outputRoot: path.resolve(outputRoot),
    tempRoot: path.resolve(tempRoot),
    maxInputBytes,
    maxOutputBytes: Number(process.env.RBC_MAX_OUTPUT_BYTES ?? 50 * 1024 * 1024),
    maxExtractedItems: Number(process.env.RBC_MAX_EXTRACTED_ITEMS ?? 1000),
    maxArchiveDepth: Number(process.env.RBC_MAX_ARCHIVE_DEPTH ?? 3),
    maxRuntimeMs: Number(process.env.RBC_MAX_RUNTIME_MS ?? 120000),
    maxInspectBytes: Number(process.env.RBC_MAX_INSPECT_BYTES ?? 64 * 1024 * 1024),
    maxBinaryOutputBytes: Number(process.env.RBC_MAX_BINARY_OUTPUT_BYTES ?? 256 * 1024),
  };
}

export function validateConfig(c: RBCConfig): string[] {
  const problems: string[] = [];
  if (c.maxInputBytes <= 0) problems.push("maxInputBytes must be > 0");
  if (c.maxOutputBytes <= 0) problems.push("maxOutputBytes must be > 0");
  if (c.maxExtractedItems <= 0) problems.push("maxExtractedItems must be > 0");
  if (c.maxArchiveDepth <= 0) problems.push("maxArchiveDepth must be > 0");
  if (!c.allowedInputRoots.length) problems.push("allowedInputRoots must not be empty");
  for (const r of c.allowedInputRoots) {
    if (!path.isAbsolute(r)) problems.push(`allowed root not absolute: ${r}`);
  }
  if (!path.isAbsolute(c.outputRoot)) problems.push("outputRoot must be absolute");
  return problems;
}

export const CONFIG = loadConfig();
