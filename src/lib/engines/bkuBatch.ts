import type {
  BkuAudit,
  BkuMetadata,
  BkuParseResult,
  UnclassifiedBkuTransaction,
} from "@/lib/types/lpj";

const MONTH_NAMES = [
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

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface BkuBatchSummary {
  metadata: BkuMetadata;
  period: string;
  transactions: UnclassifiedBkuTransaction[];
  zeroExpenseFileCount: number;
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dateParts(value: string): DateParts | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  let year: number;
  let month: number;
  let day: number;

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (local) {
    day = Number(local[1]);
    month = Number(local[2]);
    year = Number(local[3].length === 2 ? `20${local[3]}` : local[3]);
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function dateValue(value: string): number | null {
  const parts = dateParts(value);
  return parts
    ? Date.UTC(parts.year, parts.month - 1, parts.day)
    : null;
}

function transactionKey(transaction: UnclassifiedBkuTransaction): string {
  return JSON.stringify([
    transaction.tanggal.trim(),
    transaction.kode_kegiatan.trim(),
    transaction.kode_rekening.trim(),
    transaction.no_bukti.trim(),
    normalizedText(transaction.uraian),
    transaction.penerimaan,
    transaction.pengeluaran,
  ]);
}

function uniqueAcrossFiles(
  results: readonly BkuParseResult[],
): UnclassifiedBkuTransaction[] {
  const maximumOccurrences = new Map<string, number>();
  const transactions: Array<{
    transaction: UnclassifiedBkuTransaction;
    sourceIndex: number;
  }> = [];
  let sourceIndex = 0;

  for (const result of results) {
    const occurrencesInFile = new Map<string, number>();
    for (const transaction of result.transactions) {
      const key = transactionKey(transaction);
      const occurrence = (occurrencesInFile.get(key) ?? 0) + 1;
      occurrencesInFile.set(key, occurrence);
      if (occurrence > (maximumOccurrences.get(key) ?? 0)) {
        maximumOccurrences.set(key, occurrence);
        transactions.push({ transaction, sourceIndex });
      }
      sourceIndex += 1;
    }
  }

  transactions.sort((left, right) => {
    const leftDate = dateValue(left.transaction.tanggal);
    const rightDate = dateValue(right.transaction.tanggal);
    if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
      return leftDate - rightDate;
    }
    if (leftDate === null && rightDate !== null) {
      return 1;
    }
    if (leftDate !== null && rightDate === null) {
      return -1;
    }
    return left.sourceIndex - right.sourceIndex;
  });

  return transactions.map(({ transaction }) => transaction);
}

function datePoints(
  transactions: readonly UnclassifiedBkuTransaction[],
  results: readonly BkuParseResult[],
): DateParts[] {
  const fromTransactions = transactions
    .map((transaction) => dateParts(transaction.tanggal))
    .filter((parts): parts is DateParts => parts !== null);
  if (fromTransactions.length > 0) {
    return fromTransactions;
  }

  const points: DateParts[] = [];
  for (const { metadata } of results) {
    if (metadata.tahun === null || metadata.bulan === null) {
      continue;
    }
    const normalizedMonth = normalizedText(metadata.bulan);
    MONTH_NAMES.forEach((name, index) => {
      if (normalizedMonth.includes(normalizedText(name))) {
        points.push({ year: metadata.tahun!, month: index + 1, day: 1 });
      }
    });
  }
  return points;
}

function getPeriod(points: readonly DateParts[], fallback: BkuMetadata): string {
  if (points.length === 0) {
    return [fallback.bulan, fallback.tahun].filter(Boolean).join(" ");
  }

  const sorted = [...points].sort(
    (left, right) =>
      left.year - right.year ||
      left.month - right.month ||
      left.day - right.day,
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstMonth = MONTH_NAMES[first.month - 1];
  const lastMonth = MONTH_NAMES[last.month - 1];

  if (first.year === last.year && first.month === last.month) {
    return `${firstMonth} ${first.year}`;
  }
  if (first.year === last.year) {
    return `${firstMonth} – ${lastMonth} ${first.year}`;
  }
  return `${firstMonth} ${first.year} – ${lastMonth} ${last.year}`;
}

export function mergeBkuParseResults(
  results: readonly BkuParseResult[],
): BkuBatchSummary {
  if (results.length === 0) {
    throw new Error("Setidaknya satu hasil BKU diperlukan.");
  }

  const activeResults = results.filter((result) => result.transactions.length > 0);
  const sourceResults = activeResults.length > 0 ? activeResults : results;
  const zeroExpenseFileCount = results.length - activeResults.length;
  const transactions = uniqueAcrossFiles(sourceResults);
  const firstMetadataValue = <K extends keyof BkuMetadata>(
    key: K,
  ): BkuMetadata[K] => {
    for (const result of sourceResults) {
      const value = result.metadata[key];
      if (value !== null) {
        return value;
      }
    }
    return null as BkuMetadata[K];
  };
  const baseMetadata: BkuMetadata = {
    bulan: firstMetadataValue("bulan"),
    tahun: firstMetadataValue("tahun"),
    npsn: firstMetadataValue("npsn"),
    nama_sekolah: firstMetadataValue("nama_sekolah"),
    kecamatan: firstMetadataValue("kecamatan"),
    kabupaten: firstMetadataValue("kabupaten"),
    provinsi: firstMetadataValue("provinsi"),
    saldo_awal: firstMetadataValue("saldo_awal"),
    total_penerimaan: firstMetadataValue("total_penerimaan"),
    total_pengeluaran: firstMetadataValue("total_pengeluaran"),
    saldo_akhir: firstMetadataValue("saldo_akhir"),
  };
  const points = datePoints(transactions, sourceResults);
  const period = getPeriod(points, baseMetadata);
  const sortedPoints = [...points].sort(
    (left, right) =>
      left.year - right.year ||
      left.month - right.month ||
      left.day - right.day,
  );
  const firstPoint = sortedPoints[0];
  const lastPoint = sortedPoints[sortedPoints.length - 1];
  const bulan =
    firstPoint && lastPoint
      ? firstPoint.year === lastPoint.year &&
        firstPoint.month === lastPoint.month
        ? MONTH_NAMES[firstPoint.month - 1]
        : `${MONTH_NAMES[firstPoint.month - 1]} – ${MONTH_NAMES[lastPoint.month - 1]}`
      : baseMetadata.bulan;
  const tahun =
    firstPoint && lastPoint && firstPoint.year === lastPoint.year
      ? lastPoint.year
      : baseMetadata.tahun;
  const totalPengeluaran =
    transactions.length > 0
      ? Math.round(
          transactions.reduce(
            (total, transaction) => total + transaction.pengeluaran,
            0,
          ) * 100,
        ) / 100
      : results.every((result) => result.transactions.length === 0)
        ? 0
        : baseMetadata.total_pengeluaran;
  const uniqueAuditResults = new Map<string, BkuAudit>();
  let conflictingDuplicateAudit = false;
  for (const result of sourceResults) {
    const audit = result.metadata.audit;
    if (!audit) {
      continue;
    }
    const signature = result.transactions
      .map(transactionKey)
      .sort()
      .join("|");
    const existing = uniqueAuditResults.get(signature);
    if (existing && existing.expectedPengeluaran !== audit.expectedPengeluaran) {
      conflictingDuplicateAudit = true;
    } else {
      uniqueAuditResults.set(signature, audit);
    }
  }
  const audits = [...uniqueAuditResults.values()];
  const expectedComplete =
    !conflictingDuplicateAudit &&
    sourceResults.every((result) => result.metadata.audit != null) &&
    audits.every((audit) => audit.expectedPengeluaran !== null);
  const expectedPengeluaran = expectedComplete
    ? audits.reduce(
        (total, audit) => total + (audit.expectedPengeluaran ?? 0),
        0,
      )
    : null;
  const balanceMismatchCount = audits.reduce(
    (total, audit) => total + audit.balanceMismatchCount,
    0,
  );
  const difference =
    expectedPengeluaran === null || totalPengeluaran === null
      ? null
      : Math.round(Math.abs(expectedPengeluaran - totalPengeluaran) * 100) / 100;
  const audit: BkuAudit = {
    expectedPengeluaran,
    detectedPengeluaran: totalPengeluaran ?? 0,
    difference,
    balanceMismatchCount,
    verified:
      expectedPengeluaran !== null &&
      difference === 0 &&
      balanceMismatchCount === 0,
  };

  return {
    metadata: {
      ...baseMetadata,
      bulan,
      tahun,
      total_pengeluaran: totalPengeluaran,
      audit,
    },
    period,
    transactions,
    zeroExpenseFileCount,
  };
}
