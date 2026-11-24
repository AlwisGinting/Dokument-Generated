import { readFile } from "node:fs/promises";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type {
  BkuMetadata,
  SchoolProfile,
  SpjPart,
} from "@/lib/types/lpj";
import { isPngDataUrl } from "@/lib/utils/logoDataUrl";
import { getPngDimensions } from "@/lib/utils/pngDimensions";

export interface BuildLpjDocumentsInput {
  schoolProfile: SchoolProfile;
  metadata: BkuMetadata;
  parts: readonly SpjPart[];
  judulDokumen?: string;
  latarBelakangNarasi?: string;
  periodeRekap?: string;
  tahunAnggaran?: string | number;
  nomorSurat?: string;
  namaBank?: string;
  tanggalTerima?: string;
  tanggalSisaKas?: string;
  lampiran?: string;
  tempatSurat?: string;
  tanggalSurat?: string;
  logoDataUrl?: string | null;
}

export interface GeneratedDocx {
  template: string;
  fileName: string;
  buffer: Buffer;
}

const templateDirectory = path.resolve(process.cwd(), "public", "templates");

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatQuantity(value: string): string {
  const quantity = value.trim();
  if (/^\d+(?:[.,]\d+)?$/.test(quantity)) {
    return quantity;
  }
  if (/^bagian\s+\d+(?:\s+dari\s+\d+)?$/i.test(quantity)) {
    return "1";
  }
  throw new Error("Kuantitas barang harus berupa angka.");
}

