import type { SpjPart } from "@/lib/types/lpj";

export const MAX_PART_TOTAL = 1_000_000;

export function validateSpjParts(parts: readonly SpjPart[]): string[] {
  const issues: string[] = [];

  for (const part of parts) {
    if (!part.is_barang) {
      if (part.items.length > 0) {
        issues.push(`${part.kode_part}: kuitansi utilitas/honor tidak boleh memiliki rincian barang.`);
      }
      continue;
    }

    const itemTotalCents = part.items.reduce(
      (total, item) => total + Math.round(item.jumlah_harga * 100),
      0,
    );
    const partTotalCents = Math.round(part.total_part * 100);
    if (part.items.length === 0) {
      issues.push(`${part.kode_part}: tambahkan minimal satu rincian barang.`);
    }
    if (itemTotalCents > MAX_PART_TOTAL * 100) {
      issues.push(`${part.kode_part}: total barang melebihi Rp 1.000.000.`);
    }
    if (itemTotalCents !== partTotalCents) {
      issues.push(`${part.kode_part}: total Part tidak sama dengan jumlah rincian.`);
    }
    if (
      part.items.some(
        (item) =>
          !item.nama_barang.trim() ||
          !Number.isFinite(item.harga_satuan) ||
          !Number.isFinite(item.jumlah_harga) ||
          item.harga_satuan < 0 ||
          item.jumlah_harga < 0,
      )
    ) {
      issues.push(`${part.kode_part}: nama barang dan nominal rincian harus valid.`);
    }
  }

  return issues;
}
