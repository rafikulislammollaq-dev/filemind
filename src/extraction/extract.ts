import fs from "node:fs";
import path from "node:path";
import { resolveInputPath, resolveOutputDir, checkFileSize } from "../policy/pathPolicy.js";
import { sha256File, sha256Buffer, nowIso } from "../util/hash.js";
import { identifyFile } from "../identification/identify.js";

export interface ExtractedItem { id: string; type: string; path: string; source: string; size: number; sha256: string; status: string; }

export async function extractContent(inputPath: string, outputDir?: string, contentTypes?: string[], maxItems = 100, maxTotalBytes = 50 * 1024 * 1024): Promise<{ items: ExtractedItem[]; failed: { item: string; error: string }[]; warnings: string[]; manifest_path: string | null }> {
  const p = resolveInputPath(inputPath);
  checkFileSize(p);
  const outDir = resolveOutputDir(outputDir);
  const jobDir = path.join(outDir, `extract-${Date.now()}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const types = contentTypes && contentTypes.length ? contentTypes : ["text", "images", "archives", "metadata"];
  const id = await identifyFile(p);
  const ext = id.detected?.ext ?? id.extension;
  const items: ExtractedItem[] = [];
  const failed: { item: string; error: string }[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;
  let counter = 0;

  function addItem(type: string, filePath: string, source: string, status = "extracted") {
    const st = fs.statSync(filePath);
    if (totalBytes + st.size > maxTotalBytes) { warnings.push("max total bytes reached; stopping"); return false; }
    if (items.length >= maxItems) { warnings.push("max items reached; stopping"); return false; }
    totalBytes += st.size;
    items.push({ id: `item-${++counter}`, type, path: filePath, source, size: st.size, sha256: sha256File(filePath), status });
    return true;
  }

  // Text
  if (types.includes("text") || types.includes("all")) {
    if (["txt","md","json","xml","yaml","yml","csv","log","js","ts","py","html","css"].includes(ext)) {
      try {
        const dest = path.join(jobDir, path.basename(p));
        fs.copyFileSync(p, dest);
        addItem("text", dest, "original text file");
      } catch (e: any) { failed.push({ item: p, error: e?.message ?? String(e) }); }
    }
    // PDF text
    if (ext === "pdf") {
      try {
        const { PDFParse } = await import("pdf-parse");
        const data = fs.readFileSync(p);
        const parser = new PDFParse({ data });
        const textRes = await parser.getText();
        const parsed: any = { text: textRes.text };
        const dest = path.join(jobDir, "extracted-text.txt");
        fs.writeFileSync(dest, parsed.text ?? "");
        addItem("text", dest, "pdf text extraction");
      } catch (e: any) { failed.push({ item: "pdf text", error: e?.message ?? String(e) }); }
    }
  }

  // Images: if input is image, copy; also extract embedded images from PDF? basic: copy original
  if (types.includes("images") || types.includes("all")) {
    if (["jpg","jpeg","png","gif","webp","bmp","tiff","tif"].includes(ext)) {
      try {
        const dest = path.join(jobDir, path.basename(p));
        fs.copyFileSync(p, dest);
        addItem("image", dest, "original image");
      } catch (e: any) { failed.push({ item: p, error: e?.message ?? String(e) }); }
    }
  }

  // Archives
  if (types.includes("archives") || types.includes("all")) {
    if (ext === "zip" || id.detected?.ext === "zip") {
      try {
        const AdmZip = (await import("adm-zip")).default;
        const zip = new AdmZip(p);
        const entries = zip.getEntries();
        const archDir = path.join(jobDir, "archive-entries");
        fs.mkdirSync(archDir, { recursive: true });
        for (const e of entries) {
          if (e.isDirectory) continue;
          if (items.length >= maxItems) { warnings.push("max items reached"); break; }
          // safe path
          const safeName = e.entryName.replace(/\\/g, "/").replace(/^\/+/, "");
          if (safeName.includes("..")) { warnings.push(`skipped unsafe entry ${e.entryName}`); continue; }
          const dest = path.join(archDir, safeName);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          try {
            const data = e.getData();
            fs.writeFileSync(dest, data);
            addItem("archive_entry", dest, `zip entry: ${e.entryName}`);
          } catch (err: any) {
            failed.push({ item: e.entryName, error: err?.message ?? String(err) });
          }
        }
      } catch (e: any) { failed.push({ item: "zip", error: e?.message ?? String(e) }); }
    }
    // tar.gz? basic gzip single file
    if (ext === "gz") {
      try {
        const zlib = await import("node:zlib");
        const data = fs.readFileSync(p);
        const out = zlib.gunzipSync(data);
        const dest = path.join(jobDir, path.basename(p).replace(/\.gz$/i, ""));
        fs.writeFileSync(dest, out);
        addItem("archive_entry", dest, "gzip decompress");
      } catch (e: any) { failed.push({ item: "gzip", error: e?.message ?? String(e) }); }
    }
  }

  // Office documents: treat as zip and extract document.xml text? basic: extract entries
  if (["docx","xlsx","pptx"].includes(ext)) {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(p);
      const entries = zip.getEntries();
      const archDir = path.join(jobDir, "office-entries");
      fs.mkdirSync(archDir, { recursive: true });
      for (const e of entries) {
        if (e.isDirectory) continue;
        const safeName = e.entryName.replace(/\\/g, "/").replace(/^\/+/, "");
        if (safeName.includes("..")) continue;
        const dest = path.join(archDir, safeName);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        try {
          fs.writeFileSync(dest, e.getData());
          addItem("office_part", dest, `office part: ${e.entryName}`);
        } catch (err: any) { failed.push({ item: e.entryName, error: err?.message ?? String(err) }); }
      }
    } catch (e: any) { failed.push({ item: ext, error: e?.message ?? String(e) }); }
  }

  // Tar archives
  if (ext === "tar" || ext === "tgz" || p.toLowerCase().endsWith(".tar.gz") || p.toLowerCase().endsWith(".tar.bz2")) {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      const archDir = path.join(jobDir, "tar-entries");
      fs.mkdirSync(archDir, { recursive: true });
      await exec("tar", ["-xf", p, "-C", archDir], { timeout: 60000 });
      // walk extracted files
      function walk(dir: string) {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          const st = fs.statSync(full);
          if (st.isDirectory()) walk(full);
          else {
            if (items.length < maxItems && totalBytes + st.size <= maxTotalBytes) {
              addItem("archive_entry", full, `tar entry: ${path.relative(archDir, full)}`);
            }
          }
        }
      }
      walk(archDir);
    } catch (e: any) { failed.push({ item: "tar", error: e?.message ?? String(e) }); }
  }
  const manifest = {
    created_at: nowIso(),
    input_path: p,
    input_sha256: sha256File(p),
    output_dir: jobDir,
    items: items.map(i => ({ ...i })),
    failed,
    warnings,
  };
  const manifestPath = path.join(jobDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return { items, failed, warnings, manifest_path: manifestPath };
}
