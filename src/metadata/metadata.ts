import fs from "node:fs";
import path from "node:path";
import { resolveInputPath, checkFileSize } from "../policy/pathPolicy.js";
import { identifyFile } from "../identification/identify.js";

export interface MetadataField { key: string; value: unknown; source: string; }

export async function inspectMetadata(inputPath: string, maxItems = 200): Promise<{ fields: MetadataField[]; unsupported: string[]; errors: string[]; warnings: string[] }> {
  const p = resolveInputPath(inputPath);
  checkFileSize(p);
  const fields: MetadataField[] = [];
  const unsupported: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = await identifyFile(p);
  const ext = id.detected?.ext ?? id.extension;
  const stat = fs.statSync(p);
  fields.push({ key: "file.size", value: stat.size, source: "filesystem" });
  fields.push({ key: "file.mtime", value: stat.mtime.toISOString(), source: "filesystem" });
  fields.push({ key: "file.path", value: p, source: "filesystem" });
  fields.push({ key: "detected.format", value: id.detected?.ext ?? null, source: "identification" });
  fields.push({ key: "detected.mime", value: id.detected?.mime ?? null, source: "identification" });

  // Images via sharp
  if (["jpg","jpeg","png","gif","webp","bmp","tiff","tif"].includes(ext)) {
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(p).metadata();
      for (const [k, v] of Object.entries(meta)) {
        if (v !== undefined) fields.push({ key: `image.${k}`, value: v, source: "sharp" });
      }
    } catch (e: any) {
      errors.push(`sharp metadata failed: ${e?.message ?? e}`);
    }
  }

  // PDF via pdf-parse
  if (ext === "pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const data = fs.readFileSync(p);
      const parser = new PDFParse({ data });
      const infoRes = await parser.getInfo();
      const textRes = await parser.getText();
      const parsed: any = { numpages: (textRes.pages || []).length, text: textRes.text, info: (infoRes as any).info, metadata: (infoRes as any).metadata };
      fields.push({ key: "pdf.pages", value: parsed.numpages, source: "pdf-parse" });
      fields.push({ key: "pdf.text_length", value: parsed.text?.length ?? 0, source: "pdf-parse" });
      if (parsed.info) {
        for (const [k, v] of Object.entries(parsed.info)) {
          fields.push({ key: `pdf.info.${k}`, value: v, source: "pdf-parse" });
        }
      }
      if (parsed.metadata) {
        fields.push({ key: "pdf.metadata_raw", value: String(parsed.metadata).slice(0, 2000), source: "pdf-parse" });
      }
    } catch (e: any) {
      errors.push(`pdf-parse failed: ${e?.message ?? e}`);
    }
  }

  // ZIP
  if (ext === "zip" || id.detected?.ext === "zip") {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(p);
      const entries = zip.getEntries();
      fields.push({ key: "zip.entry_count", value: entries.length, source: "adm-zip" });
      for (let i = 0; i < Math.min(entries.length, 50); i++) {
        const e = entries[i];
        fields.push({ key: `zip.entry[${i}].name`, value: e.entryName, source: "adm-zip" });
        fields.push({ key: `zip.entry[${i}].size`, value: e.header.size, source: "adm-zip" });
        fields.push({ key: `zip.entry[${i}].compressed`, value: e.header.compressedSize, source: "adm-zip" });
      }
      if (entries.length > 50) warnings.push(`ZIP has ${entries.length} entries; only first 50 reported`);
    } catch (e: any) {
      errors.push(`zip inspection failed: ${e?.message ?? e}`);
    }
  }

  // Text encoding
  if (["txt","md","json","xml","yaml","yml","csv","log","js","ts","py","html"].includes(ext)) {
    try {
      const chardet = await import("chardet");
      const buf = fs.readFileSync(p);
      const enc = (chardet as any).detect?.(buf) ?? (chardet as any).default?.detect?.(buf);
      fields.push({ key: "text.encoding", value: enc, source: "chardet" });
      fields.push({ key: "text.bytes", value: buf.length, source: "filesystem" });
      // line endings
      const text = buf.toString("utf8");
      const crlf = (text.match(/\r\n/g) || []).length;
      const lf = (text.match(/\n/g) || []).length - crlf;
      const cr = (text.match(/\r/g) || []).length - crlf;
      fields.push({ key: "text.lineEndings.crlf", value: crlf, source: "analysis" });
      fields.push({ key: "text.lineEndings.lf", value: lf, source: "analysis" });
      fields.push({ key: "text.lineEndings.cr", value: cr, source: "analysis" });
    } catch (e: any) {
      errors.push(`text analysis failed: ${e?.message ?? e}`);
    }
  }

  // SQLite
  if (ext === "sqlite" || ext === "db" || id.detected?.ext === "sqlite") {
    try {
      const { sqliteAvailable, sqliteIntegrity, sqliteTables, sqliteSchema } = await import("../adapters/sqliteAdapter.js");
      if (await sqliteAvailable()) {
        const tables = await sqliteTables(p);
        fields.push({ key: "sqlite.tables", value: tables, source: "sqlite3" });
        fields.push({ key: "sqlite.table_count", value: tables.length, source: "sqlite3" });
        const ic = await sqliteIntegrity(p);
        fields.push({ key: "sqlite.integrity_check", value: ic.result, source: "sqlite3" });
        const schema = await sqliteSchema(p);
        fields.push({ key: "sqlite.schema", value: schema.slice(0, 4000), source: "sqlite3" });
      } else {
        unsupported.push("sqlite3 CLI not available");
      }
    } catch (e: any) {
      errors.push(`sqlite inspection failed: ${e?.message ?? e}`);
    }
  }

  // ELF / PE basic headers
  if (ext === "elf" || ext === "exe" || ext === "dll" || id.detected?.ext === "elf" || id.detected?.ext === "exe") {
    try {
      const buf = fs.readFileSync(p);
      if (buf.length >= 4 && buf[0] === 0x7F && buf[1] === 0x45 && buf[2] === 0x4C && buf[3] === 0x46) {
        // ELF
        const ei_class = buf[4]; // 1=32,2=64
        const ei_data = buf[5]; // 1=LE,2=BE
        fields.push({ key: "elf.class", value: ei_class === 1 ? "32-bit" : ei_class === 2 ? "64-bit" : ei_class, source: "binary parse" });
        fields.push({ key: "elf.data", value: ei_data === 1 ? "little-endian" : ei_data === 2 ? "big-endian" : ei_data, source: "binary parse" });
        // type at offset 16 (e_type) 2 bytes
        const typeOff = 16;
        const eType = ei_data === 2 ? (buf[typeOff] << 8) | buf[typeOff+1] : buf[typeOff] | (buf[typeOff+1] << 8);
        const types: Record<number,string> = { 1: "relocatable", 2: "executable", 3: "shared object", 4: "core" };
        fields.push({ key: "elf.type", value: types[eType] ?? eType, source: "binary parse" });
        // section/program header counts
        if (ei_class === 1) {
          const shnum = buf.readUInt16LE(48);
          const phnum = buf.readUInt16LE(44);
          fields.push({ key: "elf.section_header_count", value: shnum, source: "binary parse" });
          fields.push({ key: "elf.program_header_count", value: phnum, source: "binary parse" });
        } else if (ei_class === 2) {
          const shnum = buf.readUInt16LE(60);
          const phnum = buf.readUInt16LE(56);
          fields.push({ key: "elf.section_header_count", value: shnum, source: "binary parse" });
          fields.push({ key: "elf.program_header_count", value: phnum, source: "binary parse" });
        }
      } else if (buf.length >= 2 && buf[0] === 0x4D && buf[1] === 0x5A) {
        // PE
        const peOffset = buf.readUInt32LE(0x3C);
        fields.push({ key: "pe.header_offset", value: peOffset, source: "binary parse" });
        if (peOffset + 4 <= buf.length && buf[peOffset] === 0x50 && buf[peOffset+1] === 0x45) {
          fields.push({ key: "pe.signature", value: "PE", source: "binary parse" });
          const machine = buf.readUInt16LE(peOffset + 4);
          const machines: Record<number,string> = { 0x14c: "i386", 0x8664: "x86-64", 0x1c0: "ARM", 0xaa64: "ARM64" };
          fields.push({ key: "pe.machine", value: machines[machine] ?? machine, source: "binary parse" });
          const numSections = buf.readUInt16LE(peOffset + 6);
          fields.push({ key: "pe.number_of_sections", value: numSections, source: "binary parse" });
          // section table
          const optHeaderSize = buf.readUInt16LE(peOffset + 20);
          const sectionTableOff = peOffset + 24 + optHeaderSize;
          const sections: string[] = [];
          for (let i = 0; i < numSections && i < 96; i++) {
            const off = sectionTableOff + i * 40;
            if (off + 8 > buf.length) break;
            const name = buf.toString("ascii", off, off + 8).replace(/\0/g, "");
            sections.push(name);
          }
          fields.push({ key: "pe.sections", value: sections, source: "binary parse" });
        }
      }
    } catch (e: any) {
      errors.push(`executable parse failed: ${e?.message ?? e}`);
    }
  }
  // Media blocks inserted here
  // WAV
  if (ext === "wav") {
    try {
      const buf = fs.readFileSync(p);
      if (buf.length >= 12 && buf.toString("ascii",0,4) === "RIFF" && buf.toString("ascii",8,12) === "WAVE") {
        fields.push({ key: "media.container", value: "WAV", source: "binary parse" });
        let off = 12;
        while (off + 8 <= buf.length) {
          const id = buf.toString("ascii", off, off+4);
          const size = buf.readUInt32LE(off+4);
          if (id === "fmt ") {
            const audioFormat = buf.readUInt16LE(off+8);
            const channels = buf.readUInt16LE(off+10);
            const sampleRate = buf.readUInt32LE(off+12);
            const bitsPerSample = buf.readUInt16LE(off+22);
            fields.push({ key: "audio.format", value: audioFormat === 1 ? "PCM" : audioFormat, source: "binary parse" });
            fields.push({ key: "audio.channels", value: channels, source: "binary parse" });
            fields.push({ key: "audio.sample_rate", value: sampleRate, source: "binary parse" });
            fields.push({ key: "audio.bits_per_sample", value: bitsPerSample, source: "binary parse" });
          }
          if (id === "data") fields.push({ key: "audio.data_bytes", value: size, source: "binary parse" });
          off += 8 + size + (size % 2);
          if (off > buf.length) break;
        }
      }
    } catch (e: any) { errors.push(`wav parse failed: ${e?.message ?? e}`); }
  }
  // MP3
  if (ext === "mp3") {
    try {
      const buf = fs.readFileSync(p);
      fields.push({ key: "media.container", value: "MP3", source: "identification" });
      if (buf.length >= 10 && buf.toString("ascii",0,3) === "ID3") {
        const version = buf[3];
        fields.push({ key: "mp3.id3_version", value: `2.${version}`, source: "binary parse" });
        const size = (buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9];
        fields.push({ key: "mp3.id3_tag_size", value: size, source: "binary parse" });
      }
      // frame count heuristic
      let frames = 0;
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i] === 0xFF && (buf[i+1] & 0xE0) === 0xE0) frames++;
      }
      fields.push({ key: "mp3.frame_sync_count", value: frames, source: "binary parse" });
    } catch (e: any) { errors.push(`mp3 parse failed: ${e?.message ?? e}`); }
  }
  // MP4/MOV
  if (ext === "mp4" || ext === "mov" || ext === "m4a") {
    try {
      const buf = fs.readFileSync(p);
      fields.push({ key: "media.container", value: ext.toUpperCase(), source: "identification" });
      let off = 0;
      const boxes: string[] = [];
      while (off + 8 <= buf.length) {
        const size = buf.readUInt32BE(off);
        const type = buf.toString("ascii", off+4, off+8);
        if (size < 8 || off + size > buf.length) break;
        boxes.push(type);
        off += size;
        if (boxes.length > 50) break;
      }
      fields.push({ key: "mp4.top_level_boxes", value: boxes, source: "binary parse" });
    } catch (e: any) { errors.push(`media parse failed: ${e?.message ?? e}`); }
  }

  // APK
  if (ext === "apk" || id.detected?.ext === "apk") {
    try {
      const { inspectApk } = await import("../analysis/apk.js");
      const info = await inspectApk(p);
      fields.push({ key: "apk.entry_count", value: info.entries.length, source: "adm-zip" });
      fields.push({ key: "apk.manifest_strings", value: info.manifestStrings.slice(0, 100), source: "binary xml parse" });
      const perms = info.manifestStrings.filter((s: string) => s.startsWith("android.permission."));
      fields.push({ key: "apk.permissions", value: perms, source: "binary xml parse" });
    } catch (e: any) { errors.push(`apk inspection failed: ${e?.message ?? e}`); }
  }

  if (!["jpg","jpeg","png","gif","webp","bmp","tiff","tif","pdf","zip","txt","md","json","xml","yaml","yml","csv","log","js","ts","py","html","wav","mp3","mp4","mov","m4a","mkv","webm","sqlite","db","elf","exe","dll","docx","xlsx","pptx"].includes(ext) && !id.detected) {
    unsupported.push(`no metadata handler for format '${ext}'`);
  }

  if (fields.length > maxItems) {
    warnings.push(`metadata truncated to ${maxItems} items`);
    fields.splice(maxItems);
  }
  return { fields, unsupported, errors, warnings };
}
