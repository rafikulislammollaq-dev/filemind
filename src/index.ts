#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ok, fail } from "./util/result.js";
import { resolveInputPath, resolveOutputDir } from "./policy/pathPolicy.js";
import { identifyFile } from "./identification/identify.js";
import { inspectMetadata } from "./metadata/metadata.js";
import { analyzeIntegrity } from "./analysis/integrity.js";
import { inspectBinary } from "./binary/inspectBinary.js";
import { extractContent } from "./extraction/extract.js";
import { recoverFile } from "./recovery/recover.js";
import { validateRecovery } from "./recovery/validate.js";
import { analyzeEmbeddedContent } from "./analysis/embedded.js";
import { investigateFile, getJob } from "./orchestration/investigate.js";
import { analyzeSoftware } from "./analysis/software.js";
import { listCapabilities } from "./capabilities/listCapabilities.js";
import { CONFIG } from "./config.js";

const server = new McpServer({ name: "filemind", version: "0.1.0" });

function wrap(fn: () => Promise<any>) {
  return fn().catch((e: any) => fail("tool", e?.message ?? String(e), { code: e?.code }));
}

// identify_file
server.registerTool("identify_file", {
  description: "Determine the most likely format of a file using content signatures and structural evidence.",
  inputSchema: {
    path: z.string(),
    max_bytes: z.number().optional(),
    include_candidates: z.boolean().optional(),
  },
}, async ({ path: p, max_bytes }) => wrap(async () => {
  const res = await identifyFile(p, max_bytes);
  return ok("identify_file", res as any);
}));

// inspect_file
server.registerTool("inspect_file", {
  description: "Perform a general read-only inspection of a file.",
  inputSchema: {
    path: z.string(),
    depth: z.number().optional(),
    include_metadata: z.boolean().optional(),
    include_structure: z.boolean().optional(),
    max_results: z.number().optional(),
  },
}, async ({ path: p, include_metadata, include_structure }) => wrap(async () => {
  const id = await identifyFile(p);
  const meta = include_metadata === false ? null : await inspectMetadata(p);
  const integrity = include_structure === false ? null : await analyzeIntegrity(p);
  return ok("inspect_file", { identification: id, metadata: meta, integrity });
}));

// inspect_metadata
server.registerTool("inspect_metadata", {
  description: "Extract available metadata from a supported file.",
  inputSchema: {
    path: z.string(),
    format_hint: z.string().optional(),
    max_metadata_items: z.number().optional(),
  },
}, async ({ path: p, max_metadata_items }) => wrap(async () => {
  const res = await inspectMetadata(p, max_metadata_items ?? 200);
  return ok("inspect_metadata", res as any);
}));

// analyze_integrity
server.registerTool("analyze_integrity", {
  description: "Determine whether a file is structurally valid, incomplete, malformed, or suspicious.",
  inputSchema: {
    path: z.string(),
    format_hint: z.string().optional(),
    strictness: z.enum(["lenient","normal","strict"]).optional(),
  },
}, async ({ path: p, strictness }) => wrap(async () => {
  const res = await analyzeIntegrity(p, strictness ?? "normal");
  return ok("analyze_integrity", res as any);
}));

// extract_content
server.registerTool("extract_content", {
  description: "Extract readable content and supported embedded resources.",
  inputSchema: {
    path: z.string(),
    output_dir: z.string().optional(),
    content_types: z.array(z.string()).optional(),
    max_items: z.number().optional(),
    max_total_bytes: z.number().optional(),
  },
}, async ({ path: p, output_dir, content_types, max_items, max_total_bytes }) => wrap(async () => {
  const res = await extractContent(p, output_dir, content_types, max_items ?? 100, max_total_bytes ?? 50*1024*1024);
  return ok("extract_content", res as any);
}));

// inspect_binary
server.registerTool("inspect_binary", {
  description: "Investigate a file as raw binary data.",
  inputSchema: {
    path: z.string(),
    offset: z.number().optional(),
    length: z.number().optional(),
    mode: z.enum(["hex","strings","signatures","structural","all"]).optional(),
  },
}, async ({ path: p, offset, length, mode }) => wrap(async () => {
  const res = await inspectBinary(p, offset ?? 0, length, mode ?? "hex");
  return ok("inspect_binary", res as any);
}));

