import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
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
import { fitPngDimensions } from "../src/lib/utils/pngDimensions";

const outputDirectory = path.resolve(process.cwd(), "public", "templates");
const logoPath = path.resolve(process.cwd(), "public", "assets", "logo_paud.png");
const defaultFont = "Times New Roman";
const textSize = 24;
const pageWidth = 11906;
const pageHeight = 16838;
const pageMargin = 1134;
const contentWidth = pageWidth - pageMargin * 2;
const pageProperties: ISectionOptions["properties"] = {
  page: {
    size: { width: pageWidth, height: pageHeight },
    margin: {
      top: pageMargin,
      right: pageMargin,
      bottom: pageMargin,
      left: pageMargin,
    },
  },
};

const invisibleBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF",
};
const borderlessBorders = {
  top: invisibleBorder,
  bottom: invisibleBorder,
  left: invisibleBorder,
  right: invisibleBorder,
  insideHorizontal: invisibleBorder,
  insideVertical: invisibleBorder,
};
const blackBorder = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "000000",
};

function paragraph(
  text: string,
  options: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    underline?: boolean;
    color?: string;
    size?: number;
    italics?: boolean;
    before?: number;
    after?: number;
    firstLine?: number;
    lineSpacing?: number;
  } = {},
): Paragraph {
  return new Paragraph({
    alignment: options.alignment ?? AlignmentType.LEFT,
    indent: options.firstLine ? { firstLine: options.firstLine } : undefined,
    spacing: {
      before: options.before ?? 0,
      after: options.after ?? 120,
      line: options.lineSpacing,
    },
    children: [
      new TextRun({
        text,
        font: defaultFont,
        size: options.size ?? textSize,
        bold: options.bold,
        underline: options.underline ? {} : undefined,
        color: options.color,
        italics: options.italics,
      }),
    ],
  });
}

function imageParagraph(
  logo: Buffer,
  width: number,
  height: number,
  alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
  spacing: { before?: number; after?: number } = {},
): Paragraph {
  const dimensions = fitPngDimensions(logo, width, height);
  return new Paragraph({
    alignment,
    spacing: { before: spacing.before ?? 0, after: spacing.after ?? 0 },
    children: [
      new ImageRun({
        type: "png",
        data: logo,
        transformation: dimensions,
        altText: {
          name: "Logo PAUD",
          title: "Logo PAUD",
          description: "Logo lembaga pendidikan anak usia dini",
        },
      }),
    ],
  });
}

function blankLine(after = 160): Paragraph {
  return new Paragraph({ spacing: { after } });
}

function makeCell(
  children: Array<Paragraph | Table>,
  width: number,
  options: { columnSpan?: number; verticalAlign?: "top" | "center" | "bottom" } = {},
): TableCell {
  return new TableCell({
    children,
    width: { size: width, type: WidthType.DXA },
    columnSpan: options.columnSpan,
    verticalAlign: options.verticalAlign ?? VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    borders: borderlessBorders,
  });
}

function letterhead(logo: Buffer): (Paragraph | Table)[] {
  const leftWidth = 1500;
  const rightWidth = contentWidth - leftWidth;
  const header = new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    borders: borderlessBorders,
    rows: [
      new TableRow({
        children: [
          makeCell(
            [imageParagraph(logo, 72, 72, AlignmentType.CENTER)],
            leftWidth,
          ),
          makeCell(
            [
              paragraph("LEMBAGA PENDIDIKAN ANAK USIA DINI", {
                alignment: AlignmentType.CENTER,
                bold: true,
                size: 28,
                after: 30,
              }),
              paragraph("({nama_sekolah_kapital})", {
                alignment: AlignmentType.CENTER,
                bold: true,
                size: 28,
                after: 30,
              }),
              paragraph("{alamat_dusun_desa_kapital}. KECAMATAN {kecamatan_kapital}", {
                alignment: AlignmentType.CENTER,
                bold: true,
                size: 24,
                after: 20,
              }),
              paragraph("KABUPATEN {kabupaten_kapital}", {
                alignment: AlignmentType.CENTER,
                bold: true,
                size: 24,
                after: 20,
              }),
              paragraph(
                "{alamat_jalan}   Email: {email}   No. HP: {no_hp}",
                {
                  alignment: AlignmentType.CENTER,
                  size: 20,
                  after: 0,
                },
              ),
            ],
            rightWidth,
          ),
        ],
      }),
    ],
  });
  const doubleRule = new Paragraph({
    children: [new TextRun({ text: " ", font: defaultFont, size: 1 })],
    border: {
      bottom: {
        style: BorderStyle.DOUBLE,
        size: 24,
        color: "000000",
        space: 1,
      },
    },
    spacing: { before: 80, after: 240 },
  });

  return [header, doubleRule];
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

