import { PDFDocument } from "pdf-lib";
import { NextResponse } from "next/server";
import { buildLpjDocuments } from "@/lib/services/docxBuilder";
import { validateSpjParts } from "@/lib/engines/spjValidation";
import {
  convertToPdfViaDrive,
  ensureFolderStructure,
  getGoogleDriveClient,
  uploadBinaryFile,
} from "@/lib/services/googleDriveService";
import { authenticateRequest, type AuthenticatedRequest } from "@/lib/services/authServer";
import {
  createGenerationLog,
  getSchoolProfile,
  updateSchoolProfile,
} from "@/lib/services/supabaseClient";
import type {
  BkuMetadata,
  SchoolProfile,
  SpjItem,
  SpjPart,
  VendorCategory,
} from "@/lib/types/lpj";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const NATIVE_DOC_MIME_TYPE = "application/vnd.google-apps.document";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isSchoolProfile(value: unknown): value is SchoolProfile {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.nama_sekolah === "string" &&
    typeof value.jabatan_kepsek === "string" &&
    typeof value.jumlah_siswa_l === "number" &&
    typeof value.jumlah_siswa_p === "number" &&
    isNullableString(value.npsn) &&
    isNullableString(value.alamat_dusun_desa) &&
    isNullableString(value.kecamatan) &&
    isNullableString(value.kabupaten) &&
    isNullableString(value.provinsi) &&
    isNullableString(value.email) &&
    isNullableString(value.no_hp) &&
    isNullableString(value.nama_kepsek) &&
    isNullableString(value.nama_bendahara) &&
    isNullableNumber(value.lama_berdiri) &&
    isNullableString(value.gdrive_folder_id)
  );
}

function isBkuMetadata(value: unknown): value is BkuMetadata {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNullableString(value.bulan) &&
    isNullableNumber(value.tahun) &&
    isNullableString(value.npsn) &&
    isNullableString(value.nama_sekolah) &&
    isNullableString(value.kecamatan) &&
    isNullableString(value.kabupaten) &&
    isNullableString(value.provinsi) &&
    isNullableNumber(value.saldo_awal) &&
    isNullableNumber(value.total_penerimaan) &&
    isNullableNumber(value.total_pengeluaran) &&
    isNullableNumber(value.saldo_akhir)
  );
}

function isVendorCategory(value: unknown): value is VendorCategory {
  return (
    value === "ATK" ||
    value === "OBAT" ||
    value === "KONSUMSI" ||
    value === "CETAK" ||
    value === "UMUM"
  );
}

function isSpjItem(value: unknown): value is SpjItem {
  return (
    isRecord(value) &&
    typeof value.no === "number" &&
    typeof value.nama_barang === "string" &&
    typeof value.diantar === "string" &&
    typeof value.banyaknya === "string" &&
    typeof value.harga_satuan === "number" &&
    Number.isFinite(value.harga_satuan) &&
    typeof value.jumlah_harga === "number" &&
    Number.isFinite(value.jumlah_harga)
  );
}

function isSpjPart(value: unknown): value is SpjPart {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.kode_part === "string" &&
    typeof value.is_barang === "boolean" &&
    (value.kategori_toko === null || isVendorCategory(value.kategori_toko)) &&
    typeof value.bulan_alokasi === "string" &&
    typeof value.tanggal_transaksi === "string" &&
    typeof value.nama_penjual === "string" &&
    typeof value.alamat_penjual === "string" &&
    typeof value.uraian_singkat === "string" &&
    Array.isArray(value.items) &&
    value.items.every(isSpjItem) &&
    typeof value.total_part === "number" &&
    Number.isFinite(value.total_part) &&
    value.total_part >= 0
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Terjadi kesalahan saat membuat dokumen SPJ.";
}

async function combinePdfs(buffers: readonly Buffer[]): Promise<Buffer> {
  const bundle = await PDFDocument.create();
  for (const buffer of buffers) {
    const source = await PDFDocument.load(buffer);
    const pages = await bundle.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      bundle.addPage(page);
    }
  }
  return Buffer.from(await bundle.save());
}

