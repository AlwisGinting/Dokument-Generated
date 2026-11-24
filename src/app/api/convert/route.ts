import { NextResponse } from "next/server";
import {
  convertToPdfViaDrive,
  ensureFolderStructure,
  uploadBinaryFile,
} from "@/lib/services/googleDriveService";
import { authenticateRequest, type AuthenticatedRequest } from "@/lib/services/authServer";
import {
  getSchoolProfile,
  updateSchoolProfile,
} from "@/lib/services/supabaseClient";
import { prepareExcelForPdf } from "@/lib/services/precisionConverter";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NATIVE_DOC_MIME_TYPE = "application/vnd.google-apps.document";
const NATIVE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";

function safeFileName(fileName: string): string {
  const name = fileName
    .replace(/[\\/]+/g, "_")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
    .trim();
  if (!name || name.startsWith(".")) {
    throw new Error("Nama file tidak valid.");
  }
  return name;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Terjadi kesalahan saat mengonversi dokumen.";
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Permintaan harus berupa multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File DOCX atau XLSX wajib disertakan." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File yang diunggah kosong." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file melebihi batas 4 MiB." },
      { status: 413 },
    );
  }

  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "docx" && extension !== "xlsx") {
    return NextResponse.json(
      { error: "Format tidak didukung. Gunakan file .docx atau .xlsx." },
      { status: 415 },
    );
  }

  const schoolIdValue = formData.get("school_id");
  const yearValue = formData.get("tahun");
  const periodValue = formData.get("periode");
  if (
    typeof schoolIdValue !== "string" ||
    !schoolIdValue.trim() ||
    typeof yearValue !== "string" ||
    !yearValue.trim() ||
    typeof periodValue !== "string" ||
    !periodValue.trim()
  ) {
    return NextResponse.json(
      { error: "school_id, tahun, dan periode wajib diisi untuk folder Drive." },
      { status: 400 },
    );
  }

  try {
    const originalName = safeFileName(file.name);
    const uploadedBuffer = Buffer.from(await file.arrayBuffer());
    const isExcel = extension === "xlsx";
    const sourceMimeType = isExcel ? XLSX_MIME_TYPE : DOCX_MIME_TYPE;
    const nativeMimeType = isExcel ? NATIVE_SHEET_MIME_TYPE : NATIVE_DOC_MIME_TYPE;
    const conversionBuffer = isExcel
      ? prepareExcelForPdf(uploadedBuffer)
      : uploadedBuffer;
    const school = await getSchoolProfile(
      schoolIdValue,
      authenticated.accessToken,
    );
    const folder = await ensureFolderStructure({
      namaSekolah: school.nama_sekolah,
      tahun: yearValue.trim(),
      periode: periodValue.trim(),
      existingSchoolFolderId: school.gdrive_folder_id,
    });
    const warnings = new Set<string>();
    if (folder.warning) {
      warnings.add(folder.warning);
    }
    const sourceFile = await uploadBinaryFile({
      buffer: conversionBuffer,
      fileName: originalName,
      mimeType: sourceMimeType,
      folderId: folder.periodFolderId,
    });
    if (sourceFile.warning && !folder.warning) {
      warnings.add(sourceFile.warning);
    }
    const pdfBuffer = await convertToPdfViaDrive({
      buffer: conversionBuffer,
      fileName: originalName,
      sourceMimeType,
      nativeMimeType,
    });
    const pdfName = originalName.replace(/\.(docx|xlsx)$/i, ".pdf");
    const pdfFile = await uploadBinaryFile({
      buffer: pdfBuffer,
      fileName: pdfName,
      mimeType: "application/pdf",
      folderId: folder.periodFolderId,
    });
    if (pdfFile.warning && !folder.warning) {
      warnings.add(pdfFile.warning);
    }
    if (folder.schoolFolderId) {
      await updateSchoolProfile(
        school.id,
        { gdrive_folder_id: folder.schoolFolderId },
        authenticated.accessToken,
      );
    }

    return NextResponse.json({
      success: true,
      sourceUrl: sourceFile.url,
      pdfUrl: pdfFile.url,
      pdfDownloadUrl: `https://drive.google.com/uc?export=download&id=${pdfFile.id}`,
      folderUrl: folder.periodFolderId
        ? `https://drive.google.com/drive/folders/${folder.periodFolderId}`
        : "https://drive.google.com/drive/my-drive",
      warnings: Array.from(warnings),
      pdfBase64: pdfBuffer.toString("base64"),
    });
  } catch (error) {
    console.error("Precision conversion failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