function signatureBlock(): Paragraph[] {
  return [
    paragraph("{tempat_surat}, {tanggal_surat}", {
      alignment: AlignmentType.RIGHT,
      before: 180,
      after: 120,
    }),
    paragraph("{nama_sekolah_kapital}", {
      alignment: AlignmentType.RIGHT,
      after: 0,
    }),
    blankLine(300),
    blankLine(300),
    blankLine(300),
    paragraph("{nama_kepsek}", {
      alignment: AlignmentType.RIGHT,
      bold: true,
      underline: true,
      after: 0,
    }),
  ];
}

function createCover(logo: Buffer): Document {
  return createDocument([
    blankLine(520),
    paragraph("{judul_dokumen}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 32,
      after: 180,
    }),
    paragraph("TAHUN {tahun_anggaran}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 32,
      after: 0,
    }),
    imageParagraph(logo, 170, 170, AlignmentType.CENTER, {
      before: 1900,
      after: 1900,
    }),
    paragraph("{nama_sekolah}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      before: 1150,
      after: 160,
    }),
    paragraph("{alamat_dusun_desa}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      after: 160,
    }),
    paragraph("KECAMATAN {kecamatan}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      after: 160,
    }),
    paragraph("KABUPATEN {kabupaten}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      after: 160,
    }),
    paragraph("PROVINSI {provinsi}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      after: 0,
    }),
  ]);
}

function borderlessTable(
  rows: TableRow[],
  widths: number[],
): Table {
  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: widths,
    borders: borderlessBorders,
    rows,
  });
}

function createBopReport(logo: Buffer): Document {
  const halfWidth = Math.floor(contentWidth / 2);
  const remainder = contentWidth - halfWidth;
  const addressTable = borderlessTable(
    [
      new TableRow({
        children: [
          makeCell(
            [
              paragraph("Nomor : {nomor_surat}", { after: 120 }),
              paragraph("Lampiran : {lampiran}", { after: 120 }),
              paragraph("Perihal : Pelaporan Penggunaan Dana BOP", {
                after: 0,
              }),
            ],
            halfWidth,
            { verticalAlign: VerticalAlign.TOP },
          ),
          makeCell(
            [
              paragraph("Kepada Yth :", { after: 80 }),
              paragraph("Kepala Dinas Pendidikan Pemuda dan Olahraga", {
                after: 80,
              }),
              paragraph("Di - {kota_dinas}", { after: 0 }),
            ],
            remainder,
            { verticalAlign: VerticalAlign.TOP },
          ),
        ],
      }),
    ],
    [halfWidth, remainder],
  );
  const detailWidths = [4700, 180, contentWidth - 4880];
  const details = [
    [
      "Jumlah dana yang diterima di Bank SUMUT pada tanggal {tanggal_terima}",
      "Rp{jumlah_terima},00",
    ],
    [
      "Sisa dana / Kas di {nama_sekolah} pada tanggal {tanggal_sisa_kas}",
      "Rp{sisa_kas},00",
    ],
    [
      "Rekapitulasi penggunaan dana {periode_rekap}",
      "Rp{total_pengeluaran},00",
    ],
  ];
  const detailTable = borderlessTable(
    details.map(
      ([label, amount]) =>
        new TableRow({
          children: [
            makeCell([paragraph(label, { after: 100 })], detailWidths[0]),
            makeCell([paragraph(":", { alignment: AlignmentType.CENTER, after: 100 })], detailWidths[1]),
            makeCell([paragraph(amount, { after: 100 })], detailWidths[2]),
          ],
        }),
    ),
    detailWidths,
  );

  return createDocument([
    ...letterhead(logo),
    paragraph("BAB I", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      after: 30,
    }),
    paragraph("PENDAHULUAN", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 28,
      after: 300,
    }),
    addressTable,
    blankLine(100),
    paragraph("Dengan hormat,", { before: 120, after: 120 }),
    paragraph(
      "Bersama ini kami laporkan penggunaan dana BOP di Lembaga Pendidikan Anak Usia Dini {nama_sekolah} Tahun Pelajaran {tahun_pelajaran} sebagai berikut:",
      { after: 180 },
    ),
    detailTable,
    blankLine(100),
    paragraph("Bukti pembelian barang / kuitansi / tanda terima terlampir.", {
      after: 140,
    }),
    paragraph(
      "Demikianlah laporan penggunaan dana ini disampaikan oleh Lembaga {nama_sekolah} agar dapat dimaklumi.",
      { after: 260 },
    ),
    ...signatureBlock(),
  ]);
}

