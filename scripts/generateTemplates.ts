import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  PageBreak,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ISectionOptions,
} from "docx";

const outputDirectory = path.resolve(process.cwd(), "public", "templates");
const defaultFont = "Times New Roman";
const textSize = 24;
const pageProperties: ISectionOptions["properties"] = {
  page: {
    size: { width: 12240, height: 15840 },
    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  },
};

function paragraph(
  text: string,
  options: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    size?: number;
    italics?: boolean;
    before?: number;
    after?: number;
  } = {},
): Paragraph {
  return new Paragraph({
    alignment: options.alignment,
    spacing: { before: options.before ?? 0, after: options.after ?? 160 },
    children: [
      new TextRun({
        text,
        font: defaultFont,
        size: options.size ?? textSize,
        bold: options.bold,
        italics: options.italics,
      }),
    ],
  });
}

function blankLine(): Paragraph {
  return new Paragraph({ spacing: { after: 120 } });
}

function makeCell(
  children: Paragraph[],
  width: number,
): TableCell {
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
  });
}

function letterhead(): (Paragraph | Table)[] {
  const border = {
    style: BorderStyle.SINGLE,
    size: 2,
    color: "000000",
  };

  return [
    new Table({
      width: { size: 9360, type: WidthType.DXA },
      columnWidths: [1700, 7660],
      borders: {
        top: border,
        bottom: border,
        left: border,
        right: border,
        insideHorizontal: border,
        insideVertical: border,
      },
      rows: [
        new TableRow({
          children: [
            makeCell(
              [paragraph("LOGO PAUD", { alignment: AlignmentType.CENTER, bold: true })],
              1700,
            ),
            makeCell(
              [
                paragraph("{nama_sekolah}", {
                  alignment: AlignmentType.CENTER,
                  bold: true,
                  size: 30,
                }),
                paragraph(
                  "{alamat_dusun_desa}, Kecamatan {kecamatan}, Kabupaten {kabupaten}, Provinsi {provinsi}",
                  { alignment: AlignmentType.CENTER, size: 20, after: 40 },
                ),
              ],
              7660,
            ),
          ],
        }),
      ],
    }),
    paragraph("", { after: 0 }),
  ];
}

function createDocument(children: (Paragraph | Table)[]): Document {
  return new Document({
    sections: [
      {
        properties: pageProperties,
        children,
      },
    ],
  });
}

function itemTable(includePrices: boolean): Table {
  const headers = includePrices
    ? ["No", "Nama barang", "Diantar", "Banyaknya", "Harga satuan (Rp)", "Jumlah harga (Rp)"]
    : ["No", "Nama barang", "Diantar", "Banyaknya", "Harga satuan (Rp)", "Jumlah harga satuan (Rp)"];
  const widths = includePrices
    ? [600, 2700, 1100, 1300, 1750, 1910]
    : [600, 2500, 1000, 1300, 1900, 2060];
  const border = {
    style: BorderStyle.SINGLE,
    size: 1,
    color: "000000",
  };
  const cell = (text: string, width: number, bold = false) =>
    makeCell([paragraph(text, { alignment: AlignmentType.CENTER, bold, size: 18, after: 0 })], width);

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((header, index) => cell(header, widths[index], true)),
      }),
      new TableRow({
        children: [
          cell("{#items}{no}", widths[0]),
          cell("{nama_barang}", widths[1]),
          cell("{diantar}", widths[2]),
          cell("{banyaknya}", widths[3]),
          cell(includePrices ? "{harga_satuan}" : "[KOSONG]", widths[4]),
          cell(
            includePrices ? "{jumlah_harga}{/items}" : "[KOSONG]{/items}",
            widths[5],
          ),
        ],
      }),
    ],
  });
}

function createCover(): Document {
  return createDocument([
    blankLine(),
    paragraph("LOGO PAUD", { alignment: AlignmentType.CENTER, bold: true, size: 22 }),
    blankLine(),
    paragraph("{nama_sekolah}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 32,
      after: 240,
    }),
    paragraph("{alamat_dusun_desa}", { alignment: AlignmentType.CENTER, size: 22 }),
    paragraph("Kecamatan {kecamatan}", { alignment: AlignmentType.CENTER, size: 22 }),
    paragraph("Kabupaten {kabupaten}, Provinsi {provinsi}", {
      alignment: AlignmentType.CENTER,
      size: 22,
    }),
    blankLine(),
    blankLine(),
    blankLine(),
    paragraph("{judul_dokumen}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 36,
      before: 600,
      after: 360,
    }),
    paragraph("TAHUN ANGGARAN {tahun_anggaran}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
    }),
    blankLine(),
    blankLine(),
    blankLine(),
    paragraph("{nama_sekolah}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
    }),
    paragraph("{alamat_dusun_desa}", { alignment: AlignmentType.CENTER, size: 22 }),
    paragraph("Kecamatan {kecamatan}", { alignment: AlignmentType.CENTER, size: 22 }),
    paragraph("Kabupaten {kabupaten}, Provinsi {provinsi}", {
      alignment: AlignmentType.CENTER,
      size: 22,
    }),
  ]);
}

