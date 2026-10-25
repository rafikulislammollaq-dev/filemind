import fs from "node:fs";
import path from "node:path";
import { resolveInputPath } from "../policy/pathPolicy.js";
import { identifyFile } from "../identification/identify.js";
import { analyzeIntegrity } from "../analysis/integrity.js";

export async function validateRecovery(originalPath: string | undefined, recoveredPath: string, expectedFormat?: string): Promise<any> {
  const rp = resolveInputPath(recoveredPath);
  const id = await identifyFile(rp);
  const integrity = await analyzeIntegrity(rp);
  const result: any = {
    recovered_path: rp,
    format_recognition: id.detected ?? { ext: id.extension },
    integrity: integrity.integrity,
    integrity_findings: integrity.findings,
    structural_errors: integrity.structural_errors,
  };
  if (expectedFormat) {
    result.expected_format_match = (id.detected?.ext ?? id.extension) === expectedFormat;
  }
  if (originalPath) {
    try {
      const op = resolveInputPath(originalPath);
      const oHash = (await import("../util/hash.js")).sha256File(op);
      const rHash = (await import("../util/hash.js")).sha256File(rp);
      result.original_sha256 = oHash;
      result.recovered_sha256 = rHash;
      result.byte_identical = oHash === rHash;
    } catch (e: any) {
      result.comparison_error = e?.message ?? String(e);
    }
  }
  // Try decoding based on format
  const ext = id.detected?.ext ?? id.extension;
  const decode: any = { attempted: false };
  if (["jpg","jpeg","png","gif","webp","bmp","tiff","tif"].includes(ext)) {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(rp).metadata();
      decode.attempted = true; decode.success = true; decode.metadata = meta;
    } catch (e: any) { decode.attempted = true; decode.success = false; decode.error = e?.message ?? String(e); }
  } else if (ext === "pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const data = fs.readFileSync(rp);
      const parser = new PDFParse({ data });
      const textRes = await parser.getText();
      const parsed: any = { numpages: (textRes.pages || []).length };
      decode.attempted = true; decode.success = true; decode.pages = parsed.numpages;
    } catch (e: any) { decode.attempted = true; decode.success = false; decode.error = e?.message ?? String(e); }
  } else if (ext === "zip") {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(rp);
      decode.attempted = true; decode.success = true; decode.entries = zip.getEntries().length;
    } catch (e: any) { decode.attempted = true; decode.success = false; decode.error = e?.message ?? String(e); }
  }
  result.decoding = decode;
  result.known_limitations = ["Validation confirms parseability, not byte-for-byte originality unless comparison hash matches"];
  return result;
}
