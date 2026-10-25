import fs from "node:fs";

export interface PdfRepairResult { ok: boolean; output: Buffer; notes: string[]; error?: string }

export function repairPdf(input: Buffer): PdfRepairResult {
  const notes: string[] = [];
  const text = input.toString("binary");
  // find root object number from existing trailer
  let root = 1;
  const rootMatch = text.match(/\/Root\s+(\d+)\s+\d+\s+R/);
  if (rootMatch) root = parseInt(rootMatch[1], 10);

  // find all objects
  const objRegex = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  const objects: { num: number; gen: number; body: string; offset: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = objRegex.exec(text)) !== null) {
    objects.push({ num: parseInt(m[1], 10), gen: parseInt(m[2], 10), body: m[3], offset: m.index });
  }
  if (objects.length === 0) return { ok: false, output: input, notes, error: "no PDF objects found" };

  // dedup by object number (keep last)
  const byNum = new Map<number, { num: number; gen: number; body: string }>();
  for (const o of objects) byNum.set(o.num, { num: o.num, gen: o.gen, body: o.body });

  // rebuild
  const parts: string[] = [];
  parts.push("%PDF-1.4\n");
  const offsets: { num: number; off: number }[] = [];
  for (const o of byNum.values()) {
    const off = parts.join("").length;
    offsets.push({ num: o.num, off });
    parts.push(`${o.num} ${o.gen} obj${o.body}endobj\n`);
  }
  const xrefOff = parts.join("").length;
  parts.push("xref\n");
  const nums = [...byNum.keys()].sort((a, b) => a - b);
  const maxNum = nums[nums.length - 1];
  parts.push(`0 ${maxNum + 1}\n`);
  parts.push("0000000000 65535 f \n");
  // build offset lookup
  const offMap = new Map(offsets.map(o => [o.num, o.off]));
  for (let i = 1; i <= maxNum; i++) {
    const off = offMap.get(i);
    if (off !== undefined) {
      parts.push(`${String(off).padStart(10, "0")} 00000 n \n`);
    } else {
      parts.push("0000000000 65535 f \n");
    }
  }
  parts.push("trailer\n");
  parts.push(`<< /Size ${maxNum + 1} /Root ${root} 0 R >>\n`);
  parts.push("startxref\n");
  parts.push(`${xrefOff}\n`);
  parts.push("%%EOF\n");

  const out = Buffer.from(parts.join(""), "binary");
  notes.push(`rebuilt xref with ${byNum.size} objects; root=${root}`);
  return { ok: true, output: out, notes };
}
