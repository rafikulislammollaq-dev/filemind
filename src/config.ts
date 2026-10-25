import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export interface FileMindConfig {
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

export function loadConfig(): FileMindConfig {
  const roots = parseList(process.env.FILEMIND_ALLOWED_INPUTS) ?? [process.cwd(), os.homedir(), os.tmpdir()];
  const outputRoot = process.env.FILEMIND_OUTPUT_DIR ?? path.join(os.tmpdir(), "filemind-output");
  const tempRoot = process.env.FILEMIND_TEMP_DIR ?? path.join(os.tmpdir(), "filemind-temp");
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  const maxInputBytes = Number(process.env.FILEMIND_MAX_INPUT_BYTES ?? 100 * 1024 * 1024);
  return {
    allowedInputRoots: roots.map(r => path.resolve(r)),
    outputRoot: path.resolve(outputRoot),
    tempRoot: path.resolve(tempRoot),
    maxInputBytes,
    maxOutputBytes: Number(process.env.FILEMIND_MAX_OUTPUT_BYTES ?? 50 * 1024 * 1024),
    maxExtractedItems: Number(process.env.FILEMIND_MAX_EXTRACTED_ITEMS ?? 1000),
    maxArchiveDepth: Number(process.env.FILEMIND_MAX_ARCHIVE_DEPTH ?? 3),
    maxRuntimeMs: Number(process.env.FILEMIND_MAX_RUNTIME_MS ?? 120000),
    maxInspectBytes: Number(process.env.FILEMIND_MAX_INSPECT_BYTES ?? 64 * 1024 * 1024),
    maxBinaryOutputBytes: Number(process.env.FILEMIND_MAX_BINARY_OUTPUT_BYTES ?? 256 * 1024),
  };
}

export const CONFIG = loadConfig();
