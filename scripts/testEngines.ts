import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";
import * as XLSX from "xlsx";
import { parseBkuFile } from "@/lib/engines/bkuParser";
import { mergeBkuParseResults } from "@/lib/engines/bkuBatch";
import { classifyTransaction } from "@/lib/engines/classifierEngine";
import { splitTransactionsIntoSpjParts, MAX_BARANG_PART_CENTS } from "@/lib/engines/splitterEngine";
import { terbilangRupiah } from "@/lib/engines/terbilang";
import { validateSpjParts } from "@/lib/engines/spjValidation";
import { buildLpjDocuments } from "@/lib/services/docxBuilder";
import { prepareExcelForPdf } from "@/lib/services/precisionConverter";
import { extractGoogleDriveFolderId } from "@/lib/utils/googleDriveFolderId";
import type {
  BkuMetadata,
  SchoolProfile,
  SpjPart,
  UnclassifiedBkuTransaction,
} from "@/lib/types/lpj";

function transaction(
  overrides: Partial<UnclassifiedBkuTransaction> = {},
): UnclassifiedBkuTransaction {
  return {
    tanggal: "2026-01-15",
    kode_kegiatan: "01",
    kode_rekening: "5.1.02.02.0024",
    no_bukti: "BKU-001",
    uraian: "Pembelian alat tulis",
    penerimaan: 0,
    pengeluaran: 25_000,
    saldo: 0,
    ...overrides,
  };
}

function classified(
  overrides: Partial<UnclassifiedBkuTransaction> = {},
) {
  return classifyTransaction(transaction(overrides));
}

async function testBkuXlsxParsing(): Promise<void> {
  const rows = [
    ["Bulan", "Januari"],
    ["Tahun Anggaran", 2026],
    ["NPSN", "12345678"],
    ["Nama Sekolah", "PAUD Melati"],
    ["Kecamatan", "Sukamaju"],
    ["Kabupaten", "Contoh"],
    ["Provinsi", "Jawa Barat"],
    ["Saldo Awal", 1_000_000],
    ["Total Penerimaan", 500_000],
    ["Total Pengeluaran", 25_000],
    ["Saldo Akhir", 1_475_000],
    [],
    [
      "Tanggal",
      "Kode Kegiatan",
      "Kode Rekening",
      "No Bukti",
      "Uraian",
      "Penerimaan",
      "Pengeluaran",
      "Saldo",
    ],
    ["15/01/2026", "01", "5.1.02.02.0024", "BKU-001", "Pembelian pensil", 0, 25_000, 1_475_000],
    ["", "", "", "", "Bunga Bank", 10, 0, 1_475_010],
    ["", "", "", "", "Pajak Bunga", 0, 0, 1_475_010],
    ["", "", "", "", "Jumlah", 10, 25_000, 1_475_010],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "BKU");
  const file = Buffer.from(XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
  const parsed = await parseBkuFile(file, "bku.xlsx");

  assert.equal(parsed.metadata.bulan, "Januari");
  assert.equal(parsed.metadata.tahun, 2026);
  assert.equal(parsed.metadata.npsn, "12345678");
  assert.equal(parsed.metadata.saldo_awal, 1_000_000);
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].bulan, "Januari");
  assert.equal(parsed.transactions[0].uraian, "Pembelian pensil");
  assert.equal(parsed.transactions[0].pengeluaran, 25_000);

  const adjusted = prepareExcelForPdf(file);
  const adjustedZip = new PizZip(adjusted);
  const worksheetXml = adjustedZip.file("xl/worksheets/sheet1.xml")?.asText();
  assert.ok(worksheetXml?.includes('fitToWidth="1"'));
  assert.ok(worksheetXml?.includes('fitToHeight="0"'));
  assert.ok(worksheetXml?.includes('fitToPage="1"'));
}