function createBackground(logo: Buffer): Document {
  const bodyParagraph = (text: string, after = 120) =>
    paragraph(text, {
      alignment: AlignmentType.JUSTIFIED,
      firstLine: 720,
      lineSpacing: 276,
      after,
    });

  return createDocument([
    ...letterhead(logo),
    paragraph("A. Latar Belakang", { bold: true, before: 80, after: 100 }),
    bodyParagraph("{latar_belakang_paragraf_1}", 100),
    bodyParagraph("{latar_belakang_paragraf_2}", 100),
    bodyParagraph("{latar_belakang_paragraf_3}", 180),
    paragraph("B. Tujuan", { bold: true, before: 80, after: 100 }),
    bodyParagraph("1. Menanamkan budi pekerti luhur dan nilai-nilai agama sejak usia dini.", 70),
    bodyParagraph("2. Mengembangkan kemampuan berkomunikasi dan berbahasa dalam kehidupan sehari-hari.", 70),
    bodyParagraph("3. Mengembangkan daya pikir, kreativitas, dan kemampuan memecahkan masalah sederhana.", 70),
    bodyParagraph("4. Membiasakan perilaku disiplin, mandiri, dan bertanggung jawab sesuai dengan tahap perkembangan anak.", 70),
    bodyParagraph("5. Mengembangkan kemampuan motorik dasar melalui kegiatan yang aman, sehat, dan menyenangkan.", 180),
    paragraph("C. Peserta Didik / Sasaran", { bold: true, before: 80, after: 100 }),
    bodyParagraph("Sasaran kegiatan ini adalah peserta didik {nama_sekolah} yang berdomisili di {desa_sasaran}. Jumlah peserta didik sebanyak {total_siswa} anak, terdiri atas {jumlah_siswa_l} anak laki-laki dan {jumlah_siswa_p} anak perempuan.", 180),
    paragraph("D. Hasil yang Dicapai", { bold: true, before: 80, after: 100 }),
    bodyParagraph("Dukungan dana BOP bagi {nama_sekolah} membantu memenuhi kebutuhan pembelajaran dan operasional, meningkatkan mutu layanan, serta mendukung tumbuh kembang peserta didik. Seluruh kegiatan dan penggunaan dana dicatat sebagai bahan evaluasi dan pertanggungjawaban.", 180),
    paragraph("E. Tindak Lanjut", { bold: true, before: 80, after: 100 }),
    bodyParagraph("{nama_sekolah} telah menyelenggarakan layanan pendidikan selama {lama_berdiri} tahun. Lembaga berkomitmen menjaga keberlanjutan layanan, menindaklanjuti hasil evaluasi, dan mengusulkan dukungan untuk tahun anggaran {tahun_berikutnya}.", 180),
    paragraph("F. Saran", { bold: true, before: 80, after: 100 }),
    bodyParagraph("1. Bantuan sebaiknya disalurkan pada awal tahun ajaran agar kegiatan dapat direncanakan dan dilaksanakan tepat waktu.", 70),
    bodyParagraph("2. Dukungan pendanaan lanjutan diharapkan tersedia secara berkesinambungan sesuai kebutuhan dan ketentuan yang berlaku.", 220),
    ...signatureBlock(),
  ]);
}