function createBopReport(): Document {
  return createDocument([
    ...letterhead(),
    paragraph("LAPORAN PERTANGGUNGJAWABAN BOP", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      before: 240,
    }),
    paragraph("Nomor: {nomor_surat}", { alignment: AlignmentType.CENTER, after: 360 }),
    paragraph("Kepada Yth. Kepala Dinas Pendidikan Pemuda dan Olahraga", { after: 0 }),
    paragraph("di {kota_dinas}", { after: 240 }),
    paragraph("BAB I", { alignment: AlignmentType.CENTER, bold: true, size: 26 }),
    paragraph("PENDAHULUAN", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 26,
      after: 240,
    }),
    paragraph(
      "Laporan ini disusun sebagai bentuk pertanggungjawaban atas penggunaan Bantuan Operasional Penyelenggaraan (BOP) PAUD pada {nama_sekolah}.",
      { after: 200 },
    ),
    paragraph("A. Penerimaan Dana", { bold: true, before: 120 }),
    paragraph(
      "Dana diterima melalui {nama_bank} pada tanggal {tanggal_terima} sebesar Rp {jumlah_terima}.",
    ),
    paragraph("B. Penggunaan Dana", { bold: true, before: 120 }),
    paragraph(
      "Rekapitulasi penggunaan dana pada periode {periode_rekap} sebesar Rp {total_pengeluaran}. Sisa kas pada akhir periode adalah Rp {sisa_kas}.",
    ),
    paragraph(
      "Dana digunakan sesuai dengan kebutuhan penyelenggaraan layanan pendidikan anak usia dini dan ketentuan yang berlaku.",
      { after: 300 },
    ),
    paragraph("Demikian laporan pertanggungjawaban ini dibuat dengan sebenarnya."),
    blankLine(),
    paragraph("{tempat_surat}, {tanggal_surat}", {
      alignment: AlignmentType.RIGHT,
      after: 120,
    }),
    paragraph("{jabatan_kepsek}", { alignment: AlignmentType.RIGHT, after: 1100 }),
    paragraph("{nama_kepsek}", { alignment: AlignmentType.RIGHT, bold: true }),
  ]);
}

function createBackground(): Document {
  return createDocument([
    ...letterhead(),
    paragraph("LATAR BELAKANG DAN RENCANA KEGIATAN", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      before: 240,
      after: 300,
    }),
    paragraph("A. Latar Belakang", { bold: true }),
    paragraph(
      "{latar_belakang_narasi}",
      { after: 220 },
    ),
    paragraph("B. Tujuan", { bold: true, before: 120 }),
    paragraph(
      "Kegiatan ini bertujuan meningkatkan mutu layanan pendidikan, mendukung proses belajar yang aktif dan menyenangkan, memenuhi kebutuhan operasional satuan pendidikan, serta memastikan penggunaan dana dilakukan secara efektif, transparan, dan akuntabel.",
      { after: 220 },
    ),
    paragraph("C. Peserta Didik/Sasaran", { bold: true, before: 120 }),
    paragraph(
      "Sasaran kegiatan adalah peserta didik {nama_sekolah} yang berdomisili di {desa_sasaran}. Jumlah peserta didik sebanyak {total_siswa} anak, terdiri atas {jumlah_siswa_l} peserta didik laki-laki dan {jumlah_siswa_p} peserta didik perempuan.",
      { after: 220 },
    ),
    paragraph("D. Hasil yang Dicapai", { bold: true, before: 120 }),
    paragraph(
      "Kegiatan yang direncanakan mendukung tersedianya kebutuhan pembelajaran dan operasional, meningkatkan partisipasi peserta didik, serta membantu satuan pendidikan memberikan layanan yang lebih tertib dan berkualitas. Pelaksanaan dan hasil kegiatan dicatat sebagai bahan evaluasi dan pertanggungjawaban.",
      { after: 220 },
    ),
    paragraph("E. Tindak Lanjut", { bold: true, before: 120 }),
    paragraph(
      "{nama_sekolah} telah berdiri selama {lama_berdiri} tahun. Pada tahun berikutnya, satuan pendidikan akan menindaklanjuti hasil evaluasi melalui perencanaan kegiatan yang lebih tepat sasaran, pemeliharaan sarana, dan peningkatan mutu layanan pada tahun {tahun_berikutnya}.",
      { after: 220 },
    ),
    paragraph("F. Saran", { bold: true, before: 120 }),
    paragraph(
      "Dukungan dan kerja sama dari pemerintah, orang tua, serta masyarakat diharapkan terus terjalin. Pengelolaan kegiatan dan dana hendaknya dilaksanakan secara tertib, terbuka, sesuai kebutuhan peserta didik, dan mengikuti ketentuan yang berlaku.",
      { after: 300 },
    ),
    paragraph("Mengetahui,", { alignment: AlignmentType.RIGHT }),
    paragraph("{jabatan_kepsek}", { alignment: AlignmentType.RIGHT, after: 1100 }),
    paragraph("{nama_kepsek}", { alignment: AlignmentType.RIGHT, bold: true }),
  ]);
}

