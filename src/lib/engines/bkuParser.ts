import { extractText } from "unpdf";
import { extractPdfTextViaGoogleDrive } from "@/lib/services/googleDriveService";
import * as XLSX from "xlsx";
import type {
  BkuMetadata,
  BkuParseResult,
  UnclassifiedBkuTransaction,
} from "@/lib/types/lpj";

type CellValue = unknown;
type DataRow = CellValue[];

interface ColumnMap {
  tanggal: number;
  kode_kegiatan: number;
  kode_rekening: number;
  no_bukti: number;
  uraian: number;
  penerimaan: number;
  pengeluaran: number;
  saldo: number;
}

const EMPTY_METADATA: BkuMetadata = {
  bulan: null,
  tahun: null,
  npsn: null,
  nama_sekolah: null,
  kecamatan: null,
  kabupaten: null,
  provinsi: null,
  saldo_awal: null,
  total_penerimaan: null,
  total_pengeluaran: null,
  saldo_akhir: null,
};

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

function cellText(value: CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseMoney(value: CellValue): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = cellText(value);
  if (!raw) {
    return 0;
  }

  const negative = /^\s*\(.*\)\s*$/.test(raw);
  let numeric = raw.replace(/[^\d,.-]/g, "");
  if (numeric.includes(",") && numeric.includes(".")) {
    numeric = numeric.replace(/\./g, "").replace(",", ".");
  } else if (numeric.includes(",")) {
    const decimalDigits = numeric.split(",").at(-1)?.length ?? 0;
    numeric =
      decimalDigits > 0 && decimalDigits <= 2
        ? numeric.replace(",", ".")
        : numeric.replace(/,/g, "");
  } else if (numeric.includes(".")) {
    const decimalDigits = numeric.split(".").at(-1)?.length ?? 0;
    if (decimalDigits === 3) {
      numeric = numeric.replace(/\./g, "");
    }
  }

  const parsed = Number(numeric);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return negative ? -Math.abs(parsed) : parsed;
}