function itemTable(includePrices: boolean): Table {
  const widths = [540, 2550, 1120, 1250, 1900, contentWidth - 7360];
  const headers = [
    "No",
    "Nama Barang",
    "Diantar",
    "Banyaknya",
    "Harga Satuan Rp",
    "Jumlah Harga Satuan Rp",
  ];
  const cell = (
    text: string,
    width: number,
    bold = false,
    options: { columnSpan?: number } = {},
  ) =>
    new TableCell({
      children: [
        paragraph(text, {
          alignment: AlignmentType.CENTER,
          bold,
          size: 17,
          after: 0,
        }),
      ],
      width: { size: width, type: WidthType.DXA },
      columnSpan: options.columnSpan,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 55, bottom: 55, left: 45, right: 45 },
      borders: {
        top: blackBorder,
        bottom: blackBorder,
        left: blackBorder,
        right: blackBorder,
      },
    });
  const firstFiveWidth = widths.slice(0, 5).reduce((total, width) => total + width, 0);

  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: blackBorder,
      bottom: blackBorder,
      left: blackBorder,
      right: blackBorder,
      insideHorizontal: blackBorder,
      insideVertical: blackBorder,
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
          cell(includePrices ? "{harga_satuan}" : "", widths[4]),
          cell(includePrices ? "{jumlah_harga}{/items}" : "{/items}", widths[5]),
        ],
      }),
      new TableRow({
        children: [
          cell("TOTAL", firstFiveWidth, true, { columnSpan: 5 }),
          cell(includePrices ? "{total_part}" : "", widths[5], true),
        ],
      }),
    ],
  });
}

function barangPages(logo: Buffer, includePrices: boolean): (Paragraph | Table)[] {
  const title = includePrices ? "SURAT PENGANTAR BARANG" : "PESANAN BARANG";

  return [
    ...letterhead(logo),
    paragraph("Kepada Yth : {nama_penjual}", { bold: true, before: 160, after: 80 }),
    paragraph("Di {alamat_penjual}", { after: 200 }),
    paragraph(title, {
      alignment: AlignmentType.CENTER,
      bold: true,
      underline: true,
      size: 28,
      after: 220,
    }),
    paragraph(
      "Dengan hormat, untuk keperluan {nama_sekolah} pada bulan {bulan_alokasi}, sumber dana BOP Tahun Anggaran {tahun_anggaran}, kami memesan / menyampaikan barang-barang berikut:",
      { after: 180 },
    ),
    itemTable(includePrices),
    paragraph("Ketentuan:", { bold: true, before: 180, after: 90 }),
    paragraph("1. Barang harus sesuai dengan jenis, spesifikasi, dan jumlah pada tabel.", { after: 70 }),
    paragraph("2. Barang diantar dalam keadaan baik dan diperiksa oleh pihak sekolah.", { after: 170 }),
    ...signatureBlock(),
  ];
}

function receiptPage(): Paragraph[] {
  return [
    paragraph("{judul_kwitansi}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      underline: true,
      size: 28,
      after: 0,
    }),
    paragraph("Jumlah pembayaran: {total_kwitansi}", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 26,
      before: 600,
      after: 280,
    }),
    paragraph("{uraian_kwitansi}", {
      alignment: AlignmentType.CENTER,
      size: 24,
      after: 0,
    }),
    paragraph(
      "Lampiran Bukti Fisik: {kode_part} - {uraian_singkat} ({bulan_alokasi})",
      {
        alignment: AlignmentType.RIGHT,
        color: "777777",
        size: 16,
        before: 10_400,
        after: 0,
      },
    ),
  ];
}

function createSpjPart(logo: Buffer): Document {
  return createDocument([
    paragraph("{#parts}", { after: 0 }),
    paragraph("{^is_first_part}", { after: 0 }),
    new Paragraph({ children: [new PageBreak()] }),
    paragraph("{/is_first_part}", { after: 0 }),
    paragraph("{#is_barang}", { after: 0 }),
    ...barangPages(logo, false),
    new Paragraph({ children: [new PageBreak()] }),
    ...barangPages(logo, true),
    new Paragraph({ children: [new PageBreak()] }),
    ...receiptPage(),
    paragraph("{/is_barang}", { after: 0 }),
    paragraph("{^is_barang}", { after: 0 }),
    ...receiptPage(),
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
  const logo = await readFile(logoPath);
  await Promise.all([
    writeTemplate("template_cover.docx", createCover(logo)),
    writeTemplate("template_laporan_bop.docx", createBopReport(logo)),
    writeTemplate("template_latar_belakang.docx", createBackground(logo)),
    writeTemplate("template_spj_part.docx", createSpjPart(logo)),
  ]);
}

main().catch((error: unknown) => {
  console.error("Failed to generate document templates:", error);
  process.exitCode = 1;
});
