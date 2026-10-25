import crypto from "node:crypto";
import fs from "node:fs";

export function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest("hex");
}

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}