// analyze_embedded_content
server.registerTool("analyze_embedded_content", {
  description: "Search for recoverable files, resources, or known structures embedded within another file.",
  inputSchema: {
    path: z.string(),
    allowed_formats: z.array(z.string()).optional(),
    max_candidates: z.number().optional(),
    max_total_bytes: z.number().optional(),
  },
}, async ({ path: p, allowed_formats, max_candidates, max_total_bytes }) => wrap(async () => {
  const res = await analyzeEmbeddedContent(p, allowed_formats, max_candidates ?? 50, max_total_bytes ?? 50*1024*1024);
  return ok("analyze_embedded_content", res as any);
}));

// recover_file
server.registerTool("recover_file", {
  description: "Attempt a supported recovery operation.",
  inputSchema: {
    path: z.string(),
    output_dir: z.string().optional(),
    recovery_strategy: z.string().optional(),
    format_hint: z.string().optional(),
    overwrite: z.boolean().optional(),
    max_output_bytes: z.number().optional(),
    allow_partial_recovery: z.boolean().optional(),
  },
}, async ({ path: p, output_dir, recovery_strategy, format_hint, overwrite, max_output_bytes }) => wrap(async () => {
  const res = await recoverFile(p, output_dir, recovery_strategy ?? "auto", format_hint, overwrite ?? false, max_output_bytes);
  return ok("recover_file", res as any);
}));

// validate_recovery
server.registerTool("validate_recovery", {
  description: "Validate a recovered artifact.",
  inputSchema: {
    original_path: z.string().optional(),
    recovered_path: z.string(),
    expected_format: z.string().optional(),
    validation_level: z.string().optional(),
  },
}, async ({ original_path, recovered_path, expected_format }) => wrap(async () => {
  const res = await validateRecovery(original_path, recovered_path, expected_format);
  return ok("validate_recovery", res as any);
}));

// investigate_file
server.registerTool("investigate_file", {
  description: "Run a bounded investigation workflow.",
  inputSchema: {
    path: z.string(),
    goal: z.string().optional(),
    max_steps: z.number().optional(),
    max_runtime_seconds: z.number().optional(),
    max_total_output_bytes: z.number().optional(),
    output_dir: z.string().optional(),
  },
}, async ({ path: p, goal, max_steps, max_runtime_seconds, max_total_output_bytes, output_dir }) => wrap(async () => {
  const res = await investigateFile(p, goal ?? "investigate", max_steps ?? 12, (max_runtime_seconds ?? 60) * 1000, max_total_output_bytes ?? 50*1024*1024, output_dir);
  return ok("investigate_file", res as any);
}));

// get_recovery_report
server.registerTool("get_recovery_report", {
  description: "Retrieve a previously generated investigation report.",
  inputSchema: { job_id: z.string() },
}, async ({ job_id }) => wrap(async () => {
  const job = getJob(job_id);
  if (!job) return fail("get_recovery_report", `job not found: ${job_id}`);
  return ok("get_recovery_report", job as any);
}));

// list_capabilities
server.registerTool("list_capabilities", {
  description: "Report available functionality and dependencies.",
  inputSchema: {},
}, async () => wrap(async () => {
  const res = await listCapabilities();
  return ok("list_capabilities", res as any);
}));

// analyze_software
server.registerTool("analyze_software", {
  description: "Optional software/binary analysis using available reverse-engineering tools (jadx, rizin).",
  inputSchema: {
    path: z.string(),
    output_dir: z.string().optional(),
    timeout_seconds: z.number().optional(),
  },
}, async ({ path: p, output_dir, timeout_seconds }) => wrap(async () => {
  const res = await analyzeSoftware(p, output_dir, (timeout_seconds ?? 300) * 1000);
  return ok("analyze_software", res as any);
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("FileMind failed to start:", e);
  process.exit(1);
});
