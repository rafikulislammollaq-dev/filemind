import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);

export async function sqliteAvailable(): Promise<boolean> {
  try { await exec("sqlite3", ["--version"], { timeout: 5000 }); return true; } catch { return false; }
}

export async function sqliteIntegrity(dbPath: string): Promise<{ ok: boolean; result: string; error?: string }> {
  try {
    const { stdout, stderr } = await exec("sqlite3", [dbPath, "PRAGMA integrity_check;"], { timeout: 30000 });
    const res = (stdout || "").trim();
    return { ok: res.toLowerCase() === "ok", result: res, error: stderr?.trim() };
  } catch (e: any) {
    return { ok: false, result: "", error: e?.message ?? String(e) };
  }
}

export async function sqliteSchema(dbPath: string): Promise<string> {
  try {
    const { stdout } = await exec("sqlite3", [dbPath, ".schema"], { timeout: 30000 });
    return stdout || "";
  } catch (e: any) {
    return `error: ${e?.message ?? e}`;
  }
}

export async function sqliteTables(dbPath: string): Promise<string[]> {
  try {
    const { stdout } = await exec("sqlite3", [dbPath, "SELECT name FROM sqlite_master WHERE type='table';"], { timeout: 30000 });
    return (stdout || "").trim().split(/\r?\n/).filter(Boolean);
  } catch { return []; }
}

export async function sqliteQuickCheck(dbPath: string): Promise<string> {
  try {
    const { stdout } = await exec("sqlite3", [dbPath, "PRAGMA quick_check;"], { timeout: 30000 });
    return (stdout || "").trim();
  } catch (e: any) { return `error: ${e?.message ?? e}`; }
}
