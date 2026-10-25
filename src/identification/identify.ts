import fs from "node:fs";
import path from "node:path";
import { fileTypeFromFile } from "file-type";
import { resolveInputPath, checkFileSize } from "../policy/pathPolicy.js";
import { sha256File } from "../util/hash.js";

export interface IdentifyResult {
  path: string;
  size: number;
  sha256: string;
  extension: string;
  detected: { ext: string; mime: string } | null;
  candidates: { ext: string; mime: string; evidence: string }[];
  signature_matches: { offset: number; signature: string; description: string }[];
  structural_observations: string[];
  confidence: string;
  warnings: string[];
}

const SIGNATURES: { sig: number[]; desc: string; ext: string }[] = [
  { sig: [0x25, 0x50, 0x44, 0x46], desc: "PDF header", ext: "pdf" },
  { sig: [0x50, 0x4B, 0x03, 0x04], desc: "ZIP local file header", ext: "zip" },
  { sig: [0x50, 0x4B, 0x05, 0x06], desc: "ZIP empty archive", ext: "zip" },
  { sig: [0x50, 0x4B, 0x07, 0x08], desc: "ZIP spanned", ext: "zip" },
  { sig: [0x7F, 0x45, 0x4C, 0x46], desc: "ELF", ext: "elf" },
  { sig: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], desc: "PNG", ext: "png" },
  { sig: [0xFF, 0xD8, 0xFF], desc: "JPEG", ext: "jpg" },
  { sig: [0x47, 0x49, 0x46, 0x38], desc: "GIF", ext: "gif" },
  { sig: [0x52, 0x49, 0x46, 0x46], desc: "RIFF (WAV/AVI/WebP)", ext: "riff" },
  { sig: [0x42, 0x4D], desc: "BMP", ext: "bmp" },
  { sig: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00], desc: "SQLite database", ext: "sqlite" },
  { sig: [0x4D, 0x5A], desc: "PE/Windows executable", ext: "exe" },
  { sig: [0x1F, 0x8B], desc: "gzip", ext: "gz" },
  { sig: [0x49, 0x44, 0x33], desc: "MP3 ID3", ext: "mp3" },
];

function findSignatures(buf: Buffer): { offset: number; signature: string; description: string }[] {
  const out: { offset: number; signature: string; description: string }[] = [];
  // only search at offset 0 and maybe embedded? keep bounded: offset 0 plus scan first 4KB for signatures
  const maxScan = Math.min(buf.length, 4096);
  for (let off = 0; off < maxScan; off++) {
    for (const s of SIGNATURES) {
      if (off + s.sig.length <= buf.length) {
        let match = true;
        for (let i = 0; i < s.sig.length; i++) {
          if (buf[off + i] !== s.sig[i]) { match = false; break; }
        }
        if (match) {
          // avoid duplicate same offset/ext
          out.push({ offset: off, signature: s.sig.map(b => b.toString(16).padStart(2, "0")).join(" "), description: s.desc });
        }
      }
    }
  }
  // dedup by offset+description
  const seen = new Set<string>();
  const dedup: typeof out = [];
  for (const o of out) {
    const k = o.offset + "|" + o.description;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(o);
  }
  // limit
  return dedup.slice(0, 50);
}

export async function identifyFile(inputPath: string, maxBytes?: number): Promise<IdentifyResult> {
  const p = resolveInputPath(inputPath);
  checkFileSize(p);
  const st = fs.statSync(p);
  const size = st.size;
  const sha = sha256File(p);
  const ext = path.extname(p).replace(/^\./, "").toLowerCase();
  const warnings: string[] = [];
  const structural: string[] = [];
  const limit = Math.min(maxBytes ?? st.size, st.size, 64 * 1024 * 1024);
  const fd = fs.openSync(p, "r");
  const buf = Buffer.alloc(Math.min(limit, st.size || 1));
  if (st.size > 0) fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);

  const ft = await fileTypeFromFile(p).catch(() => undefined);
  let detected = ft ? { ext: ft.ext, mime: ft.mime } : null;

  const sigs = findSignatures(buf);
  // candidate from file-type
  const candidates: { ext: string; mime: string; evidence: string }[] = [];
  if (ft) candidates.push({ ext: ft.ext, mime: ft.mime, evidence: "magic-number detection by file-type" });

  // extension mismatch
  if (ext && ft && ext !== ft.ext) {
    warnings.push(`file extension '${ext}' does not match detected format '${ft.ext}'`);
  }
  if (size === 0) warnings.push("file is empty");
  // Text heuristic
  if (!detected && size > 0) {
    const printable = buf.filter(b => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)).length;
    const ratio = printable / buf.length;
    if (ratio > 0.85) {
      candidates.push({ ext: "txt", mime: "text/plain", evidence: "high printable ASCII ratio" });
      detected = { ext: "txt", mime: "text/plain" };
    }
  }
  // structural obs
  if (ft?.mime?.startsWith("application/zip")) {
    structural.push("ZIP-based container; may be DOCX/XLSX/PPTX/APK/JAR");
  }
  // try zip inspect for container type
  if (ft?.ext === "zip") {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(p);
      const entries = zip.getEntries().map(e => e.entryName);
      if (entries.includes("word/document.xml")) structural.push("contains word/document.xml -> likely DOCX");
      if (entries.includes("xl/workbook.xml")) structural.push("contains xl/workbook.xml -> likely XLSX");
      if (entries.includes("ppt/presentation.xml")) structural.push("contains ppt/presentation.xml -> likely PPTX");
      if (entries.includes("AndroidManifest.xml")) structural.push("contains AndroidManifest.xml -> likely APK");
      if (entries.includes("META-INF/MANIFEST.MF")) structural.push("contains META-INF/MANIFEST.MF -> likely JAR");
    } catch (e) {
      warnings.push("could not inspect ZIP container entries");
    }
  }
  // SQLite special
  if (buf.length >= 16 && buf.toString("ascii", 0, 15) === "SQLite format 3") {
    if (!detected) candidates.push({ ext: "sqlite", mime: "application/x-sqlite3", evidence: "SQLite header" });
  }

  let confidence = "Unable to determine";
  if (ft) confidence = "Strongly supported";
  else if (sigs.length > 0) confidence = "Plausible";
  else if (size === 0) confidence = "Unsupported";

  return {
    path: p,
    size,
    sha256: sha,
    extension: ext,
    detected,
    candidates,
    signature_matches: sigs,
    structural_observations: structural,
    confidence,
    warnings,
  };
}
