import fs from "node:fs";
import { resolveInputPath } from "../policy/pathPolicy.js";

export interface EntropyResult { overall: number; chunks: { offset: number; entropy: number }[]; assessment: string }

export function shannonEntropy(buf: Buffer): number {
  if (buf.length === 0) return 0;
  const counts = new Array(256).fill(0);
  for (const b of buf) counts[b]++;
  let e = 0;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / buf.length;
    e -= p * Math.log2(p);
  }
  return e;
}

export async function analyzeEntropy(inputPath: string, chunkSize = 4096): Promise<EntropyResult> {
  const p = resolveInputPath(inputPath);
  const buf = fs.readFileSync(p);
  const overall = shannonEntropy(buf);
  const chunks: { offset: number; entropy: number }[] = [];
  for (let off = 0; off < buf.length; off += chunkSize) {
    const chunk = buf.slice(off, Math.min(off + chunkSize, buf.length));
    chunks.push({ offset: off, entropy: shannonEntropy(chunk) });
  }
  let assessment = "low entropy (likely text or structured data)";
  if (overall > 7.5) assessment = "very high entropy (likely encrypted, compressed, or packed)";
  else if (overall > 6.5) assessment = "high entropy (likely binary or compressed)";
  else if (overall > 4.0) assessment = "moderate entropy";
  return { overall: Number(overall.toFixed(4)), chunks: chunks.slice(0, 100), assessment };
}