export async function POST(request: Request): Promise<NextResponse> {
  let authenticated: AuthenticatedRequest | null;
  try {
    authenticated = await authenticateRequest(request);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
  if (!authenticated) {
    return NextResponse.json({ error: "Sesi login tidak valid atau telah berakhir." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON yang valid." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Body permintaan tidak valid." }, { status: 400 });
  }

  const schoolProfile = body.schoolProfile;
  const metadata = body.metadata;
  const parts = body.parts;
  if (
    !isSchoolProfile(schoolProfile) ||
    !isBkuMetadata(metadata) ||
    !Array.isArray(parts) ||
    !parts.every(isSpjPart)
  ) {
    return NextResponse.json(
      { error: "Profil sekolah, metadata BKU, atau daftar part SPJ tidak valid." },
      { status: 400 },
    );
  }
  const partIssues = validateSpjParts(parts);
  if (partIssues.length > 0) {
    return NextResponse.json(
      { error: "Validasi Part gagal.", details: partIssues },
      { status: 400 },
    );
  }

  const year =
    (typeof body.tahunAnggaran === "string" &&
      /^\d{4}$/.test(body.tahunAnggaran.trim())) ||
    (typeof body.tahunAnggaran === "number" &&
      Number.isInteger(body.tahunAnggaran) &&
      body.tahunAnggaran >= 1900 &&
      body.tahunAnggaran <= 9999)
      ? body.tahunAnggaran
      : metadata.tahun;
  if (year === null || year === undefined || !String(year).trim()) {
    return NextResponse.json(
      { error: "Tahun anggaran harus tersedia pada metadata atau permintaan." },
      { status: 400 },
    );
  }

  const optionalString = (key: string): string | undefined =>
    typeof body[key] === "string" ? body[key] : undefined;
  const period =
    optionalString("periodeBku")?.trim() ||
    [metadata.bulan, metadata.tahun].filter(Boolean).join(" ") ||
    String(year);

  try {
    getGoogleDriveClient();
    const persistedSchool = await getSchoolProfile(
      schoolProfile.id,
      authenticated.accessToken,
    );
    const folder = await ensureFolderStructure({
      namaSekolah: persistedSchool.nama_sekolah,
      tahun: year,
      periode: period,
      existingSchoolFolderId: persistedSchool.gdrive_folder_id,
    });
    const generated = await buildLpjDocuments({
      schoolProfile: persistedSchool,
      metadata,
      parts,
      tahunAnggaran: year,
      periodeRekap: period,
      judulDokumen: optionalString("judulDokumen"),
      latarBelakangNarasi: optionalString("latarBelakangNarasi"),
      nomorSurat: optionalString("nomorSurat"),
      namaBank: optionalString("namaBank"),
      tanggalTerima: optionalString("tanggalTerima"),
      tempatSurat: optionalString("tempatSurat"),
      tanggalSurat: optionalString("tanggalSurat"),
    });

    const documentFiles: Array<{
      fileName: string;
      docxUrl: string;
      pdfUrl: string;
      docxDownloadUrl: string;
      pdfDownloadUrl: string;
      pdfBuffer: Buffer;
    }> = [];
    for (const document of generated) {
      const docxFile = await uploadBinaryFile({
        buffer: document.buffer,
        fileName: document.fileName,
        mimeType: DOCX_MIME_TYPE,
        folderId: folder.periodFolderId,
      });
      const pdfBuffer = await convertToPdfViaDrive({
        buffer: document.buffer,
        fileName: document.fileName,
        sourceMimeType: DOCX_MIME_TYPE,
        nativeMimeType: NATIVE_DOC_MIME_TYPE,
        folderId: folder.periodFolderId,
      });
      const pdfName = document.fileName.replace(/\.docx$/i, ".pdf");
      const pdfFile = await uploadBinaryFile({
        buffer: pdfBuffer,
        fileName: pdfName,
        mimeType: "application/pdf",
        folderId: folder.periodFolderId,
      });
      documentFiles.push({
        fileName: document.fileName,
        docxUrl: docxFile.url,
        pdfUrl: pdfFile.url,
        docxDownloadUrl: `https://drive.google.com/uc?export=download&id=${docxFile.id}`,
        pdfDownloadUrl: `https://drive.google.com/uc?export=download&id=${pdfFile.id}`,
        pdfBuffer,
      });
    }

    const bundleBuffer = await combinePdfs(
      documentFiles.map((document) => document.pdfBuffer),
    );
    const bundleName = `${persistedSchool.nama_sekolah}_${year}_LPJ_SPJ_bundle.pdf`;
    const bundleFile = await uploadBinaryFile({
      buffer: bundleBuffer,
      fileName: bundleName,
      mimeType: "application/pdf",
      folderId: folder.periodFolderId,
    });

    await updateSchoolProfile(persistedSchool.id, {
      gdrive_folder_id: folder.schoolFolderId,
    }, authenticated.accessToken);
    const totalPengeluaran =
      metadata.total_pengeluaran ??
      parts.reduce((total, part) => total + part.total_part, 0);
    const generationLog = await createGenerationLog({
      school_id: persistedSchool.id,
      periode_bku: period,
      total_pengeluaran: totalPengeluaran,
      gdrive_pdf_url: bundleFile.url,
      gdrive_docx_url: documentFiles[0]?.docxUrl ?? null,
    }, authenticated.accessToken);

    return NextResponse.json({
      success: true,
      bundlePdfUrl: bundleFile.url,
      bundlePdfDownloadUrl: `https://drive.google.com/uc?export=download&id=${bundleFile.id}`,
      folderUrl: `https://drive.google.com/drive/folders/${folder.periodFolderId}`,
      pdfBase64: bundleBuffer.toString("base64"),
      files: documentFiles.map(
        ({ fileName, docxUrl, pdfUrl, docxDownloadUrl, pdfDownloadUrl }) => ({
          fileName,
          docxUrl,
          pdfUrl,
          docxDownloadUrl,
          pdfDownloadUrl,
        }),
      ),
      generationLog,
    });
  } catch (error) {
    console.error("SPJ generation failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