function normalizeDate(value: CellValue): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && value > 0) {
    const parsedDate = XLSX.SSF.parse_date_code(value);
    if (parsedDate) {
      const month = String(parsedDate.m).padStart(2, "0");
      const day = String(parsedDate.d).padStart(2, "0");
      return `${parsedDate.y}-${month}-${day}`;
    }
  }

  const raw = cellText(value);
  const isoDate = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDate) {
    const [, yearText, monthText, dayText] = isoDate;
    const month = Number(monthText);
    const day = Number(dayText);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const localDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (localDate) {
    const [, dayText, monthText, yearText] = localDate;
    const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return raw;
}

function monthNameFromDate(date: string): string | undefined {
  const isoMatch = date.match(/^\d{4}-(\d{2})-\d{2}$/);
  const localMatch = date.match(/^\d{1,2}[/-](\d{1,2})[/-]\d{2,4}$/);
  const month = isoMatch
    ? Number(isoMatch[1])
    : localMatch
      ? Number(localMatch[1])
      : Number.NaN;
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? MONTH_NAMES[month - 1]
    : undefined;
}

function valueAfterLabel(lines: readonly string[], label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}\\s*[:=\\-]?\\s*(.*)$`, "i");
  for (const line of lines) {
    const match = line.match(pattern);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

function metadataFromRows(rows: readonly DataRow[]): BkuMetadata {
  const lines = rows
    .map((row) => row.map(cellText).filter(Boolean).join(" "))
    .filter(Boolean)
    .slice(0, 100);
  const value = (...labels: string[]): string | null => {
    for (const label of labels) {
      const found = valueAfterLabel(lines, label);
      if (found) {
        return found;
      }
    }
    return null;
  };
  const numberValue = (...labels: string[]): number | null => {
    const raw = value(...labels);
    if (!raw) {
      return null;
    }
    const parsed = parseMoney(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const monthValue = value("bulan", "periode");
  const yearValue = value("tahun anggaran", "tahun");
  const yearMatch = yearValue?.match(/\b(?:19|20)\d{2}\b/);
  const npsnValue = value("npsn")?.match(/\d{5,10}/)?.[0] ?? null;

  return {
    bulan: monthValue?.split(/\s{2,}|tahun/i)[0]?.trim() || null,
    tahun: yearMatch ? Number(yearMatch[0]) : null,
    npsn: npsnValue,
    nama_sekolah: value("nama sekolah", "nama satuan pendidikan"),
    kecamatan: value("kecamatan"),
    kabupaten: value("kabupaten", "kota"),
    provinsi: value("provinsi"),
    saldo_awal: numberValue("saldo awal"),
    total_penerimaan: numberValue("total penerimaan", "jumlah penerimaan"),
    total_pengeluaran: numberValue("total pengeluaran", "jumlah pengeluaran"),
    saldo_akhir: numberValue("saldo akhir"),
  };
}

function columnMap(header: readonly CellValue[]): ColumnMap {
  const headers = header.map((cell) => normalize(cellText(cell)).replace(/\s/g, ""));
  const find = (aliases: readonly string[]): number =>
    headers.findIndex((headerText) =>
      aliases.some((alias) => headerText.includes(alias.replace(/\s/g, ""))),
    );

  return {
    tanggal: find(["tanggal"]),
    kode_kegiatan: find(["kode kegiatan", "kegiatan"]),
    kode_rekening: find(["kode rekening", "rekening"]),
    no_bukti: find(["no bukti", "nomor bukti", "no. bukti"]),
    uraian: find(["uraian", "keterangan", "keperluan"]),
    penerimaan: find(["penerimaan", "kredit"]),
    pengeluaran: find(["pengeluaran", "debit", "belanja"]),
    saldo: find(["saldo"]),
  };
}

function findHeaderRow(rows: readonly DataRow[]): { index: number; columns: ColumnMap } | null {
  for (let index = 0; index < Math.min(rows.length, 150); index += 1) {
    const current = rows[index] ?? [];
    const next = rows[index + 1] ?? [];
    const combined = current.map((cell, cellIndex) =>
      [cellText(cell), cellText(next[cellIndex])].filter(Boolean).join(" "),
    );
    const columns = columnMap(combined);
    if (
      columns.tanggal >= 0 &&
      columns.uraian >= 0 &&
      columns.pengeluaran >= 0
    ) {
      return { index, columns };
    }
  }
  return null;
}

function isSummaryRow(description: string, expense: number): boolean {
  const normalized = normalize(description);
  if (/^saldo awal\b/.test(normalized)) {
    return true;
  }
  if (/^jumlah(?:\s|$)/.test(normalized)) {
    return true;
  }
  if (expense === 0 && /^bunga bank\b/.test(normalized)) {
    return true;
  }
  if (expense === 0 && /^pajak bunga\b/.test(normalized)) {
    return true;
  }
  return false;
}

function transactionFromRow(
  row: DataRow,
  columns: ColumnMap,
): UnclassifiedBkuTransaction | null {
  const get = (index: number): CellValue =>
    index >= 0 && index < row.length ? row[index] : "";
  const uraian = cellText(get(columns.uraian));
  const penerimaan = parseMoney(get(columns.penerimaan));
  const pengeluaran = parseMoney(get(columns.pengeluaran));
  if (!uraian || isSummaryRow(uraian, pengeluaran) || pengeluaran <= 0) {
    return null;
  }

  const tanggal = normalizeDate(get(columns.tanggal));
  return {
    tanggal,
    bulan: monthNameFromDate(tanggal),
    kode_kegiatan: cellText(get(columns.kode_kegiatan)),
    kode_rekening: cellText(get(columns.kode_rekening)),
    no_bukti: cellText(get(columns.no_bukti)),
    uraian,
    penerimaan,
    pengeluaran,
    saldo: parseMoney(get(columns.saldo)),
  };
}

function parseTableRows(rows: readonly DataRow[]): UnclassifiedBkuTransaction[] {
  const header = findHeaderRow(rows);
  if (!header) {
    return [];
  }

  const transactions: UnclassifiedBkuTransaction[] = [];
  for (const row of rows.slice(header.index + 1)) {
    const transaction = transactionFromRow(row, header.columns);
    if (transaction) {
      transactions.push(transaction);
    }
  }
  return transactions;
}

function parsePdfFallbackLines(lines: readonly string[]): DataRow[] {
  return lines
    .map((line) => {
      if (line.includes("\t")) {
        return line.split("\t").map((cell) => cell.trim());
      }
      return line
        .split(/\s{2,}/)
        .map((cell) => cell.trim())
        .filter(Boolean);
    })
    .filter((row) => row.length > 1);
}

const PDF_TRANSACTION_DATE =
  /^\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})(?=\s|$)/;
const PDF_MONEY_TOKEN = "(?:Rp\\.?\\s*)?\\(?-?\\d[\\d.,]*\\)?";

function isRepeatedPdfLine(line: string): boolean {
  const normalized = normalize(line);
  return (
    !normalized ||
    /\bbuku kas umum\b/.test(normalized) ||
    /^halaman\b/.test(normalized) ||
    /^1\s+2\s+3\s+4\s+5\s+6\s+7\s+8$/.test(normalized) ||
    /^(?:saldo bank|saldo tunai) bulan\b/.test(normalized) ||
    /^(?:jumlah|saldo awal|saldo akhir|menyetujui|kepala sekolah|bendahara|nip|pajak|bunga)\b/.test(
      normalized,
    ) ||
    /^(?:tanggal|kode kegiatan|kode rekening|no bukti|uraian|penerimaan|pengeluaran|saldo)\b/.test(
      normalized,
    )
  );
}

const PDF_BLOCK_FOOTER =
  /(?:\b(?:menyetujui|kepala\s+sekolah|bendahara|pajak\s+bunga|saldo\s+akhir)\b|\bnip\.?(?=\s|$)|^\s*(?:pajak|bunga|jumlah)\b)/i;
const PDF_BOOK_CLOSED = /\bpada hari ini\b/i;
const PDF_PROOF_CODE = /\b(?:BNU|BPU|BKU)[\s._/-]*[A-Z0-9]+(?:[._/-][A-Z0-9]+)*/i;
const PDF_DOTTED_CODE = /(?<![\d.])\d+(?:\.\d+){1,}\.?(?![\d.])/g;

function stripPdfBlockFooter(line: string): string {
  const footerIndex = line.search(PDF_BLOCK_FOOTER);
  return footerIndex >= 0 ? line.slice(0, footerIndex).trim() : line;
}

function containsBkuDottedCode(line: string): boolean {
  return Array.from(line.matchAll(/\b\d+(?:\.\d+){1,}\b/g), (match) => match[0])
    .some((value) => {
      if (/^5(?:\.\d+){3,}$/.test(value)) {
        return true;
      }
      const segments = value.split(".");
      const lastSegment = segments.at(-1) ?? "";
      return (
        segments.length >= 3 &&
        segments.slice(1, -1).every((segment) => segment.length <= 2) &&
        lastSegment.length <= 3
      );
    });
}

function trailingPdfAmounts(
  line: string,
): { values: [number, number, number]; start: number } | null {
  const pattern = new RegExp(
    `(?:^|\\s)(${PDF_MONEY_TOKEN})\\s+(${PDF_MONEY_TOKEN})\\s+(${PDF_MONEY_TOKEN})\\s*$`,
    "i",
  );
  const match = line.match(pattern);
  if (!match || match.index === undefined) {
    return null;
  }
  return {
    values: [
      parseMoney(match[1]),
      parseMoney(match[2]),
      parseMoney(match[3]),
    ],
    start: match.index + (/\s/.test(match[0][0]) ? 1 : 0),
  };
}

function standalonePdfMoneyValues(line: string): number[] {
  if (
    /^1\s+2\s+3\s+4\s+5\s+6\s+7\s+8$/.test(normalize(line)) ||
    PDF_TRANSACTION_DATE.test(line) ||
    containsBkuDottedCode(line) ||
    PDF_PROOF_CODE.test(line)
  ) {
    return [];
  }

  const withoutCurrency = line.replace(/Rp\.?/gi, "");
  const matches = Array.from(withoutCurrency.matchAll(/-?\d[\d.,]*/g));
  if (matches.length === 0) {
    return [];
  }
  const remaining = withoutCurrency
    .replace(/-?\d[\d.,]*/g, "")
    .replace(/\b(?:penerimaan|pengeluaran|saldo)\b/gi, "")
    .replace(/[\s:|;()[\]-]/g, "");
  return remaining.length === 0
    ? matches.map((match) => parseMoney(match[0]))
    : [];
}

function amountsFromPdfBlock(
  lines: readonly string[],
): [number, number, number] | null {
  let pendingValues: number[] = [];
  const proofIndex = lines.findIndex((line) => PDF_PROOF_CODE.test(line));

  for (const [index, line] of lines.entries()) {
    if (
      (proofIndex >= 0 && index < proofIndex) ||
      (proofIndex < 0 &&
        (PDF_TRANSACTION_DATE.test(line) || containsBkuDottedCode(line)))
    ) {
      continue;
    }

    const trailingAmounts = trailingPdfAmounts(line);
    if (trailingAmounts && trailingAmounts.values[1] > 0) {
      return trailingAmounts.values;
    }

    const values = standalonePdfMoneyValues(line);
    if (values.length === 0) {
      pendingValues = [];
      continue;
    }
    pendingValues.push(...values);
    if (pendingValues.length >= 3) {
      const candidate = pendingValues.slice(-3) as [number, number, number];
      if (candidate[1] > 0) {
        return candidate;
      }
      pendingValues = pendingValues.slice(-2);
    }
  }
  return null;
}

function parsePdfTransactionBlock(
  dateText: string,
  lines: readonly string[],
): UnclassifiedBkuTransaction | null {
  const amounts = amountsFromPdfBlock(lines);
  if (!amounts || amounts[1] <= 0) {
    return null;
  }

  const blockText = lines.join(" ");
  const proofIndex = lines.findIndex((line) => PDF_PROOF_CODE.test(line));
  const codeSource = lines
    .map((line) => {
      const trailingAmounts = trailingPdfAmounts(line);
      return trailingAmounts ? line.slice(0, trailingAmounts.start) : line;
    })
    .filter(
      (line) =>
        !isRepeatedPdfLine(line) && standalonePdfMoneyValues(line).length === 0,
    )
    .join(" ");
  const accountCodes = Array.from(
    codeSource.matchAll(/(?<![\d.])\d+(?:\.\d+){1,}\.?(?![\d.])/g),
    (match) => match[0],
  );
  const accountCode =
    accountCodes.find((code) => /^5(?:\.\d+)+$/.test(code)) ??
    accountCodes.at(-1) ??
    "";
  const activityCode = accountCodes.find((code) => code !== accountCode) ?? "";
  const firstLineRemainder = lines[0]?.replace(PDF_TRANSACTION_DATE, "").trim() ?? "";
  const shortActivityCode =
    accountCode && !activityCode
      ? firstLineRemainder.match(/^(\d{1,3})(?=\s|$)/)?.[1] ?? ""
      : "";
  const kodeKegiatan = activityCode || shortActivityCode;
  const proofCode =
    blockText.match(PDF_PROOF_CODE)?.[0] ??
    blockText.match(/\b[A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+)+\b/i)?.[0] ??
    "";

  const description = lines
    .map((rawLine, index) => {
      if (PDF_BOOK_CLOSED.test(rawLine)) {
        return "";
      }
      let line = stripPdfBlockFooter(rawLine);
      if (index === 0) {
        line = line.replace(PDF_TRANSACTION_DATE, " ");
      }
      if (index < proofIndex && /^\s*\d{1,3}\s*$/.test(line)) {
        return "";
      }
      if (isRepeatedPdfLine(line)) {
        return "";
      }

      const trailingAmounts = trailingPdfAmounts(line);
      if (trailingAmounts) {
        line = line.slice(0, trailingAmounts.start);
      } else if (standalonePdfMoneyValues(line).length > 0) {
        return "";
      }

      line = line
        .replace(/\bBuku Kas Umum\b/gi, " ")
        .replace(/\bHalaman\s+\d+(?:\s+dari\s+\d+)?\b/gi, " ")
        .replace(PDF_DOTTED_CODE, " ")
        .replace(/\b(?:BNU|BPU|BKU)[\s._/-]*[A-Z0-9]+(?:[._/-][A-Z0-9]+)*/gi, " ")
        .replace(/\b[A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+)+\b/gi, " ");
      if (index <= proofIndex) {
        line = line.replace(/^\s*\d{1,3}\s+/, " ");
      }
      if (kodeKegiatan && /^\d{1,3}$/.test(kodeKegiatan)) {
        line = line.replace(new RegExp(`^\\s*${kodeKegiatan}\\b`), " ");
      }
      return line
        .replace(/^\s*(?:(?:pembelian\s+barang|pembelian|pengadaan|belanja)\b[\s:,-]*)+/i, "")
        .replace(/^\s*(?:uraian|keterangan|nama barang)\s*[:=-]\s*/i, "")
        .replace(/[\s,;:|/-]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/(^|[\s/-])([\p{L}\d])/gu, (_match, separator: string, initial: string) =>
      `${separator}${initial.toLocaleUpperCase("id-ID")}`,
    );

  if (!description || isSummaryRow(description, amounts[1])) {
    return null;
  }

  const tanggal = normalizeDate(dateText);
  return {
    tanggal,
    bulan: monthNameFromDate(tanggal),
    kode_kegiatan: kodeKegiatan,
    kode_rekening: accountCode,
    no_bukti: proofCode,
    uraian: description,
    penerimaan: amounts[0],
    pengeluaran: amounts[1],
    saldo: amounts[2],
  };
}

function parseMultilinePdfTransactions(
  lines: readonly string[],
): UnclassifiedBkuTransaction[] {
  const transactions: UnclassifiedBkuTransaction[] = [];
  let dateText: string | null = null;
  let blockLines: string[] = [];

  const finishBlock = () => {
    if (!dateText) {
      return;
    }
    const transaction = parsePdfTransactionBlock(dateText, blockLines);
    if (transaction) {
      transactions.push(transaction);
    }
  };

  for (const line of lines) {
    if (PDF_BOOK_CLOSED.test(line)) {
      finishBlock();
      dateText = null;
      blockLines = [];
      break;
    }
    const dateMatch = line.match(PDF_TRANSACTION_DATE);
    if (dateMatch) {
      finishBlock();
      dateText = dateMatch[1];
      blockLines = [line];
    } else if (dateText) {
      if (PDF_BLOCK_FOOTER.test(line)) {
        const footerText = stripPdfBlockFooter(line);
        if (footerText) {
          blockLines.push(footerText);
        }
        finishBlock();
        dateText = null;
        blockLines = [];
        continue;
      }
      blockLines.push(line);
    }
  }
  finishBlock();
  return transactions;
}

function parsePlainPdfLines(lines: readonly string[]): UnclassifiedBkuTransaction[] {
  const headerIndex = lines.findIndex((line) => {
    const header = normalize(line);
    return (
      header.includes("tanggal") &&
      header.includes("uraian") &&
      (header.includes("pengeluaran") || header.includes("debit"))
    );
  });
  if (headerIndex < 0) {
    return [];
  }

  const money = "(?:Rp\\.?\\s*)?\\(?-?\\d[\\d.,]*\\)?";
  const trailingAmounts = new RegExp(
    `^(.*?)\\s+(${money})\\s+(${money})\\s+(${money})\\s*$`,
    "i",
  );
  const transactions: UnclassifiedBkuTransaction[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    const dateMatch = line.match(/^\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(.+)$/);
    if (!dateMatch) {
      continue;
    }
    const amountsMatch = dateMatch[2].match(trailingAmounts);
    if (!amountsMatch) {
      continue;
    }

    const [, prefix, receiptText, expenseText, balanceText] = amountsMatch;
    const prefixFields = prefix.trim().split(/\s+/);
    if (prefixFields.length < 4) {
      continue;
    }
    const [kode_kegiatan, kode_rekening, no_bukti, ...descriptionWords] = prefixFields;
    const uraian = descriptionWords.join(" ").trim();
    const penerimaan = parseMoney(receiptText);
    const pengeluaran = parseMoney(expenseText);
    if (!uraian || isSummaryRow(uraian, pengeluaran) || pengeluaran <= 0) {
      continue;
    }

    const tanggal = normalizeDate(dateMatch[1]);
    transactions.push({
      tanggal,
      bulan: monthNameFromDate(tanggal),
      kode_kegiatan,
      kode_rekening,
      no_bukti,
      uraian,
      penerimaan,
      pengeluaran,
      saldo: parseMoney(balanceText),
    });
  }
  return transactions;
}

function parsePdfLines(lines: readonly string[]): {
  metadata: BkuMetadata;
  transactions: UnclassifiedBkuTransaction[];
} {
  const rows = lines.map((line) =>
    line.includes("\t") ? line.split("\t") : [line],
  );
  const metadata = { ...EMPTY_METADATA, ...metadataFromRows(rows) };
  const hasTabularText = lines.some((line) => line.includes("\t"));
  const multilineTransactions = parseMultilinePdfTransactions(lines);
  const transactions =
    multilineTransactions.length > 0
      ? multilineTransactions
      : hasTabularText
        ? parseTableRows(rows)
        : parsePlainPdfLines(lines);
  const fallbackRows =
    transactions.length === 0 && hasTabularText
      ? parsePdfFallbackLines(lines)
      : [];
  const fallbackTransactions =
    fallbackRows.length > 0 ? parseTableRows(fallbackRows) : [];
  const parsedTransactions =
    transactions.length > 0 ? transactions : fallbackTransactions;

  return {
    metadata: {
      ...metadata,
      total_pengeluaran:
        metadata.total_pengeluaran ??
        (parsedTransactions.length > 0
          ? parsedTransactions.reduce(
              (total, transaction) => total + transaction.pengeluaran,
              0,
            )
          : null),
    },
    transactions: parsedTransactions,
  };
}

function parsedMetadataCount(metadata: BkuMetadata): number {
  return Object.values(metadata).filter((value) => value !== null).length;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function parsePdfWithFallback(
  fileBuffer: Buffer,
  fileName: string,
): Promise<{
  metadata: BkuMetadata;
  transactions: UnclassifiedBkuTransaction[];
}> {
  let unpdfResult: ReturnType<typeof parsePdfLines> | null = null;
  let unpdfError: unknown;

  try {
    const result = await extractText(Uint8Array.from(fileBuffer), {
      mergePages: false,
    });
    const pages = Array.isArray(result.text) ? result.text : [result.text];
    unpdfResult = parsePdfLines(pages.join("\n").split(/\r?\n/));
    if (unpdfResult.transactions.length > 0) {
      return unpdfResult;
    }
  } catch (error) {
    unpdfError = error;
  }

  let driveResult: ReturnType<typeof parsePdfLines> | null = null;
  let driveError: unknown;
  try {
    const text = await extractPdfTextViaGoogleDrive(fileBuffer, fileName);
    driveResult = parsePdfLines(text.split(/\r?\n/));
    if (driveResult.transactions.length > 0) {
      return driveResult;
    }
  } catch (error) {
    driveError = error;
  }

  if (unpdfResult && driveResult) {
    return parsedMetadataCount(unpdfResult.metadata) >=
      parsedMetadataCount(driveResult.metadata)
      ? unpdfResult
      : driveResult;
  }
  if (driveResult) {
    return driveResult;
  }

  throw new Error(
    [
      "Ekstraksi teks PDF gagal.",
      `unpdf: ${unpdfError ? errorMessage(unpdfError) : "tidak menemukan baris transaksi."}`,
      `Google Drive: ${driveError ? errorMessage(driveError) : "tidak menemukan baris transaksi."}`,
    ].join(" "),
    { cause: driveError ?? unpdfError },
  );
}

export async function parseBkuFile(
  fileBuffer: Buffer,
  fileName: string,
): Promise<BkuParseResult> {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "xlsx") {
    const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("File XLSX tidak memiliki lembar kerja.");
    }
    const firstSheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<DataRow>(firstSheet, {
      header: 1,
      raw: true,
      defval: "",
    });
    return {
      metadata: { ...EMPTY_METADATA, ...metadataFromRows(rows) },
      transactions: parseTableRows(rows),
    };
  }

  if (extension === "pdf") {
    return parsePdfWithFallback(fileBuffer, fileName);
  }

  throw new Error("Format BKU tidak didukung. Unggah file PDF atau XLSX.");
}
