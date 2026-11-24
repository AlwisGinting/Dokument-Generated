import { MAX_LOGO_DATA_URL_LENGTH } from "@/lib/utils/logoDataUrl";

const MAX_SOURCE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 512;

export async function convertSchoolLogoToPng(file: File): Promise<string> {
  if (file.type !== "image/png" && file.type !== "image/jpeg") {
    throw new Error("Pilih file logo PNG atau JPG.");
  }
  if (file.size === 0 || file.size > MAX_SOURCE_SIZE) {
    throw new Error("Ukuran file logo harus di bawah 8 MiB.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width < 1 ||
      bitmap.height < 1 ||
      bitmap.width > 10_000 ||
      bitmap.height > 10_000
    ) {
      throw new Error("Dimensi gambar logo tidak didukung.");
    }

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Browser tidak dapat memproses gambar logo.");
    }
    context.drawImage(bitmap, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/png");
    if (dataUrl.length > MAX_LOGO_DATA_URL_LENGTH) {
      throw new Error("Logo hasil konversi terlalu besar. Gunakan gambar yang lebih sederhana.");
    }
    return dataUrl;
  } finally {
    bitmap.close();
  }
}
