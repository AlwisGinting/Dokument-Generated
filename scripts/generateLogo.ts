import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

const SIZE = 512;
const pixels = Buffer.alloc(SIZE * SIZE * 4);
const target = path.resolve(process.cwd(), "public", "assets", "logo_paud.png");

function color(hex: string): [number, number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  ];
}

function paint(x: number, y: number, fill: [number, number, number, number]) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    return;
  }
  const offset = (y * SIZE + x) * 4;
  pixels[offset] = fill[0];
  pixels[offset + 1] = fill[1];
  pixels[offset + 2] = fill[2];
  pixels[offset + 3] = fill[3];
}

function circle(
  centerX: number,
  centerY: number,
  radius: number,
  fill: [number, number, number, number],
) {
  for (let y = Math.max(0, centerY - radius); y <= Math.min(SIZE - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(SIZE - 1, centerX + radius); x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy <= radius * radius) {
        paint(x, y, fill);
      }
    }
  }
}

function rectangle(
  left: number,
  top: number,
  width: number,
  height: number,
  fill: [number, number, number, number],
) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      paint(x, y, fill);
    }
  }
}

function polygon(
  points: Array<[number, number]>,
  fill: [number, number, number, number],
) {
  const minX = Math.max(0, Math.min(...points.map(([x]) => x)));
  const maxX = Math.min(SIZE - 1, Math.max(...points.map(([x]) => x)));
  const minY = Math.max(0, Math.min(...points.map(([, y]) => y)));
  const maxY = Math.min(SIZE - 1, Math.max(...points.map(([, y]) => y)));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      let inside = false;
      for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const [currentX, currentY] = points[index];
        const [previousX, previousY] = points[previous];
        const crosses =
          currentY > y !== previousY > y &&
          x <
            ((previousX - currentX) * (y - currentY)) /
              (previousY - currentY) +
              currentX;
        if (crosses) {
          inside = !inside;
        }
      }
      if (inside) {
        paint(x, y, fill);
      }
    }
  }
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function createLogo(): Buffer {
  const paleGreen = color("#e6f4eb");
  const darkGreen = color("#17623b");
  const deeperGreen = color("#124b30");
  const white = color("#ffffff");
  const blue = color("#5ba5d8");
  const yellow = color("#f5bf4f");
  const skin = color("#f1c6a5");

  circle(256, 256, 232, paleGreen);
  circle(256, 256, 215, darkGreen);
  polygon([[100, 258], [256, 118], [412, 258]], white);
  rectangle(128, 250, 256, 164, white);
  rectangle(151, 274, 210, 12, paleGreen);

  rectangle(158, 291, 54, 45, blue);
  rectangle(300, 291, 54, 45, blue);
  rectangle(220, 320, 72, 94, deeperGreen);
  circle(256, 320, 36, deeperGreen);
  rectangle(248, 365, 16, 49, color("#d6eadc"));

  circle(191, 367, 24, skin);
  circle(321, 367, 24, skin);
  circle(191, 358, 25, yellow);
  circle(321, 358, 25, color("#f28a73"));
  circle(191, 364, 19, skin);
  circle(321, 364, 19, skin);
  rectangle(160, 391, 62, 31, yellow);
  rectangle(290, 391, 62, 31, blue);
  circle(191, 394, 31, yellow);
  circle(321, 394, 31, blue);
  rectangle(168, 394, 46, 28, yellow);
  rectangle(298, 394, 46, 28, blue);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8;
  header[9] = 6;

  const scanlines = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  for (let y = 0; y < SIZE; y += 1) {
    const rowOffset = y * (SIZE * 4 + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  try {
    await access(target);
    console.log("Logo PAUD sudah tersedia; tidak ada file yang diubah.");
    return;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, createLogo());
  console.log(`Logo PAUD berhasil dibuat: ${target}`);
}

main().catch((error: unknown) => {
  console.error("Gagal membuat logo PAUD:", error);
  process.exitCode = 1;
});
