import fs from "node:fs";
import path from "node:path";
import { resolveInputPath, resolveOutputDir, checkFileSize } from "../policy/pathPolicy.js";
import { sha256File, nowIso } from "../util/hash.js";
import { identifyFile } from "../identification/identify.js";
import { extractContent } from "../extraction/extract.js";
import { analyzeIntegrity } from "../analysis/integrity.js";

export interface RecoveryResult {
  status: string;
  classification: "complete" | "partial" | "structural_repair" | "content_extraction_only" | "failed" | "indeterminate";
  original_path: string;
  original_sha256: string;
  output_paths: string[];
  method: string;
  recovered_summary: string;
  validation: any;
  data_loss_indicators: string[];
  uncertainties: string[];
  remaining_failures: string[];
  provenance_path: string | null;
}

export async function recoverFile(inputPath: string, outputDir?: string, strategy = "auto", formatHint?: string, overwrite = false, maxOutputBytes?: number): Promise<RecoveryResult> {
  const p = resolveInputPath(inputPath);
  checkFileSize(p);
  const outDir = resolveOutputDir(outputDir);
  const jobDir = path.join(outDir, `recover-${Date.now()}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const id = await identifyFile(p);
  const ext = formatHint ?? id.detected?.ext ?? id.extension;
  const originalHash = sha256File(p);
  const dataLoss: string[] = [];
  const uncertainties: string[] = [];
  const remaining: string[] = [];
  const outputPaths: string[] = [];
  let method = strategy;
  let classification: RecoveryResult["classification"] = "failed";
  let summary = "";
  let validation: any = null;

  if (strategy === "auto") {
    if (ext === "pdf") method = "pdf_text_extraction";
    else if (ext === "sqlite" || ext === "db") method = "sqlite_check";
    else if (ext === "zip" || id.detected?.ext === "zip") method = "zip_extract_intact";
    else if (["jpg","jpeg","png","gif","webp","bmp","tiff","tif"].includes(ext)) method = "image_decode";
    else if (["txt","md","json","xml","yaml","yml","csv","log"].includes(ext)) method = "text_normalize";
    else method = "generic_copy";
  }

  try {
    if (method === "pdf_text_extraction") {
      const ex = await extractContent(p, jobDir, ["text"], 10, (maxOutputBytes ?? 50*1024*1024));
      for (const it of ex.items) outputPaths.push(it.path);
      if (ex.items.length > 0) { classification = "content_extraction_only"; summary = `Extracted text from PDF (${ex.items.length} item(s))`; }
      else { classification = "failed"; summary = "No text could be extracted"; remaining.push(...ex.failed.map(f => f.error)); }
      dataLoss.push("Original PDF structure not reconstructed; only readable text extracted");
      uncertainties.push("Recovered text may omit content not extractable by pdf-parse");
    } else if (method === "zip_extract_intact") {
      const ex = await extractContent(p, jobDir, ["archives"], 1000, (maxOutputBytes ?? 50*1024*1024));
      for (const it of ex.items) outputPaths.push(it.path);
      if (ex.items.length > 0) {
        classification = ex.failed.length > 0 ? "partial" : "complete";
        summary = `Extracted ${ex.items.length} entries; ${ex.failed.length} failed`;
      } else { classification = "failed"; summary = "No entries extracted"; }
      if (ex.failed.length) remaining.push(...ex.failed.map(f => f.error));
      dataLoss.push("Archive structure rebuilt as directory, not original archive");
    } else if (method === "image_decode") {
      // validate decode
      const sharp = (await import("sharp")).default;
      try {
        const meta = await sharp(p).metadata();
        const dest = path.join(jobDir, path.basename(p));
        fs.copyFileSync(p, dest);
        outputPaths.push(dest);
        classification = "complete";
        summary = `Image decodes successfully (${meta.width}x${meta.height})`;
      } catch (e: any) {
        remaining.push(`decode failed: ${e?.message ?? e}`);
        classification = "failed";
        summary = "Image could not be decoded";
      }
    } else if (method === "text_normalize") {
      const buf = fs.readFileSync(p);
      let text = buf.toString("utf8");
      // normalize line endings to LF
      text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const dest = path.join(jobDir, path.basename(p));
      fs.writeFileSync(dest, text, "utf8");
      outputPaths.push(dest);
      classification = "structural_repair";
      summary = "Normalized line endings to LF";
      dataLoss.push("Encoding assumptions may be incorrect");
    } else if (method === "pdf_repair") {
      const buf = fs.readFileSync(p);
      let data = buf;
      const tail = data.slice(Math.max(0, data.length - 1024)).toString("binary");
      if (!tail.includes("%%EOF")) {
        data = Buffer.concat([data, Buffer.from("\n%%EOF\n")]);
        dataLoss.push("Appended missing PDF EOF marker");
      }
      const dest = path.join(jobDir, path.basename(p));
      fs.writeFileSync(dest, data);
      outputPaths.push(dest);
      // validate
      try {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data });
        const textRes = await parser.getText();
        classification = "structural_repair";
        summary = `PDF structural repair attempted; parsed ${ (textRes.pages||[]).length } pages`;
      } catch (e: any) {
        classification = "failed";
        summary = "PDF repair did not yield a parseable document";
        remaining.push(e?.message ?? String(e));
      }
    } else if (method === "sqlite_check") {
      const { sqliteAvailable, sqliteIntegrity } = await import("../adapters/sqliteAdapter.js");
      if (await sqliteAvailable()) {
        const ic = await sqliteIntegrity(p);
        const dest = path.join(jobDir, path.basename(p));
        fs.copyFileSync(p, dest);
        outputPaths.push(dest);
        classification = ic.ok ? "complete" : "failed";
        summary = `SQLite integrity_check: ${ic.result}`;
        if (!ic.ok) remaining.push(ic.result);
      } else {
        remaining.push("sqlite3 CLI not available");
        classification = "failed";
      }
    } else if (method === "generic_copy") {
      const dest = path.join(jobDir, path.basename(p));
      fs.copyFileSync(p, dest);
      outputPaths.push(dest);
      classification = "content_extraction_only";
      summary = "Copied file without modification";
      uncertainties.push("No recovery transformation applied");
    } else {
      remaining.push(`unsupported strategy: ${method}`);
      classification = "failed";
    }
  } catch (e: any) {
    remaining.push(e?.message ?? String(e));
    classification = "failed";
  }

  // validation of first output if exists
  if (outputPaths.length > 0) {
    try {
      const { validateRecovery } = await import("./validate.js");
      validation = await validateRecovery(p, outputPaths[0], ext);
    } catch (e: any) {
      validation = { error: e?.message ?? String(e) };
    }
  }

  // provenance
  const provenance = {
    created_at: nowIso(),
    original_path: p,
    original_sha256: originalHash,
    original_size: fs.statSync(p).size,
    detected_format: id.detected?.ext ?? id.extension,
    recovery_method: method,
    strategy_requested: strategy,
    output_paths: outputPaths,
    output_hashes: outputPaths.map(op => ({ path: op, sha256: sha256File(op) })),
    classification,
    data_loss_indicators: dataLoss,
    uncertainties,
    remaining_failures: remaining,
    validation,
  };
  const provPath = path.join(jobDir, "provenance.json");
  fs.writeFileSync(provPath, JSON.stringify(provenance, null, 2));

  return {
    status: classification === "failed" ? "failed" : "success",
    classification,
    original_path: p,
    original_sha256: originalHash,
    output_paths: outputPaths,
    method,
    recovered_summary: summary,
    validation,
    data_loss_indicators: dataLoss,
    uncertainties,
    remaining_failures: remaining,
    provenance_path: provPath,
  };
}
