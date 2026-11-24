import type {
  BkuTransaction,
  SpjItem,
  SpjPart,
  VendorCategory,
} from "@/lib/types/lpj";

export const MAX_BARANG_PART_CENTS = 100_000_000;

interface IndexedTransaction {
  transaction: BkuTransaction;
  sourceIndex: number;
}

interface ExpandedItem {
  transaction: BkuTransaction;
  sourceIndex: number;
  amountCents: number;
}

type SplitUnit =
  | { kind: "fixed"; sourceIndex: number; parts: Array<{ transaction: BkuTransaction; bulan?: string }> }
  | { kind: "barang"; sourceIndex: number; entries: IndexedTransaction[] };

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function toCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError("Nominal transaksi harus berupa angka nonnegatif.");
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("Nominal transaksi berada di luar rentang yang didukung.");
  }
  return cents;
}

function fromCents(cents: number): number {
  return cents / 100;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function monthFromDate(date: string): string {
  const isoMatch = date.match(/^\d{4}-(\d{2})-\d{2}$/);
  const localMatch = date.match(/^\d{1,2}[/-](\d{1,2})[/-]\d{4}$/);
  const month = isoMatch
    ? Number(isoMatch[1])
    : localMatch
      ? Number(localMatch[1])
      : Number.NaN;
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? MONTHS[month - 1]
    : "Belum ditentukan";
}

function monthForTransaction(transaction: BkuTransaction): string {
  return transaction.bulan?.trim() || monthFromDate(transaction.tanggal);
}

function sanitizeCode(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function toSpjItem(
  transaction: BkuTransaction,
  no: number,
  amountCents = toCents(transaction.pengeluaran),
): SpjItem {
  return {
    no,
    nama_barang: transaction.uraian.trim(),
    diantar: transaction.tanggal,
    banyaknya: "1",
    harga_satuan: fromCents(amountCents),
    jumlah_harga: fromCents(amountCents),
  };
}

function buildPart(
  transactions: readonly BkuTransaction[],
  items: readonly SpjItem[],
  ordinal: number,
  bulanAlokasi: string,
  totalCents = transactions.reduce(
    (total, transaction) => total + toCents(transaction.pengeluaran),
    0,
  ),
): SpjPart {
  const first = transactions[0];
  const baseCode = sanitizeCode(first.no_bukti || first.kode_kegiatan || "BUKTI");
  const dateCode = sanitizeCode(first.tanggal || "TANPA-TANGGAL");
  const code = `${baseCode}-${String(ordinal).padStart(3, "0")}`;
  const category: VendorCategory | null =
    first.kategori === "BELANJA_BARANG" ? first.sub_kategori_toko ?? "ATK" : null;

  return {
    id: `spj-${dateCode}-${code}`,
    kode_part: code,
    is_barang: first.kategori === "BELANJA_BARANG",
    kategori_bku: first.kategori,
    kategori_toko: category,
    bulan_alokasi: bulanAlokasi,
    tanggal_transaksi: first.tanggal,
    nama_penjual: "",
    alamat_penjual: "",
    uraian_singkat: first.uraian.trim().slice(0, 120),
    items: items.map((item, index) => ({ ...item, no: index + 1 })),
    total_part: fromCents(totalCents),
  };
}

function expandOversizedItems(entries: readonly IndexedTransaction[]): ExpandedItem[] {
  const expanded: ExpandedItem[] = [];

  for (const entry of entries) {
    const cents = toCents(entry.transaction.pengeluaran);
    if (cents === 0) {
      continue;
    }

    let remaining = cents;
    while (remaining > 0) {
      const amountCents = Math.min(remaining, MAX_BARANG_PART_CENTS);
      expanded.push({
        transaction: entry.transaction,
        sourceIndex: entry.sourceIndex,
        amountCents,
      });
      remaining -= amountCents;
    }
  }

  return expanded;
}

function packFirstFitDecreasing(entries: readonly IndexedTransaction[]): ExpandedItem[][] {
  const items = expandOversizedItems(entries).sort(
    (left, right) =>
      right.amountCents - left.amountCents ||
      left.sourceIndex - right.sourceIndex,
  );
  const bins: Array<{ amountCents: number; items: ExpandedItem[] }> = [];

  for (const item of items) {
    let bin = bins.find(
      (candidate) =>
        candidate.amountCents + item.amountCents <= MAX_BARANG_PART_CENTS,
    );
    if (!bin) {
      bin = { amountCents: 0, items: [] };
      bins.push(bin);
    }
    bin.items.push(item);
    bin.amountCents += item.amountCents;
  }

  return bins.map((bin) =>
    bin.items.sort((left, right) => left.sourceIndex - right.sourceIndex),
  );
}

function duplicateKey(transaction: BkuTransaction): string {
  return [
    transaction.tanggal.trim(),
    transaction.kode_kegiatan.trim(),
    transaction.kode_rekening.trim(),
    transaction.no_bukti.trim(),
    normalizeText(transaction.uraian),
    transaction.kategori,
    transaction.sub_kategori_toko ?? "",
    toCents(transaction.pengeluaran),
  ].join("\u001f");
}

function makeSplitUnits(transactions: readonly BkuTransaction[]): SplitUnit[] {
  const entries = transactions
    .map((transaction, sourceIndex) => ({ transaction, sourceIndex }))
    .filter((entry) => entry.transaction.pengeluaran > 0);
  const duplicateGroups = new Map<string, IndexedTransaction[]>();

  for (const entry of entries) {
    const key = duplicateKey(entry.transaction);
    const group = duplicateGroups.get(key) ?? [];
    group.push(entry);
    duplicateGroups.set(key, group);
  }

  const consumed = new Set<number>();
  const units: SplitUnit[] = [];
  for (const group of duplicateGroups.values()) {
    if (group.length < 2 || group[0].transaction.kategori === "HONOR_GURU") {
      continue;
    }
    group.forEach(({ sourceIndex }) => consumed.add(sourceIndex));
    units.push({
      kind: "fixed",
      sourceIndex: group[0].sourceIndex,
      parts: group.map((entry, index) => ({
        transaction: entry.transaction,
        bulan:
          entry.transaction.kategori === "UTILITAS"
            ? `Bulan ${index + 1}`
            : monthForTransaction(entry.transaction),
      })),
    });
  }

  const barangGroups = new Map<string, IndexedTransaction[]>();
  for (const entry of entries) {
    if (consumed.has(entry.sourceIndex)) {
      continue;
    }
    const transaction = entry.transaction;
    if (transaction.kategori === "BELANJA_BARANG") {
      const key = `${monthForTransaction(transaction)}\u001f${transaction.sub_kategori_toko ?? "ATK"}`;
      const group = barangGroups.get(key) ?? [];
      group.push(entry);
      barangGroups.set(key, group);
    } else {
      units.push({
        kind: "fixed",
        sourceIndex: entry.sourceIndex,
        parts: [{ transaction }],
      });
    }
  }

  for (const group of barangGroups.values()) {
    units.push({
      kind: "barang",
      sourceIndex: group[0].sourceIndex,
      entries: group,
    });
  }

  return units.sort((left, right) => left.sourceIndex - right.sourceIndex);
}

export function splitTransactionsIntoSpjParts(
  transactions: readonly BkuTransaction[],
): SpjPart[] {
  const parts: SpjPart[] = [];
  let ordinal = 0;

  for (const unit of makeSplitUnits(transactions)) {
    if (unit.kind === "fixed") {
      for (const entry of unit.parts) {
        const month = entry.bulan ?? monthForTransaction(entry.transaction);
        if (
          entry.transaction.kategori === "BELANJA_BARANG" &&
          toCents(entry.transaction.pengeluaran) > MAX_BARANG_PART_CENTS
        ) {
          const bins = packFirstFitDecreasing([
            {
              transaction: entry.transaction,
              sourceIndex: unit.sourceIndex,
            },
          ]);
          for (const bin of bins) {
            ordinal += 1;
            const items = bin.map((item, index) =>
              toSpjItem(
                item.transaction,
                index + 1,
                item.amountCents,
              ),
            );
            parts.push(
              buildPart(
                [entry.transaction],
                items,
                ordinal,
                month,
                bin.reduce((total, item) => total + item.amountCents, 0),
              ),
            );
          }
        } else {
          ordinal += 1;
          const items =
            entry.transaction.kategori === "BELANJA_BARANG"
              ? [toSpjItem(entry.transaction, 1)]
              : [];
          parts.push(buildPart([entry.transaction], items, ordinal, month));
        }
      }
      continue;
    }

    const bins = packFirstFitDecreasing(unit.entries);
    for (const bin of bins) {
      ordinal += 1;
      const sourceTransactions = Array.from(
        new Map(
          bin.map((item) => [item.sourceIndex, item.transaction]),
        ).values(),
      );
      const items = bin.map((item, index) =>
        toSpjItem(
          item.transaction,
          index + 1,
          item.amountCents,
        ),
      );
      const totalCents = bin.reduce((total, item) => total + item.amountCents, 0);
      const part = buildPart(
        sourceTransactions,
        items,
        ordinal,
        monthForTransaction(sourceTransactions[0]),
        totalCents,
      );
      if (toCents(part.total_part) !== totalCents) {
        throw new Error("Total bagian SPJ tidak sesuai dengan jumlah item yang dipaketkan.");
      }
      if (totalCents > MAX_BARANG_PART_CENTS) {
        throw new Error("Part belanja barang melampaui batas Rp 1.000.000.");
      }
      parts.push(part);
    }
  }

  return parts;
}
