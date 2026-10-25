import fs from "node:fs";
import path from "node:path";
import { resolveInputPath, checkFileSize } from "../policy/pathPolicy.js";
import { CONFIG } from "../config.js";

export interface BinaryInspectionResult {
  path: string;
  size: number;
  offset: number;
  length: number;
  mode: string;
  hex?: string;
  strings?: { offset: number; value: string }[];
  signatures?: { offset: number; description: string }[];
  structural_summary?: any;
  warnings: string[];
}

const PRINTABLE_MIN = 4;

export async function inspectBinary(inputPath: string, offset = 0, length?: number, mode = "hex"): Promise<BinaryInspectionResult> {
  const p = resolveInputPath(inputPath);
  checkFileSize(p);
  const st = fs.statSync(p);
  const size = st.size;
  const start = Math.max(0, offset);
  const reqLen = length ?? 256;
  const len = Math.min(reqLen, CONFIG.maxBinaryOutputBytes, size - start);
  if (len < 0) throw new Error("offset beyond file size");
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(p, "r");
  fs.readSync(fd, buf, 0, len, start);
  fs.closeSync(fd);

  const warnings: string[] = [];
  if (start + len < size) warnings.push("output truncated to requested/bounded length");

  const result: BinaryInspectionResult = { path: p, size, offset: start, length: len, mode, warnings };

  if (mode === "hex" || mode === "all") {
    const lines: string[] = [];
    for (let i = 0; i < buf.length; i += 16) {
      const chunk = buf.slice(i, i + 16);
      const hex = Array.from(chunk).map(b => b.toString(16).padStart(2, "0")).join(" ");
      const ascii = Array.from(chunk).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : ".").join("");
      lines.push(`${(start + i).toString(16).padStart(8, "0")}  ${hex.padEnd(47, " ")}  ${ascii}`);
    }
    result.hex = lines.join("\n");
  }

  if (mode === "strings" || mode === "all") {
    const strings: { offset: number; value: string }[] = [];
    let cur = "";
    let curStart = 0;
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      if (b >= 32 && b < 127) {
        if (cur === "") curStart = i;
        cur += String.fromCharCode(b);
      } else {
        if (cur.length >= PRINTABLE_MIN) strings.push({ offset: start + curStart, value: cur });
        cur = "";
      }
    }
    if (cur.length >= PRINTABLE_MIN) strings.push({ offset: start + curStart, value: cur });
    result.strings = strings.slice(0, 1000);
  }

  if (mode === "signatures" || mode === "all") {
    // scan buf for known signatures
    const sigs = [
      { bytes: [0x25,0x50,0x44,0x46], desc: "PDF" },
      { bytes: [0x50,0x4B,0x03,0x04], desc: "ZIP" },
      { bytes: [0x89,0x50,0x4E,0x47], desc: "PNG" },
      { bytes: [0xFF,0xD8,0xFF], desc: "JPEG" },
      { bytes: [0x47,0x49,0x46,0x38], desc: "GIF" },
      { bytes: [0x7F,0x45,0x4C,0x46], desc: "ELF" },
      { bytes: [0x4D,0x5A], desc: "PE" },
    ];
    const found: { offset: number; description: string }[] = [];
    for (let i = 0; i < buf.length; i++) {
      for (const s of sigs) {
        if (i + s.bytes.length <= buf.length) {
          let m = true;
          for (let j = 0; j < s.bytes.length; j++) if (buf[i+j] !== s.bytes[j]) { m = false; break; }
          if (m) found.push({ offset: start + i, description: s.desc });
        }
      }
    }
    result.signatures = found.slice(0, 200);
  }

  if (mode === "structural" || mode === "all") {
    result.structural_summary = {
      first_16_bytes_hex: buf.slice(0, 16).toString("hex"),
      last_16_bytes_hex: buf.slice(Math.max(0, buf.length-16)).toString("hex"),
      null_byte_count: Array.from(buf).filter(b => b === 0).length,
      high_bit_count: Array.from(buf).filter(b => b >= 128).length,
    };
  }

  return result;
}
