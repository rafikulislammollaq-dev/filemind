import fs from "node:fs";

export interface PeImport { dll: string; functions: string[] }

export function parsePeImports(buf: Buffer): PeImport[] {
  const result: PeImport[] = [];
  if (buf.length < 64 || buf[0] !== 0x4D || buf[1] !== 0x5A) return result;
  const peOffset = buf.readUInt32LE(0x3C);
  if (peOffset + 24 > buf.length || buf[peOffset] !== 0x50 || buf[peOffset+1] !== 0x45) return result;
  const optHeaderSize = buf.readUInt16LE(peOffset + 20);
  const magic = buf.readUInt16LE(peOffset + 24);
  const is64 = magic === 0x20B;
  // import directory RVA is at optional header offset 104 (PE32) or 112 (PE32+)
  const importDirRvaOffset = peOffset + 24 + (is64 ? 112 : 104);
  if (importDirRvaOffset + 8 > buf.length) return result;
  const importRva = buf.readUInt32LE(importDirRvaOffset);
  const importSize = buf.readUInt32LE(importDirRvaOffset + 4);
  if (importRva === 0 || importSize === 0) return result;

  // build section table for RVA->offset
  const numSections = buf.readUInt16LE(peOffset + 6);
  const sectionTableOff = peOffset + 24 + optHeaderSize;
  const sections: { va: number; vs: number; raw: number; rs: number }[] = [];
  for (let i = 0; i < numSections; i++) {
    const off = sectionTableOff + i * 40;
    if (off + 40 > buf.length) break;
    sections.push({
      va: buf.readUInt32LE(off + 12),
      vs: buf.readUInt32LE(off + 8),
      raw: buf.readUInt32LE(off + 20),
      rs: buf.readUInt32LE(off + 16),
    });
  }
  function rvaToOffset(rva: number): number {
    for (const s of sections) {
      if (rva >= s.va && rva < s.va + s.vs) return rva - s.va + s.raw;
    }
    return rva; // fallback
  }

  let off = rvaToOffset(importRva);
  while (off + 20 <= buf.length) {
    const iltRva = buf.readUInt32LE(off);
    const nameRva = buf.readUInt32LE(off + 12);
    const iatRva = buf.readUInt32LE(off + 16);
    if (nameRva === 0) break;
    const nameOff = rvaToOffset(nameRva);
    let dll = "";
    let i = nameOff;
    while (i < buf.length && buf[i] !== 0) { dll += String.fromCharCode(buf[i]); i++; }
    const funcs: string[] = [];
    // read thunks from IAT (or ILT)
    const thunkRva = iltRva || iatRva;
    if (thunkRva) {
      let tOff = rvaToOffset(thunkRva);
      while (tOff + (is64 ? 8 : 4) <= buf.length) {
        const val = is64 ? Number(buf.readBigUInt64LE(tOff)) : buf.readUInt32LE(tOff);
        if (val === 0) break;
        if (!(val & (is64 ? 0x8000000000000000 : 0x80000000))) {
          const hintOff = rvaToOffset(val) + 2;
          let fn = "";
          let j = hintOff;
          while (j < buf.length && buf[j] !== 0) { fn += String.fromCharCode(buf[j]); j++; }
          if (fn) funcs.push(fn);
        }
        tOff += is64 ? 8 : 4;
      }
    }
    result.push({ dll, functions: funcs });
    off += 20;
  }
  return result;
}