function cleanItemName(value: string): string {
  return value
    .replace(/\s*\(bagian\s+\d+\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReceiptAmount(value: number): string {
  return `Rp${new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

function receiptDescription(part: SpjPart): string {
  const itemSummary = part.items
    .map((item) => cleanItemName(item.nama_barang))
    .filter(Boolean)
    .join(", ");
  const description =
    part.is_barang && itemSummary ? itemSummary : part.uraian_singkat.trim();
  return `Pembayaran ${description}${part.bulan_alokasi ? ` (${part.bulan_alokasi})` : ""}`;
}

function resizeLogoDrawings(xml: string, logo: Buffer): string {
  const { width, height } = getPngDimensions(logo);
  let resizedCount = 0;
  const resizedXml = xml.replace(
    /<wp:inline\b[\s\S]*?<\/wp:inline>/g,
    (inline) => {
      if (!inline.includes('name="Logo PAUD"')) {
        return inline;
      }

      const extent = inline.match(/<wp:extent\b[^>]*\/>/)?.[0];
      const extentWidth = extent?.match(/\bcx="(\d+)"/);
      const extentHeight = extent?.match(/\bcy="(\d+)"/);
      if (!extent || !extentWidth || !extentHeight) {
        throw new Error("Dimensi logo pada master template tidak ditemukan.");
      }

      const maxExtent = Math.max(Number(extentWidth[1]), Number(extentHeight[1]));
      const scale = maxExtent / Math.max(width, height);
      const cx = Math.round(width * scale);
      const cy = Math.round(height * scale);
      const updateExtent = (tag: string): string =>
        tag
          .replace(/\bcx="\d+"/, `cx="${cx}"`)
          .replace(/\bcy="\d+"/, `cy="${cy}"`);

      resizedCount += 1;
      return inline
        .replace(extent, updateExtent(extent))
        .replace(/<a:ext\b[^>]*\/>/g, updateExtent);
    },
  );
  if (resizedCount === 0) {
    throw new Error("Gambar logo tidak ditemukan pada master template.");
  }
  return resizedXml;
}

function fileSafeName(value: string): string {
  const safe = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!safe) {
    throw new Error("Nama sekolah diperlukan untuk menamai dokumen.");
  }
  return safe.slice(0, 80);
}

const INDONESIAN_ACRONYMS = new Set([
  "bop",
  "kb",
  "paud",
  "pdam",
  "sd",
  "smp",
  "sumut",
  "tk",
]);

function titleCaseIndonesian(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("id-ID")
    .replace(/(^|[\s/-])([\p{L}\d])/gu, (_match, separator: string, initial: string) => {
      return `${separator}${initial.toLocaleUpperCase("id-ID")}`;
    })
    .replace(/\b[\p{L}\d]+\b/gu, (word) =>
      INDONESIAN_ACRONYMS.has(word.toLocaleLowerCase("id-ID"))
        ? word.toLocaleUpperCase("id-ID")
        : word,
    );
}

function todayInIndonesia(): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

async function renderTemplate(
  templateName: string,
  data: Record<string, unknown>,
  logo: Buffer,
): Promise<Buffer> {
  const templatePath = path.join(templateDirectory, templateName);
  let templateBuffer: Buffer;
  try {
    templateBuffer = await readFile(templatePath);
  } catch (error) {
    throw new Error(`Master template "${templateName}" tidak dapat dibaca.`, {
      cause: error,
    });
  }

  const zip = new PizZip(templateBuffer);
  const imagePaths = Object.keys(zip.files).filter(
    (fileName) => fileName.startsWith("word/media/") && /\.png$/i.test(fileName),
  );
  if (!imagePaths.includes("word/media/image1.png")) {
    throw new Error(
      `Master template "${templateName}" tidak memiliki word/media/image1.png.`,
    );
  }
  for (const imagePath of imagePaths) {
    zip.file(imagePath, logo);
  }
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) {
    throw new Error(`Master template "${templateName}" tidak memiliki document.xml.`);
  }
  zip.file(
    "word/document.xml",
    resizeLogoDrawings(documentXml.asText(), logo),
  );

  const document = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{", end: "}" },
  });
  document.render(data);
  return document.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
}

function buildBaseData(input: BuildLpjDocumentsInput): Record<string, unknown> {
  const school = input.schoolProfile;
  const metadata = input.metadata;
  const schoolName = titleCaseIndonesian(school.nama_sekolah);
  const village = titleCaseIndonesian(school.alamat_dusun_desa ?? "");
  const district = titleCaseIndonesian(
    school.kecamatan ?? metadata.kecamatan ?? "",
  );
  const regency = titleCaseIndonesian(
    school.kabupaten ?? metadata.kabupaten ?? "",
  );
  const province = titleCaseIndonesian(
    school.provinsi ?? metadata.provinsi ?? "",
  );
  const tahun = input.tahunAnggaran ?? metadata.tahun ?? "";
  const totalPengeluaran =
    metadata.total_pengeluaran ??
    input.parts.reduce((total, part) => total + part.total_part, 0);
  const nextSchoolYear =
    typeof tahun === "number"
      ? `${tahun}/${tahun + 1}`
      : /^\d{4}$/.test(String(tahun))
        ? `${tahun}/${Number(tahun) + 1}`
        : "";
  const latarBelakangParagraf1 = input.latarBelakangNarasi?.trim();

  return {
    nama_sekolah: schoolName,
    nama_sekolah_kapital: school.nama_sekolah.toLocaleUpperCase("id-ID"),
    npsn: school.npsn ?? "",
    alamat_dusun_desa: village,
    alamat_dusun_desa_kapital: (school.alamat_dusun_desa ?? "").toLocaleUpperCase("id-ID"),
    alamat_jalan: titleCaseIndonesian(school.alamat_jalan ?? ""),
    kecamatan: district,
    kecamatan_kapital: district.toLocaleUpperCase("id-ID"),
    kabupaten: regency,
    kabupaten_kapital: regency.toLocaleUpperCase("id-ID"),
    provinsi: province,
    email: school.email ?? "",
    no_hp: school.no_hp ?? "",
    jabatan_kepsek: titleCaseIndonesian(school.jabatan_kepsek || "Kepala Sekolah"),
    nama_kepsek: titleCaseIndonesian(school.nama_kepsek ?? ""),
    tahun_anggaran: tahun,
    tahun_pelajaran: nextSchoolYear,
    nomor_surat: input.nomorSurat ?? "",
    lampiran: input.lampiran ?? "1 (satu) berkas",
    kota_dinas: regency,
    nama_bank: input.namaBank ?? "",
    tanggal_terima:
      input.tanggalTerima ??
      [metadata.bulan, metadata.tahun].filter(Boolean).join(" "),
    jumlah_terima: formatNumber(metadata.total_penerimaan),
    sisa_kas: formatNumber(metadata.saldo_akhir),
    tanggal_sisa_kas:
      input.tanggalSisaKas ??
      input.tanggalSurat ??
      [metadata.bulan, metadata.tahun].filter(Boolean).join(" "),
    periode_rekap:
      input.periodeRekap?.trim() ||
      [metadata.bulan, metadata.tahun].filter(Boolean).join(" "),
    total_pengeluaran: formatNumber(totalPengeluaran),
    tempat_surat: village || titleCaseIndonesian(input.tempatSurat ?? regency),
    tanggal_surat: input.tanggalSurat?.trim() || todayInIndonesia(),
    desa_sasaran: school.alamat_dusun_desa ?? "",
    total_siswa: school.jumlah_siswa_l + school.jumlah_siswa_p,
    jumlah_siswa_l: school.jumlah_siswa_l,
    jumlah_siswa_p: school.jumlah_siswa_p,
    lama_berdiri: school.lama_berdiri ?? "",
    tahun_berikutnya:
      typeof tahun === "number"
        ? tahun + 1
        : /^\d{4}$/.test(String(tahun))
          ? Number(tahun) + 1
          : "",
    latar_belakang_paragraf_1:
      latarBelakangParagraf1 ||
      `Pendidikan anak usia dini merupakan fondasi penting bagi tumbuh kembang anak. ${schoolName} menyelenggarakan layanan pendidikan yang aman, inklusif, dan sesuai dengan tahap perkembangan peserta didik.`,
    latar_belakang_paragraf_2:
      "Anak usia 1–6 tahun berada dalam masa perkembangan yang memerlukan stimulasi pendidikan secara tepat. Layanan PAUD melalui jalur nonformal memberi kesempatan kepada anak untuk belajar sesuai dengan kebutuhan, potensi, dan lingkungan mereka.",
    latar_belakang_paragraf_3:
      "Pembelajaran PAUD mengutamakan kegiatan bermain yang bermakna, aman, dan menyenangkan. Dengan dukungan sarana serta pembiayaan yang terencana dan dapat dipertanggungjawabkan, layanan pendidikan diharapkan berlangsung secara berkelanjutan.",
  };
}

export async function buildLpjDocuments(
  input: BuildLpjDocumentsInput,
): Promise<GeneratedDocx[]> {
  const baseData = buildBaseData(input);
  const customLogoDataUrl =
    input.logoDataUrl === undefined
      ? input.schoolProfile.logo_data_url
      : input.logoDataUrl;
  let logo: Buffer;
  if (customLogoDataUrl) {
    if (!isPngDataUrl(customLogoDataUrl)) {
      throw new Error("Logo sekolah harus berupa PNG Data URL yang valid.");
    }
    const base64 = customLogoDataUrl.slice("data:image/png;base64,".length);
    logo = Buffer.from(base64, "base64");
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (
      logo.length < pngSignature.length ||
      !logo.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      throw new Error("Data logo tidak berisi gambar PNG yang valid.");
    }
  } else {
    try {
      logo = await readFile(path.resolve(process.cwd(), "public", "assets", "logo_paud.png"));
    } catch (error) {
      throw new Error("Logo PAUD bawaan tidak dapat dibaca.", { cause: error });
    }
  }
  const schoolName = fileSafeName(input.schoolProfile.nama_sekolah);
  const year = String(input.tahunAnggaran ?? input.metadata.tahun ?? "tahun");
  const parts = input.parts.map((part, index) => ({
    ...part,
    is_first_part: index === 0,
    judul_kwitansi:
      part.kategori_bku === "HONOR_GURU"
        ? "KWITANSI PEMBAYARAN HONORARIUM"
        : "KWITANSI PEMBELIAN / PEMBAYARAN",
    total_part: formatNumber(part.total_part),
    total_kwitansi: formatReceiptAmount(part.total_part),
    uraian_kwitansi: receiptDescription(part),
    items: part.items.map((item) => ({
      ...item,
      nama_barang: cleanItemName(item.nama_barang),
      banyaknya: formatQuantity(item.banyaknya),
      harga_satuan: formatNumber(item.harga_satuan),
      jumlah_harga: formatNumber(item.jumlah_harga),
    })),
  }));
  const documents = [
    {
      template: "template_cover.docx",
      suffix: "cover",
      data: {
        ...baseData,
        judul_dokumen: (
          input.judulDokumen?.trim() ||
          "LAPORAN PERTANGGUNGJAWABAN DAN SPJ PAUD"
        ).toLocaleUpperCase("id-ID"),
        nama_sekolah: input.schoolProfile.nama_sekolah.toLocaleUpperCase("id-ID"),
        alamat_dusun_desa: (input.schoolProfile.alamat_dusun_desa ?? "").toLocaleUpperCase("id-ID"),
        kecamatan: (input.schoolProfile.kecamatan ?? input.metadata.kecamatan ?? "").toLocaleUpperCase("id-ID"),
        kabupaten: (input.schoolProfile.kabupaten ?? input.metadata.kabupaten ?? "").toLocaleUpperCase("id-ID"),
        provinsi: (input.schoolProfile.provinsi ?? input.metadata.provinsi ?? "").toLocaleUpperCase("id-ID"),
      },
    },
    {
      template: "template_laporan_bop.docx",
      suffix: "laporan_bop",
      data: baseData,
    },
    {
      template: "template_latar_belakang.docx",
      suffix: "latar_belakang",
      data: baseData,
    },
    ...parts.map((part, index) => {
      const label =
        part.nama_penjual.trim() ||
        part.kategori_toko ||
        part.kategori_bku ||
        "part";
      return {
        template: "template_spj_part.docx",
        suffix: `spj_part_${String(index + 1).padStart(2, "0")}_${fileSafeName(label).toLowerCase()}`,
        data: {
          ...baseData,
          parts: [{ ...part, is_first_part: true }],
        },
      };
    }),
  ];

  return Promise.all(
    documents.map(async ({ template, suffix, data }) => ({
      template,
      fileName: `${schoolName}_${year}_${suffix}.docx`,
      buffer: await renderTemplate(template, data, logo),
    })),
  );
}
