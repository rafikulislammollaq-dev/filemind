import process from "node:process";

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const current: Level = (process.env.RBC_LOG_LEVEL as Level) || "info";

export function log(level: Level, msg: string, extra?: unknown) {
  if (LEVELS[level] < LEVELS[current]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(extra ? { extra } : {}) });
  process.stderr.write(line + "\n");
}
export const logger = { debug: (m: string, e?: unknown) => log("debug", m, e), info: (m: string, e?: unknown) => log("info", m, e), warn: (m: string, e?: unknown) => log("warn", m, e), error: (m: string, e?: unknown) => log("error", m, e) };