async function testAnnualAndMonthlyBkuBatch(): Promise<void> {
  const headers = [
    "Tanggal",
    "Kode Kegiatan",
    "Kode Rekening",
    "No Bukti",
    "Uraian",
    "Penerimaan",
    "Pengeluaran",
    "Saldo",
  ];
  const annualWorkbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    annualWorkbook,
    XLSX.utils.aoa_to_sheet([
      ["Tahun Anggaran", 2026],
      headers,
      ["15/01/2026", "01", "5.1.02.02.0024", "ATK-001", "Pembelian pensil", 0, 25_000, 975_000],
      ["10/05/2026", "01", "5.1.02.02.0024", "ATK-005", "Pembelian buku", 0, 50_000, 925_000],
      ["11/05/2026", "01", "5.1.02.02.0024", "ATK-006", "Pembelian map", 0, 30_000, 895_000],
      ["11/05/2026", "01", "5.1.02.02.0024", "ATK-006", "Pembelian map", 0, 30_000, 865_000],
    ]),
    "BKU Tahunan",
  );
  const annualFile = Buffer.from(
    XLSX.write(annualWorkbook, { bookType: "xlsx", type: "buffer" }),
  );
  const annual = await parseBkuFile(annualFile, "BKU_Tahunan.xlsx");
  assert.deepEqual(
    annual.transactions.map((transaction) => transaction.bulan),
    ["Januari", "Mei", "Mei", "Mei"],
  );

  const duplicatedAnnualBatch = mergeBkuParseResults([annual, annual]);
  assert.equal(duplicatedAnnualBatch.transactions.length, 4);
  assert.equal(duplicatedAnnualBatch.metadata.total_pengeluaran, 135_000);
  assert.equal(duplicatedAnnualBatch.metadata.bulan, "Januari – Mei");
  assert.equal(duplicatedAnnualBatch.metadata.tahun, 2026);
  assert.equal(duplicatedAnnualBatch.period, "Januari – Mei 2026");

  const januaryOnly = {
    metadata: annual.metadata,
    transactions: [annual.transactions[0]],
  };
  const mayOnly = {
    metadata: annual.metadata,
    transactions: annual.transactions.slice(1),
  };
  const monthlyBatch = mergeBkuParseResults([mayOnly, januaryOnly]);
  assert.deepEqual(
    monthlyBatch.transactions.map((transaction) => transaction.tanggal),
    [
      "2026-01-15",
      "2026-05-10",
      "2026-05-11",
      "2026-05-11",
    ],
  );
  assert.equal(monthlyBatch.period, "Januari – Mei 2026");
  assert.equal(monthlyBatch.metadata.total_pengeluaran, 135_000);
}

async function testBkuPdfParsing(): Promise<void> {
  const document = await PDFDocument.create();
  const page = document.addPage([792, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Bulan Januari", { x: 48, y: 744, size: 12, font });
  page.drawText("Tahun Anggaran 2026", { x: 48, y: 724, size: 12, font });
  page.drawText("NPSN 12345678", { x: 48, y: 704, size: 12, font });
  const headers: Array<[string, number]> = [
    ["Tanggal", 40],
    ["Kode Kegiatan", 110],
    ["Kode Rekening", 210],
    ["No Bukti", 330],
    ["Uraian", 410],
    ["Penerimaan", 535],
    ["Pengeluaran", 630],
    ["Saldo", 710],
  ];
  const values: Array<[string, number]> = [
    ["15/01/2026", 40],
    ["01", 110],
    ["5.1.02.02.0024", 210],
    ["BKU-001", 330],
    ["Pembelian pensil", 410],
    ["0", 535],
    ["25.000", 630],
    ["975.000", 710],
  ];
  for (const [text, x] of headers) {
    page.drawText(text, { x, y: 600, size: 8, font });
  }
  for (const [text, x] of values) {
    page.drawText(text, { x, y: 580, size: 8, font });
  }
  const buffer = Buffer.from(await document.save());
  const parsed = await parseBkuFile(buffer, "bku.pdf");
  assert.equal(parsed.metadata.bulan, "Januari");
  assert.equal(parsed.metadata.tahun, 2026);
  assert.equal(parsed.metadata.npsn, "12345678");
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].bulan, "Januari");
  assert.equal(parsed.transactions[0].uraian, "Pembelian pensil");
  assert.equal(parsed.transactions[0].pengeluaran, 25_000);
}

