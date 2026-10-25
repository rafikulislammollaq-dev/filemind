import fs from "node:fs";
import path from "node:path";
import { resolveInputPath } from "../policy/pathPolicy.js";
import { identifyFile } from "../identification/identify.js";
import { inspectMetadata } from "../metadata/metadata.js";
import { analyzeIntegrity } from "../analysis/integrity.js";
import { inspectBinary } from "../binary/inspectBinary.js";
import { extractContent } from "../extraction/extract.js";
import { recoverFile } from "../recovery/recover.js";
import { validateRecovery } from "../recovery/validate.js";
import { analyzeEmbeddedContent } from "../analysis/embedded.js";
import { sha256File, nowIso } from "../util/hash.js";

export interface InvestigationResult {
  job_id: string;
  path: string;
  goal: string;
  steps: { step: string; status: string; summary: string }[];
  findings: any;
  outputs: string[];
  report_path: string | null;
  warnings: string[];
  limitations: string[];
}

const jobs = new Map<string, InvestigationResult>();

export function getJob(jobId: string): InvestigationResult | undefined { return jobs.get(jobId); }

export async function investigateFile(inputPath: string, goal = "investigate", maxSteps = 10, maxRuntimeMs = 60000, maxTotalOutputBytes = 50*1024*1024, outputDir?: string): Promise<InvestigationResult> {
  const p = resolveInputPath(inputPath);
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const start = Date.now();
  const steps: InvestigationResult["steps"] = [];
  const outputs: string[] = [];
  const warnings: string[] = [];
  const limitations: string[] = [];
  let stepCount = 0;
  function budgetOk() { return stepCount < maxSteps && (Date.now() - start) < maxRuntimeMs; }
  function addStep(name: string, status: string, summary: string) { steps.push({ step: name, status, summary }); stepCount++; }

  let id: any = null;
  let meta: any = null;
  let integrity: any = null;

  // Step 1 identify
  if (budgetOk()) {
    try { id = await identifyFile(p); addStep("identify_file", "ok", `${id.detected?.ext ?? id.extension} (${id.confidence})`); }
    catch (e: any) { addStep("identify_file", "error", e?.message ?? String(e)); }
  }
  // metadata
  if (budgetOk()) {
    try { meta = await inspectMetadata(p); addStep("inspect_metadata", "ok", `${meta.fields.length} fields`); }
    catch (e: any) { addStep("inspect_metadata", "error", e?.message ?? String(e)); }
  }
  // integrity
  if (budgetOk()) {
    try { integrity = await analyzeIntegrity(p); addStep("analyze_integrity", "ok", `${integrity.integrity} (${integrity.severity})`); }
    catch (e: any) { addStep("analyze_integrity", "error", e?.message ?? String(e)); }
  }
  // binary inspect (bounded)
  if (budgetOk() && goal !== "identify") {
    try { const bi = await inspectBinary(p, 0, 256, "signatures"); addStep("inspect_binary", "ok", `${bi.signatures?.length ?? 0} signatures in first 256 bytes`); }
    catch (e: any) { addStep("inspect_binary", "error", e?.message ?? String(e)); }
  }
  // embedded content
  if (budgetOk()) {
    try { const emb = await analyzeEmbeddedContent(p); addStep("analyze_embedded_content", "ok", `${emb.candidates.length} candidates`); }
    catch (e: any) { addStep("analyze_embedded_content", "error", e?.message ?? String(e)); }
  }

  const ext = id?.detected?.ext ?? id?.extension;
  const isReadable = integrity?.integrity === "valid" || integrity?.integrity === "suspicious";

  // extraction for readable or goal extract
  if (budgetOk() && (goal === "extract" || goal === "investigate" || goal === "recover")) {
    try {
      const ex = await extractContent(p, outputDir, undefined, 50, maxTotalOutputBytes);
      for (const it of ex.items) outputs.push(it.path);
      addStep("extract_content", ex.items.length > 0 ? "ok" : "partial", `${ex.items.length} items, ${ex.failed.length} failed`);
      if (ex.warnings.length) warnings.push(...ex.warnings);
    } catch (e: any) { addStep("extract_content", "error", e?.message ?? String(e)); }
  }

  // recovery if not readable or goal recover
  if (budgetOk() && (goal === "recover" || (integrity && (integrity.integrity === "invalid" || integrity.integrity === "incomplete")))) {
    try {
      const rec = await recoverFile(p, outputDir, "auto", ext, false, maxTotalOutputBytes);
      for (const op of rec.output_paths) outputs.push(op);
      addStep("recover_file", rec.status, `${rec.classification}: ${rec.recovered_summary}`);
      if (rec.remaining_failures.length) warnings.push(...rec.remaining_failures);
      // validate
      if (budgetOk() && rec.output_paths.length > 0) {
        try {
          const v = await validateRecovery(p, rec.output_paths[0], ext);
          addStep("validate_recovery", "ok", `integrity=${v.integrity}, decode=${v.decoding?.success}`);
        } catch (e: any) { addStep("validate_recovery", "error", e?.message ?? String(e)); }
      }
    } catch (e: any) { addStep("recover_file", "error", e?.message ?? String(e)); }
  }

  // report
  const report = {
    job_id: jobId,
    created_at: nowIso(),
    path: p,
    sha256: sha256File(p),
    goal,
    detected_format: id?.detected ?? null,
    integrity: integrity?.integrity ?? null,
    severity: integrity?.severity ?? null,
    metadata_fields: meta?.fields?.length ?? 0,
    steps,
    outputs,
    warnings,
    limitations,
    final_assessment: integrity ? `File integrity assessed as ${integrity.integrity}. ${integrity.findings?.length ?? 0} findings.` : "No integrity assessment available.",
  };
  // write report
  const outDir = outputDir ? path.resolve(outputDir) : path.join(process.cwd(), "filemind-reports");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `${jobId}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  // also md summary
  const mdPath = path.join(outDir, `${jobId}.md`);
  const md = `# FileMind Investigation Report\n\n- Job: ${jobId}\n- File: ${p}\n- SHA-256: ${report.sha256}\n- Detected: ${id?.detected?.ext ?? id?.extension}\n- Integrity: ${integrity?.integrity ?? "unknown"}\n\n## Steps\n${steps.map(s => `- ${s.step}: ${s.status} - ${s.summary}`).join("\n")}\n\n## Outputs\n${outputs.map(o => `- ${o}`).join("\n")}\n\n## Warnings\n${warnings.map(w => `- ${w}`).join("\n")}\n`;
  fs.writeFileSync(mdPath, md);
  outputs.push(reportPath, mdPath);

  const result: InvestigationResult = {
    job_id: jobId,
    path: p,
    goal,
    steps,
    findings: { identification: id, metadata_count: meta?.fields?.length ?? 0, integrity },
    outputs,
    report_path: reportPath,
    warnings,
    limitations: limitations.concat(["Investigation uses available local parsers; some formats may lack handlers"]),
  };
  jobs.set(jobId, result);
  return result;
}
