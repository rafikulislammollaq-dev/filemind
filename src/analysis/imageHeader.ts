export interface ImageHeaderInfo { format: string; width?: number; height?: number; bits?: number; }

export function parseImageHeader(buf: Buffer): ImageHeaderInfo | null {
  if (buf.length < 8) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    if (buf.length >= 24) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      const bits = buf[24];
      return { format: "png", width, height, bits };
    }
  }
  // JPEG
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    // scan for SOF
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] === 0xFF) {
        const marker = buf[i+1];
        if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2 || marker === 0xC3) {
          const height = buf.readUInt16BE(i+5);
          const width = buf.readUInt16BE(i+7);
          const bits = buf[i+4];
          return { format: "jpeg", width, height, bits };
        }
        if (i + 3 < buf.length) {
          const size = buf.readUInt16BE(i+2);
          i += 2 + size;
          continue;
        }
      }
      i++;
    }
    return { format: "jpeg" };
  }
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    if (buf.length >= 10) {
      const width = buf.readUInt16LE(6);
      const height = buf.readUInt16LE(8);
      return { format: "gif", width, height };
    }
  }
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4D) {
    if (buf.length >= 26) {
      const width = buf.readInt32LE(18);
      const height = buf.readInt32LE(22);
      return { format: "bmp", width, height };
    }
  }
  // WebP
  if (buf.toString("ascii",0,4) === "RIFF" && buf.toString("ascii",8,12) === "WEBP") {
    return { format: "webp" };
  }
  return null;
}