function createSpjPart(): Document {
  return createDocument([
    paragraph("{#parts}", { after: 0 }),
    paragraph("{#is_barang}", { after: 0 }),
    ...letterhead(),
    paragraph("KEPADA YTH. {nama_penjual}", { bold: true, before: 200 }),
    paragraph("Di {alamat_penjual}", { after: 220 }),
    paragraph("PESANAN BARANG", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      after: 240,
    }),
    paragraph(
      "Dengan hormat, kami memesan barang-barang berikut untuk keperluan {nama_sekolah}:",
    ),
    itemTable(false),
    paragraph("Ketentuan:", { bold: true, before: 200 }),
    paragraph("1. Barang yang dipesan harus sesuai dengan jenis dan jumlah pada tabel."),
    paragraph("2. Barang diantar dalam keadaan baik dan diterima oleh pihak sekolah."),
    paragraph("3. Pembayaran dilakukan setelah barang diterima dan diperiksa."),
    blankLine(),
    paragraph("{tempat_surat}, {tanggal_surat}", { alignment: AlignmentType.RIGHT }),
    paragraph("{jabatan_kepsek}", { alignment: AlignmentType.RIGHT, after: 1100 }),
    paragraph("{nama_kepsek}", { alignment: AlignmentType.RIGHT, bold: true }),
    new Paragraph({ children: [new PageBreak()] }),
    ...letterhead(),
    paragraph("SURAT PENGANTAR BARANG", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      before: 220,
      after: 260,
    }),
    paragraph("Barang-barang berikut diserahkan kepada {nama_sekolah}:"),
    itemTable(true),
    paragraph("Total: Rp {total_part}", {
      alignment: AlignmentType.RIGHT,
      bold: true,
      before: 200,
    }),
    paragraph("Barang telah diterima dalam keadaan baik."),
    blankLine(),
    paragraph("Penerima,", { alignment: AlignmentType.RIGHT }),
    paragraph("{jabatan_kepsek}", { alignment: AlignmentType.RIGHT, after: 1100 }),
    paragraph("{nama_kepsek}", { alignment: AlignmentType.RIGHT, bold: true }),
    new Paragraph({ children: [new PageBreak()] }),
    paragraph("KWITANSI PEMBELIAN / PEMBAYARAN", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      before: 220,
    }),
    paragraph("{kode_part} - {uraian_singkat}", {
      alignment: AlignmentType.RIGHT,
      size: 18,
      before: 9300,
      after: 0,
    }),
    paragraph("{/is_barang}", { after: 0 }),
    paragraph("{^is_barang}", { after: 0 }),
    paragraph("KWITANSI PEMBELIAN / PEMBAYARAN", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      before: 220,
    }),
    paragraph("{kode_part} - {uraian_singkat}", {
      alignment: AlignmentType.RIGHT,
      size: 18,
      before: 9300,
      after: 0,
    }),
    paragraph("{/is_barang}", { after: 0 }),
    paragraph("{/parts}", { after: 0 }),
  ]);
}

async function writeTemplate(filename: string, document: Document): Promise<void> {
  const buffer = await Packer.toBuffer(document);
  await writeFile(path.join(outputDirectory, filename), buffer);
  console.log(`Generated ${filename} (${buffer.byteLength} bytes)`);
}

async function main(): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeTemplate("template_cover.docx", createCover()),
    writeTemplate("template_laporan_bop.docx", createBopReport()),
    writeTemplate("template_latar_belakang.docx", createBackground()),
    writeTemplate("template_spj_part.docx", createSpjPart()),
  ]);
}

main().catch((error: unknown) => {
  console.error("Failed to generate document templates:", error);
  process.exitCode = 1;
});