async function testArkasMultilinePdfParsing(): Promise<void> {
  const document = await PDFDocument.create();
  const page = document.addPage([792, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = [
    "Periode: Mei 2026",
    "Buku Kas Umum",
    "Tanggal Kode Kegiatan Kode Rekening No Bukti Uraian Penerimaan Pengeluaran Saldo",
    "13-05-2026 01.03.02 5.1.02.02.0024",
    "BPU-2026-001 Pembelian alat tulis kantor",
    "Penerimaan: 0",
    "Pengeluaran: 1.250.000,00",
    "Saldo: 5.000.000,00",
    "Halaman 1",
    "2026-05-14 01.03.02 5.1.02.02.0024",
    "BPU/2026/002 Pembelian kertas dan tinta",
    "0 250.000,00 4.750.000,00",
    "15/05/2026 01.03.02 5.1.02.02.0024",
    "BPU-2026-003 Pembelian buku gambar",
    "Penerimaan 0 Pengeluaran 500.000 Saldo 4.250.000",
    "Jumlah: 0 2.000.000 4.250.000",
    "Saldo Akhir: 4.250.000",
  ];
  lines.forEach((text, index) => {
    page.drawText(text, {
      x: 48,
      y: 748 - index * 18,
      size: 9,
      font,
    });
  });

  const parsed = await parseBkuFile(
    Buffer.from(await document.save()),
    "bku-arkas-multiline.pdf",
  );
  assert.equal(parsed.transactions.length, 3);
  assert.deepEqual(
    parsed.transactions.map(({ tanggal }) => tanggal),
    ["2026-05-13", "2026-05-14", "2026-05-15"],
  );
  assert.deepEqual(
    parsed.transactions.map(({ no_bukti }) => no_bukti),
    ["BPU-2026-001", "BPU/2026/002", "BPU-2026-003"],
  );
  assert.deepEqual(
    parsed.transactions.map(({ uraian }) => uraian),
    [
      "Pembelian alat tulis kantor",
      "Pembelian kertas dan tinta",
      "Pembelian buku gambar",
    ],
  );
  assert.deepEqual(
    parsed.transactions.map(({ pengeluaran }) => pengeluaran),
    [1_250_000, 250_000, 500_000],
  );
  assert.deepEqual(
    parsed.transactions.map(({ saldo }) => saldo),
    [5_000_000, 4_750_000, 4_250_000],
  );
}

function testManualPartValidation(): void {
  const manualUtility: SpjPart = {
    id: "manual-utilitas",
    kode_part: "MANUAL-001",
    is_barang: false,
    kategori_toko: null,
    bulan_alokasi: "Mei",
    tanggal_transaksi: "2026-05-01",
    nama_penjual: "",
    alamat_penjual: "",
    uraian_singkat: "",
    items: [],
    total_part: 0,
  };
  assert.ok(validateSpjParts([manualUtility]).length > 0);
  assert.deepEqual(
    validateSpjParts([
      {
        ...manualUtility,
        uraian_singkat: "Tagihan listrik",
        total_part: 75_000,
      },
    ]),
    [],
  );
}

function testGoogleDriveFolderIdParsing(): void {
  const folderId = "1UNBXQj8xkc0qnnsBseX0tiiJ2S1BJsBe";
  assert.equal(
    extractGoogleDriveFolderId(
      `https://drive.google.com/drive/folders/${folderId}?usp=drive_link`,
    ),
    folderId,
  );
  assert.equal(
    extractGoogleDriveFolderId(`https://drive.google.com/open?id=${folderId}`),
    folderId,
  );
  assert.equal(extractGoogleDriveFolderId(folderId), folderId);
  assert.equal(extractGoogleDriveFolderId(""), null);
  assert.equal(extractGoogleDriveFolderId("not-a-folder-url"), null);
  assert.equal(
    extractGoogleDriveFolderId(`https://example.com/drive/folders/${folderId}`),
    null,
  );
}

async function testDocxBuilder(): Promise<void> {
  const schoolProfile: SchoolProfile = {
    id: "school-1",
    nama_sekolah: "PAUD Melati",
    npsn: "12345678",
    alamat_dusun_desa: "Desa Melati",
    alamat_jalan: "Jalan Melati",
    kecamatan: "Sukamaju",
    kabupaten: "Contoh",
    provinsi: "Jawa Barat",
    email: null,
    no_hp: null,
    nama_kepsek: "Ibu Melati",
    jabatan_kepsek: "Kepala Sekolah",
    nama_bendahara: null,
    jumlah_siswa_l: 9,
    jumlah_siswa_p: 11,
    lama_berdiri: 5,
    gdrive_folder_id: null,
    logo_data_url: null,
  };
  const metadata: BkuMetadata = {
    bulan: "Januari",
    tahun: 2026,
    npsn: "12345678",
    nama_sekolah: "PAUD Melati",
    kecamatan: "Sukamaju",
    kabupaten: "Contoh",
    provinsi: "Jawa Barat",
    saldo_awal: 1_000_000,
    total_penerimaan: 1_000_000,
    total_pengeluaran: 748_000,
    saldo_akhir: 252_000,
  };
  const parts: SpjPart[] = [
    {
      id: "spj-goods-1",
      kode_part: "ATK-001",
      is_barang: true,
      kategori_toko: "ATK",
      bulan_alokasi: "Januari",
      tanggal_transaksi: "2026-01-15",
      nama_penjual: "Toko Melati",
      alamat_penjual: "Jalan Melati",
      uraian_singkat: "Pembelian kertas",
      items: [
        {
          no: 1,
          nama_barang: "Kertas",
          diantar: "2026-01-15",
          banyaknya: "1",
          harga_satuan: 748_000,
          jumlah_harga: 748_000,
        },
      ],
      total_part: 748_000,
    },
    {
      id: "spj-utility-1",
      kode_part: "LISTRIK-001",
      is_barang: false,
      kategori_toko: null,
      bulan_alokasi: "Januari",
      tanggal_transaksi: "2026-01-15",
      nama_penjual: "",
      alamat_penjual: "",
      uraian_singkat: "Tagihan listrik",
      items: [],
      total_part: 25_000,
    },
  ];
  const documents = await buildLpjDocuments({
    schoolProfile,
    metadata,
    parts,
    namaBank: "Bank Contoh",
    tanggalTerima: "1 Januari 2026",
    tanggalSurat: "31 Januari 2026",
  });
  const defaultLogo = await readFile("public/assets/logo_paud.png");
  assert.equal(documents.length, 4);
  for (const document of documents) {
    const zip = new PizZip(document.buffer);
    const xml = zip.file("word/document.xml")?.asText();
    const logo = zip.file("word/media/image1.png")?.asNodeBuffer();
    assert.ok(xml, `${document.fileName} has a Word document body`);
    assert.ok(logo?.equals(defaultLogo), `${document.fileName} contains the fallback logo`);
    assert.ok(!/\{[#/^]?[a-z_]+\}/i.test(xml), `${document.fileName} has no unresolved tags`);
    if (document.template === "template_spj_part.docx") {
      assert.equal((xml.match(/w:type="page"/g) ?? []).length, 3);
      assert.equal((xml.match(/PESANAN BARANG/g) ?? []).length, 1);
      assert.equal((xml.match(/SURAT PENGANTAR BARANG/g) ?? []).length, 1);
      assert.equal((xml.match(/KWITANSI PEMBELIAN \/ PEMBAYARAN/g) ?? []).length, 2);
      assert.ok(xml.indexOf("PESANAN BARANG") < xml.indexOf("SURAT PENGANTAR BARANG"));
      assert.ok(xml.indexOf("SURAT PENGANTAR BARANG") < xml.indexOf("KWITANSI PEMBELIAN"));
    }
    if (document.template === "template_laporan_bop.docx") {
      assert.ok(xml.includes("748.000"));
    }
  }

  const customLogo = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r1sAAAAASUVORK5CYII=",
    "base64",
  );
  const customDocuments = await buildLpjDocuments({
    schoolProfile,
    metadata,
    parts,
    logoDataUrl: `data:image/png;base64,${customLogo.toString("base64")}`,
  });
  const customZip = new PizZip(customDocuments[0].buffer);
  assert.ok(
    customZip.file("word/media/image1.png")?.asNodeBuffer().equals(customLogo),
    "custom PNG logo replaces the template logo",
  );

  const utilityDocument = (await buildLpjDocuments({
    schoolProfile,
    metadata,
    parts: [parts[1]],
  })).find((document) => document.template === "template_spj_part.docx");
  assert.ok(utilityDocument);
  const utilityXml = new PizZip(utilityDocument.buffer)
    .file("word/document.xml")
    ?.asText();
  assert.ok(utilityXml);
  assert.equal((utilityXml.match(/w:type="page"/g) ?? []).length, 0);
  assert.ok(utilityXml.includes("KWITANSI PEMBELIAN / PEMBAYARAN"));
  assert.ok(!utilityXml.includes("PESANAN BARANG"));
}

async function main(): Promise<void> {
  assert.equal(
    terbilangRupiah(748_000),
    "tujuh ratus empat puluh delapan ribu rupiah,-",
  );

  const electricityTransactions = Array.from({ length: 5 }, () =>
    classified({
      kode_rekening: "5.1.02.02.0061",
      no_bukti: "LISTRIK-01",
      uraian: "Tagihan Listrik",
      pengeluaran: 25_000,
    }),
  );
  const electricityParts = splitTransactionsIntoSpjParts(electricityTransactions);
  assert.equal(electricityParts.length, 5);
  assert.ok(electricityParts.every((part) => !part.is_barang));
  assert.deepEqual(validateSpjParts(electricityParts), []);
  assert.deepEqual(
    electricityParts.map((part) => part.bulan_alokasi),
    ["Bulan 1", "Bulan 2", "Bulan 3", "Bulan 4", "Bulan 5"],
  );

  const goodsTransactions = [
    classified({ no_bukti: "ATK-1", uraian: "Kertas", pengeluaran: 600_000 }),
    classified({ no_bukti: "ATK-2", uraian: "Tinta", pengeluaran: 500_000 }),
    classified({ no_bukti: "ATK-3", uraian: "Map", pengeluaran: 400_000 }),
  ];
  const goodsParts = splitTransactionsIntoSpjParts(goodsTransactions);
  assert.equal(goodsParts.length, 2);
  assert.ok(goodsParts.every((part) => part.is_barang));
  assert.deepEqual(validateSpjParts(goodsParts), []);
  assert.ok(
    goodsParts.every((part) => part.total_part * 100 <= MAX_BARANG_PART_CENTS),
  );
  assert.equal(
    goodsParts.reduce((total, part) => total + part.total_part, 0),
    1_500_000,
  );
  const goodsAcrossMonths = splitTransactionsIntoSpjParts([
    classified({
      tanggal: "2026-01-15",
      no_bukti: "ATK-JAN",
      uraian: "Pembelian kertas",
      pengeluaran: 600_000,
    }),
    classified({
      tanggal: "2026-05-10",
      no_bukti: "ATK-MEI",
      uraian: "Pembelian buku",
      pengeluaran: 500_000,
    }),
  ]);
  assert.equal(goodsAcrossMonths.length, 2);
  assert.deepEqual(
    goodsAcrossMonths.map((part) => part.bulan_alokasi),
    ["Januari", "Mei"],
  );
  assert.ok(goodsAcrossMonths.every((part) => part.total_part <= 1_000_000));
  const overLimitPart = {
    ...goodsParts[0],
    items: [
      {
        ...goodsParts[0].items[0],
        harga_satuan: 1_000_001,
        jumlah_harga: 1_000_001,
      },
    ],
    total_part: 1_000_001,
  };
  assert.ok(
    validateSpjParts([overLimitPart]).some((issue) => issue.includes("melebihi Rp 1.000.000")),
  );

  const oversizedGoods = splitTransactionsIntoSpjParts([
    classified({ no_bukti: "ATK-4", uraian: "Mesin laminasi", pengeluaran: 1_500_000 }),
  ]);
  assert.equal(oversizedGoods.length, 2);
  assert.ok(oversizedGoods.every((part) => part.is_barang));
  assert.ok(
    oversizedGoods.every((part) => part.total_part * 100 <= MAX_BARANG_PART_CENTS),
  );

  const salaryParts = splitTransactionsIntoSpjParts([
    classified({
      kode_rekening: "5.1.02.02.0013",
      no_bukti: "HONOR-1",
      uraian: "Gaji Guru",
      pengeluaran: 1_500_000,
    }),
  ]);
  assert.equal(salaryParts.length, 1);
  assert.equal(salaryParts[0].is_barang, false);
  assert.equal(salaryParts[0].total_part, 1_500_000);
  assert.deepEqual(validateSpjParts(salaryParts), []);
  const salariesAcrossMonths = splitTransactionsIntoSpjParts([
    classified({
      tanggal: "2026-01-15",
      kode_rekening: "5.1.02.02.0013",
      no_bukti: "HONOR-JAN",
      uraian: "Gaji Guru",
      pengeluaran: 1_500_000,
    }),
    classified({
      tanggal: "2026-05-10",
      kode_rekening: "5.1.02.02.0013",
      no_bukti: "HONOR-MEI",
      uraian: "Gaji Guru",
      pengeluaran: 1_500_000,
    }),
  ]);
  assert.equal(salariesAcrossMonths.length, 2);
  assert.deepEqual(
    salariesAcrossMonths.map((part) => part.bulan_alokasi),
    ["Januari", "Mei"],
  );
  assert.ok(salariesAcrossMonths.every((part) => part.total_part === 1_500_000));

  const namedEducator = classifyTransaction(
    transaction({ uraian: "Transfer Ibu Siti Rahayu", pengeluaran: 1_500_000 }),
  );
  assert.equal(namedEducator.kategori, "HONOR_GURU");

  const duplicateOversizedGoods = splitTransactionsIntoSpjParts(
    Array.from({ length: 2 }, () =>
      classified({
        kode_rekening: "5.1.02.02.0024",
        no_bukti: "MESIN-1",
        uraian: "Pembelian mesin",
        pengeluaran: 1_500_000,
      }),
    ),
  );
  assert.ok(
    duplicateOversizedGoods.every(
      (part) => part.is_barang && part.total_part * 100 <= MAX_BARANG_PART_CENTS,
    ),
  );
  assert.equal(duplicateOversizedGoods.length, 4);

  await testBkuXlsxParsing();
  await testAnnualAndMonthlyBkuBatch();
  await testBkuPdfParsing();
  await testArkasMultilinePdfParsing();
  testManualPartValidation();
  testGoogleDriveFolderIdParsing();
  await testDocxBuilder();
  console.log("Engine tests passed: parsing, classification, splitting, Rupiah wording, DOCX generation, and Excel fit-to-page.");
}

main().catch((error: unknown) => {
  console.error("Engine tests failed:", error);
  process.exitCode = 1;
});
