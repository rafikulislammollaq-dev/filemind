import fs from "node:fs";
import path from "node:path";
import { resolveInputPath, checkFileSize } from "../policy/pathPolicy.js";
import { identifyFile } from "../identification/identify.js";

export interface EmbeddedCandidate { offset: number; length?: number; detected_ext: string | null; detected_mime: string | null; evidence: string; extraction_feasible: boolean; }

export async function analyzeEmbeddedContent(inputPath: string, allowedFormats?: string[], maxCandidates = 50, maxTotalBytes = 50*1024*1024): Promise<{ candidates: EmbeddedCandidate[]; warnings: string[] }> {
  const p = resolveInputPath(inputPath);
  checkFileSize(p);
  const buf = fs.readFileSync(p);
  const warnings: string[] = [];
  const candidates: EmbeddedCandidate[] = [];
  const sigs: { bytes: number[]; ext: string; mime: string; desc: string }[] = [
    { bytes: [0x25,0x50,0x44,0x46], ext: "pdf", mime: "application/pdf", desc: "PDF" },
    { bytes: [0x50,0x4B,0x03,0x04], ext: "zip", mime: "application/zip", desc: "ZIP" },
    { bytes: [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A], ext: "png", mime: "image/png", desc: "PNG" },
    { bytes: [0xFF,0xD8,0xFF], ext: "jpg", mime: "image/jpeg", desc: "JPEG" },
    { bytes: [0x47,0x49,0x46,0x38], ext: "gif", mime: "image/gif", desc: "GIF" },
    { bytes: [0x52,0x49,0x46,0x46], ext: "riff", mime: "application/octet-stream", desc: "RIFF" },
  ];
  const allowed = allowedFormats && allowedFormats.length ? allowedFormats : null;

  // scan
  let i = 0;
  while (i < buf.length && candidates.length < maxCandidates) {
    let matched = false;
    for (const s of sigs) {
      if (allowed && !allowed.includes(s.ext)) continue;
      if (i + s.bytes.length <= buf.length) {
        let m = true;
        for (let j = 0; j < s.bytes.length; j++) if (buf[i+j] !== s.bytes[j]) { m = false; break; }
        if (m) {
          // heuristic length: for zip, find next PK? just record offset
          candidates.push({ offset: i, detected_ext: s.ext, detected_mime: s.mime, evidence: s.desc, extraction_feasible: true });
          i += s.bytes.length; // skip
          matched = true;
          break;
        }
      }
    }
    if (!matched) i++;
  }
  if (candidates.length >= maxCandidates) warnings.push("candidate limit reached");
  // remove duplicate offset 0? keep
  return { candidates, warnings };
}
