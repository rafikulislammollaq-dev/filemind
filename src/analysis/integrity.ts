import fs from "node:fs";
import path from "node:path";
import { resolveInputPath, checkFileSize } from "../policy/pathPolicy.js";
import { identifyFile } from "../identification/identify.js";

export interface IntegrityResult {
  path: string;
  format: string | null;
  integrity: "valid" | "invalid" | "incomplete" | "suspicious" | "unknown";
  findings: string[];
  structural_errors: string[];
  missing_structures: string[];
  checksum_results: { name: string; ok: boolean; detail?: string }[];
  truncation_indicators: string[];
  severity: "low" | "medium" | "high" | "critical";
  evidence: string[];
  recommended_next_steps: string[];
}

export async function analyzeIntegrity(inputPath: string, strictness = "normal"): Promise<IntegrityResult> {
  const p = resolveInputPath(inputPath);
  checkFileSize(p);
  const id = await identifyFile(p);
  const ext = id.detected?.ext ?? id.extension;
  const findings: string[] = [];
  const errors: string[] = [];
  const missing: string[] = [];
  const trunc: string[] = [];
  const evidence: string[] = [];
  const checksums: { name: string; ok: boolean; detail?: string }[] = [];
  const steps: string[] = [];
  let integrity: IntegrityResult["integrity"] = "unknown";
  let severity: IntegrityResult["severity"] = "low";

  const stat = fs.statSync(p);
  const buf = fs.readFileSync(p);

  // Generic checks
  if (stat.size === 0) { findings.push("file is empty"); integrity = "invalid"; severity = "high"; }
  // trailing newline for text? skip

  // PDF
  if (ext === "pdf") {
    evidence.push("PDF header check");
    if (!buf.toString("ascii", 0, 4).startsWith("%PDF")) {
      errors.push("missing PDF signature");
      integrity = "invalid"; severity = "high";
    } else {
      findings.push("valid PDF signature present");
    }
    // check EOF marker
    const tail = buf.slice(Math.max(0, buf.length - 1024)).toString("binary");
    if (!tail.includes("%%EOF")) {
      trunc.push("PDF EOF marker (%%EOF) not found in trailing bytes");
      findings.push("possible truncation or missing trailer");
      integrity = integrity === "unknown" ? "incomplete" : integrity;
      severity = "medium";
    } else {
      findings.push("PDF EOF marker found");
    }
    // try parse
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buf });
      const textRes = await parser.getText();
      const parsed: any = { numpages: (textRes.pages || []).length };
      findings.push(`PDF parsed successfully: ${parsed.numpages} pages`);
      integrity = "valid";
      severity = "low";
    } catch (e: any) {
      errors.push(`PDF parse failed: ${e?.message ?? e}`);
      if (integrity !== "invalid") integrity = "incomplete";
      severity = "high";
      steps.push("attempt recover_file with pdf_text_extraction or pdf_repair");
    }
    // xref check heuristic
    if (!buf.toString("binary").includes("xref") && !buf.toString("binary").includes("/XRef")) {
      missing.push("cross-reference structure not found");
    }
  }

  // Images
  if (["jpg","jpeg","png","gif","webp","bmp","tiff","tif"].includes(ext)) {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(p).metadata();
      findings.push(`image decodes: ${meta.width}x${meta.height} ${meta.format}`);
      integrity = "valid";
    } catch (e: any) {
      errors.push(`image decode failed: ${e?.message ?? e}`);
      integrity = "invalid";
      severity = "high";
      // truncation hint: try partial
      trunc.push("image may be truncated or corrupted");
      steps.push("attempt image repair / extract decodable pixels");
    }
  }

  // ZIP
  if (ext === "zip" || id.detected?.ext === "zip") {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(p);
      const entries = zip.getEntries();
      findings.push(`ZIP readable: ${entries.length} entries`);
      // test each entry
      let bad = 0;
      for (const e of entries) {
        try { e.getData(); } catch { bad++; }
      }
      if (bad > 0) {
        errors.push(`${bad} ZIP entries could not be extracted`);
        integrity = "incomplete";
        severity = "medium";
      } else {
        integrity = integrity === "unknown" ? "valid" : integrity;
      }
      // check central directory
      if (!buf.includes(Buffer.from("PK\x05\x06", "binary")) && !buf.includes(Buffer.from("PK\x01\x02", "binary"))) {
        missing.push("central directory signature not found");
      }
    } catch (e: any) {
      errors.push(`ZIP parse failed: ${e?.message ?? e}`);
      integrity = "invalid";
      severity = "high";
      trunc.push("archive may be truncated");
    }
  }

  // SQLite
  if (ext === "sqlite" || ext === "db" || id.detected?.ext === "sqlite") {
    try {
      const { sqliteAvailable, sqliteIntegrity } = await import("../adapters/sqliteAdapter.js");
      if (await sqliteAvailable()) {
        const ic = await sqliteIntegrity(p);
        if (ic.ok) { findings.push("SQLite integrity_check: ok"); integrity = "valid"; }
        else { errors.push(`SQLite integrity_check: ${ic.result}`); integrity = "invalid"; severity = "high"; }
        if (ic.error) findings.push(`sqlite3: ${ic.error}`);
      } else {
        findings.push("sqlite3 CLI not available; structural check skipped");
      }
    } catch (e: any) { errors.push(`sqlite integrity failed: ${e?.message ?? e}`); }
  }
  if (["txt","md","json","xml","yaml","yml","csv","log","js","ts","py","html","json"].includes(ext)) {
    // encoding check
    try {
      const text = buf.toString("utf8");
      // detect replacement char
      if (text.includes("\uFFFD")) {
        findings.push("UTF-8 decoding produced replacement characters; possible encoding mismatch or corruption");
        integrity = "suspicious";
        severity = "medium";
      } else {
        findings.push("UTF-8 decodes without replacement characters");
        integrity = integrity === "unknown" ? "valid" : integrity;
      }
      // JSON parse
      if (ext === "json") {
        try { JSON.parse(text); findings.push("JSON parses successfully"); integrity = "valid"; }
        catch (e: any) { errors.push(`JSON parse failed: ${e?.message}`); integrity = "invalid"; severity = "high"; }
      }
      // YAML parse
      if (ext === "yaml" || ext === "yml") {
        try {
          const yaml = await import("js-yaml");
          (yaml as any).load(text);
          findings.push("YAML parses successfully");
          integrity = "valid";
        } catch (e: any) {
          errors.push(`YAML parse failed: ${e?.message ?? e}`);
          integrity = "invalid"; severity = "high";
        }
      }
      // XML parse
      if (ext === "xml" || ext === "html") {
        // basic tag balance not full; report
        findings.push("XML/HTML structural validation not fully implemented");
      }
    } catch (e: any) {
      errors.push(`text analysis failed: ${e?.message ?? e}`);
    }
  }

  if (integrity === "unknown") {
    if (errors.length > 0) integrity = "invalid";
    else if (trunc.length > 0) integrity = "incomplete";
    else integrity = "valid";
  }
  if (steps.length === 0) steps.push("inspect_metadata", "inspect_binary");

  return {
    path: p,
    format: id.detected?.ext ?? id.extension ?? null,
    integrity,
    findings,
    structural_errors: errors,
    missing_structures: missing,
    checksum_results: checksums,
    truncation_indicators: trunc,
    severity,
    evidence,
    recommended_next_steps: steps,
  };
}
