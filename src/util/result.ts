import { z } from "zod";

export const ToolResult = z.object({
  status: z.string(),
  operation: z.string(),
  input: z.any().optional(),
  findings: z.any().optional(),
  evidence: z.any().optional(),
  outputs: z.any().optional(),
  validation: z.any().optional(),
  warnings: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  recommended_next_steps: z.array(z.string()).optional(),
});

export type Json = Record<string, unknown>;

export function ok(operation: string, data: Json): { content: { type: "text"; text: string }[] } {
  const payload = { status: "ok", operation, ...data };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

export function fail(operation: string, error: string, extra: Json = {}): { content: { type: "text"; text: string }[]; isError?: boolean } {
  const payload = { status: "error", operation, error, ...extra };
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: true };
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
