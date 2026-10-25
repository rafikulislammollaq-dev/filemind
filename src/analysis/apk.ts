import fs from "node:fs";

// Android binary XML string pool extraction
export function extractStringsFromBinaryXml(buf: Buffer): string[] {
  const strings: string[] = [];
  if (buf.length < 8) return strings;
  // magic: 0x00080003
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x00080003) return strings;
  // string pool chunk follows (type 0x001C0001)
  let off = 8;
  // skip to string pool: find chunk type 0x001C0001
  while (off + 8 <= buf.length) {
    const chunkType = buf.readUInt16LE(off);
    const headerSize = buf.readUInt16LE(off + 2);
    const chunkSize = buf.readUInt32LE(off + 4);
    if (chunkType === 0x0001 && headerSize === 0x001C) {
      // string pool
      const stringCount = buf.readUInt32LE(off + 8);
      const styleCount = buf.readUInt32LE(off + 12);
      const flags = buf.readUInt32LE(off + 16);
      const stringsStart = buf.readUInt32LE(off + 20);
      const stylesStart = buf.readUInt32LE(off + 24);
      const isUtf8 = (flags & 0x100) !== 0;
      const offsetsBase = off + headerSize;
      for (let i = 0; i < stringCount && i < 10000; i++) {
        const strOff = buf.readUInt32LE(offsetsBase + i * 4);
        const pos = off + stringsStart + strOff;
        if (pos + 2 > buf.length) continue;
        try {
          if (isUtf8) {
            const len = buf[pos];
            // utf8 length (1 or 2 bytes); assume 1 byte for simplicity
            const byteLen = buf[pos + 1 + len] === 0 ? buf[pos + 1] : buf[pos + 1];
            // Actually UTF-8: char count then byte count (ULEB128-ish). Simpler: read until null
            let end = pos + 2;
            while (end < buf.length && buf[end] !== 0) end++;
            const s = buf.toString("utf8", pos + 2, end);
            if (s.length > 0) strings.push(s);
          } else {
            const charCount = buf.readUInt16LE(pos);
            const s = buf.toString("utf16le", pos + 2, pos + 2 + charCount * 2);
            if (s.length > 0) strings.push(s);
          }
        } catch {}
      }
      break;
    }
    if (chunkSize < 8) break;
    off += chunkSize;
  }
  return strings;
}

export async function inspectApk(inputPath: string): Promise<{ entries: string[]; manifestStrings: string[]; isApk: boolean }> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(inputPath);
  const entries = zip.getEntries().map((e: any) => e.entryName);
  const isApk = entries.includes("AndroidManifest.xml");
  let manifestStrings: string[] = [];
  if (isApk) {
    try {
      const e = zip.getEntry("AndroidManifest.xml");
      if (e) manifestStrings = extractStringsFromBinaryXml(e.getData());
    } catch {}
  }
  return { entries, manifestStrings, isApk };
}
