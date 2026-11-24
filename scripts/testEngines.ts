import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import PizZip from "pizzip";
import * as XLSX from "xlsx";
import { parseBkuFile } from "@/lib/engines/bkuParser";
import { classifyTransaction } from "@/lib/engines/classifierEngine";
import { splitTransactionsIntoSpjParts, MAX_BARANG_PART_CENTS } from "@/lib/engines/splitterEngine";
import { terbilangRupiah } from "@/lib/engines/terbilang";
import { validateSpjParts } from "@/lib/engines/spjValidation";
import { buildLpjDocuments } from "@/lib/services/docxBuilder";
import { prepareExcelForPdf } from "@/lib/services/precisionConverter";
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
  assert.equal(parsed.transactions[0].uraian, "Pembelian pensil");
  assert.equal(parsed.transactions[0].pengeluaran, 25_000);

  const adjusted = prepareExcelForPdf(file);
  const adjustedZip = new PizZip(adjusted);
  const worksheetXml = adjustedZip.file("xl/worksheets/sheet1.xml")?.asText();
  assert.ok(worksheetXml?.includes('fitToWidth="1"'));
  assert.ok(worksheetXml?.includes('fitToHeight="0"'));
  assert.ok(worksheetXml?.includes('fitToPage="1"'));
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
  assert.equal(parsed.transactions[0].uraian, "Pembelian pensil");
  assert.equal(parsed.transactions[0].pengeluaran, 25_000);
}

async function testDocxBuilder(): Promise<void> {
  const schoolProfile: SchoolProfile = {
    id: "school-1",
    nama_sekolah: "PAUD Melati",
    npsn: "12345678",
    alamat_dusun_desa: "Desa Melati",
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
  assert.equal(documents.length, 4);
  for (const document of documents) {
    const zip = new PizZip(document.buffer);
    const xml = zip.file("word/document.xml")?.asText();
    assert.ok(xml, `${document.fileName} has a Word document body`);
    assert.ok(!/\{[#/^]?[a-z_]+\}/i.test(xml), `${document.fileName} has no unresolved tags`);
    if (document.template === "template_spj_part.docx") {
      assert.equal((xml.match(/w:type="page"/g) ?? []).length, 2);
    }
    if (document.template === "template_laporan_bop.docx") {
      assert.ok(xml.includes("748.000"));
    }
  }
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
  await testBkuPdfParsing();
  await testDocxBuilder();
  console.log("Engine tests passed: parsing, classification, splitting, Rupiah wording, DOCX generation, and Excel fit-to-page.");
}

main().catch((error: unknown) => {
  console.error("Engine tests failed:", error);
  process.exitCode = 1;
});
