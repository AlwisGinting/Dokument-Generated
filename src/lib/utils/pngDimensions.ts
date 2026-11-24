export interface PngDimensions {
  width: number;
  height: number;
}

export function getPngDimensions(buffer: Buffer): PngDimensions {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    buffer.length < 24 ||
    !buffer.subarray(0, signature.length).equals(signature) ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Data logo tidak berisi gambar PNG yang valid.");
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error("Dimensi gambar logo PNG tidak valid.");
  }
  return { width, height };
}

export function fitPngDimensions(
  buffer: Buffer,
  maxWidth: number,
  maxHeight: number,
): PngDimensions {
  const source = getPngDimensions(buffer);
  const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}
