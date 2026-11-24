import { readFile } from "node:fs/promises";
import path from "node:path";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type {
  BkuMetadata,
  SchoolProfile,
  SpjPart,
} from "@/lib/types/lpj";

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
  tempatSurat?: string;
  tanggalSurat?: string;
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
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
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

async function renderTemplate(
  templateName: string,
  data: Record<string, unknown>,
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
  const tahun = input.tahunAnggaran ?? metadata.tahun ?? "";
  const totalPengeluaran =
    metadata.total_pengeluaran ??
    input.parts.reduce((total, part) => total + part.total_part, 0);

  return {
    nama_sekolah: school.nama_sekolah,
    npsn: school.npsn ?? "",
    alamat_dusun_desa: school.alamat_dusun_desa ?? "",
    kecamatan: school.kecamatan ?? metadata.kecamatan ?? "",
    kabupaten: school.kabupaten ?? metadata.kabupaten ?? "",
    provinsi: school.provinsi ?? metadata.provinsi ?? "",
    jabatan_kepsek: school.jabatan_kepsek || "Kepala Sekolah",
    nama_kepsek: school.nama_kepsek ?? "",
    tahun_anggaran: tahun,
    nomor_surat: input.nomorSurat ?? "",
    kota_dinas: metadata.kabupaten ?? school.kabupaten ?? "",
    nama_bank: input.namaBank ?? "",
    tanggal_terima:
      input.tanggalTerima ??
      [metadata.bulan, metadata.tahun].filter(Boolean).join(" "),
    jumlah_terima: formatNumber(metadata.total_penerimaan),
    sisa_kas: formatNumber(metadata.saldo_akhir),
    periode_rekap:
      input.periodeRekap?.trim() ||
      [metadata.bulan, metadata.tahun].filter(Boolean).join(" "),
    total_pengeluaran: formatNumber(totalPengeluaran),
    tempat_surat: input.tempatSurat ?? school.kabupaten ?? "",
    tanggal_surat: input.tanggalSurat ?? "",
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
    latar_belakang_narasi:
      input.latarBelakangNarasi?.trim() ||
      `Pendidikan anak usia dini merupakan fondasi penting bagi tumbuh kembang anak. ${school.nama_sekolah} menyelenggarakan layanan pendidikan yang aman, inklusif, dan sesuai tahap perkembangan peserta didik. Dukungan pembiayaan yang terencana dan dapat dipertanggungjawabkan diperlukan agar kegiatan belajar, pemenuhan sarana, serta layanan kepada anak dapat berjalan dengan baik.`,
  };
}

export async function buildLpjDocuments(
  input: BuildLpjDocumentsInput,
): Promise<GeneratedDocx[]> {
  const baseData = buildBaseData(input);
  const schoolName = fileSafeName(input.schoolProfile.nama_sekolah);
  const year = String(input.tahunAnggaran ?? input.metadata.tahun ?? "tahun");
  const parts = input.parts.map((part) => ({
    ...part,
    total_part: formatNumber(part.total_part),
    items: part.items.map((item) => ({
      ...item,
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
        judul_dokumen:
          input.judulDokumen?.trim() ||
          "LAPORAN PERTANGGUNGJAWABAN DAN SPJ PAUD",
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
    {
      template: "template_spj_part.docx",
      suffix: "spj",
      data: { ...baseData, parts },
    },
  ];

  return Promise.all(
    documents.map(async ({ template, suffix, data }) => ({
      template,
      fileName: `${schoolName}_${year}_${suffix}.docx`,
      buffer: await renderTemplate(template, data),
    })),
  );
}
