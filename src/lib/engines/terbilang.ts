const SMALL_NUMBERS = [
  "nol",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function wordsBelowThousand(value: number): string {
  if (value < 12) {
    return SMALL_NUMBERS[value];
  }

  if (value < 20) {
    return `${SMALL_NUMBERS[value - 10]} belas`;
  }

  if (value < 100) {
    const tens = Math.floor(value / 10);
    const remainder = value % 10;
    return `${SMALL_NUMBERS[tens]} puluh${remainder ? ` ${wordsBelowThousand(remainder)}` : ""}`;
  }

  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  const hundredWord = hundreds === 1 ? "seratus" : `${SMALL_NUMBERS[hundreds]} ratus`;
  return `${hundredWord}${remainder ? ` ${wordsBelowThousand(remainder)}` : ""}`;
}

function integerToWords(value: number): string {
  if (value < 1000) {
    return wordsBelowThousand(value);
  }

  if (value < 1_000_000) {
    const thousands = Math.floor(value / 1000);
    const remainder = value % 1000;
    const thousandWord = thousands === 1 ? "seribu" : `${integerToWords(thousands)} ribu`;
    return `${thousandWord}${remainder ? ` ${integerToWords(remainder)}` : ""}`;
  }

  const scales = [
    { value: 1_000_000_000_000, name: "triliun" },
    { value: 1_000_000_000, name: "miliar" },
    { value: 1_000_000, name: "juta" },
  ];

  for (const scale of scales) {
    if (value >= scale.value) {
      const quotient = Math.floor(value / scale.value);
      const remainder = value % scale.value;
      return `${integerToWords(quotient)} ${scale.name}${remainder ? ` ${integerToWords(remainder)}` : ""}`;
    }
  }

  throw new RangeError("Nilai Rupiah berada di luar rentang yang didukung.");
}

export function terbilangRupiah(amount: number): string {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError("Nominal Rupiah harus berupa bilangan bulat yang aman.");
  }

  const sign = amount < 0 ? "minus " : "";
  const words = integerToWords(Math.abs(amount));
  return `${sign}${words} rupiah,-`;
}
