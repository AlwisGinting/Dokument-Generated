import type {
  BkuCategory,
  BkuTransaction,
  UnclassifiedBkuTransaction,
  VendorCategory,
} from "@/lib/types/lpj";

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const endsWithAccountCode = (code: string, suffix: string): boolean =>
  code.replace(/\s/g, "").endsWith(suffix);

function hasKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) =>
    new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(
      text,
    ),
  );
}

function hasEducatorName(text: string, names: readonly string[]): boolean {
  return names.some((name) => {
    const normalizedName = normalize(name);
    return normalizedName.length > 0 && text.includes(normalizedName);
  });
}

export function classifyTransaction(
  transaction: UnclassifiedBkuTransaction,
  educatorNames: readonly string[] = [],
): BkuTransaction {
  const description = normalize(transaction.uraian);
  const accountCode = transaction.kode_rekening;
  const roundedNominal = Number.isInteger(transaction.pengeluaran);
  let kategori: BkuCategory;
  let sub_kategori_toko: VendorCategory | null = null;

  const honorCode = endsWithAccountCode(accountCode, ".0013");
  const honorKeyword = hasKeyword(description, [
    "honor",
    "gaji",
    "insentif",
    "transport guru",
    "transport pendidik",
  ]);
  const titledEducator =
    /\b(?:bapak|pak|ibu|bu)\s+[a-z]+(?:\s+[a-z]+){0,2}\b/.test(description);
  const educatorNameWithRoundPayment =
    roundedNominal &&
    (hasEducatorName(description, educatorNames) || titledEducator);

  if (honorCode || honorKeyword || educatorNameWithRoundPayment) {
    kategori = "HONOR_GURU";
  } else if (
    endsWithAccountCode(accountCode, ".0061") ||
    endsWithAccountCode(accountCode, ".0063") ||
    hasKeyword(description, ["listrik", "internet", "wifi", "pdam", "air", "pulsa"])
  ) {
    kategori = "UTILITAS";
  } else {
    kategori = "BELANJA_BARANG";

    if (
      endsWithAccountCode(accountCode, ".0037") ||
      hasKeyword(description, [
        "paracetamol",
        "parasetamol",
        "minyak kayu putih",
        "sabun",
        "hand sanitizer",
      ])
    ) {
      sub_kategori_toko = "OBAT";
    } else if (
      endsWithAccountCode(accountCode, ".0052") ||
      endsWithAccountCode(accountCode, ".0012") ||
      hasKeyword(description, ["nasi", "bubur", "snack", "makan", "minum"])
    ) {
      sub_kategori_toko = "KONSUMSI";
    } else if (hasKeyword(description, ["spanduk", "brosur", "formulir", "cetak", "jilid"])) {
      sub_kategori_toko = "CETAK";
    } else {
      sub_kategori_toko = "ATK";
    }
  }

  return {
    ...transaction,
    kategori,
    sub_kategori_toko,
  };
}

export function classifyTransactions(
  transactions: readonly UnclassifiedBkuTransaction[],
  educatorNames: readonly string[] = [],
): BkuTransaction[] {
  return transactions.map((transaction) =>
    classifyTransaction(transaction, educatorNames),
  );
}
