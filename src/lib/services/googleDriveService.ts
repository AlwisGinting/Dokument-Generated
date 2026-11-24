import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { extractGoogleDriveFolderId } from "@/lib/utils/googleDriveFolderId";

export { extractGoogleDriveFolderId } from "@/lib/utils/googleDriveFolderId";

export interface DriveFolderStructure {
  rootFolderId: string | null;
  schoolFolderId: string | null;
  yearFolderId: string | null;
  periodFolderId: string | null;
  warning?: string;
}

export interface StoredDriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
  warning?: string;
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variabel lingkungan ${name} belum dikonfigurasi.`);
  }
  return value;
}

export function getGoogleDriveClient(): drive_v3.Drive {
  const oauth2Client = new google.auth.OAuth2(
    requiredEnvironmentValue("GOOGLE_CLIENT_ID"),
    requiredEnvironmentValue("GOOGLE_CLIENT_SECRET"),
  );
  oauth2Client.setCredentials({
    refresh_token: requiredEnvironmentValue("GOOGLE_REFRESH_TOKEN"),
  });
  return google.drive({ version: "v3", auth: oauth2Client });
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function requiredFileId(file: drive_v3.Schema$File, description: string): string {
  if (!file.id) {
    throw new Error(`Google Drive tidak mengembalikan ID untuk ${description}.`);
  }
  return file.id;
}

function toStoredFile(file: drive_v3.Schema$File): StoredDriveFile {
  const id = requiredFileId(file, "file");
  return {
    id,
    name: file.name ?? id,
    mimeType: file.mimeType ?? "application/octet-stream",
    url: file.webViewLink ?? `https://drive.google.com/file/d/${id}/view`,
  };
}

async function findFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string | null,
): Promise<string | null> {
  const parentFilter = parentId
    ? `'${escapeDriveQuery(parentId)}' in parents`
    : "'root' in parents";
  const response = await drive.files.list({
    q: `name = '${escapeDriveQuery(name)}' and mimeType = 'application/vnd.google-apps.folder' and ${parentFilter} and trashed = false`,
    fields: "files(id,name,mimeType,webViewLink)",
    pageSize: 100,
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const folder = response.data.files?.[0];
  return folder?.id ?? null;
}

async function ensureFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string | null,
): Promise<string> {
  const existingId = await findFolder(drive, name, parentId);
  if (existingId) {
    return existingId;
  }

  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return requiredFileId(response.data, `folder "${name}"`);
}

function driveErrorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  const status =
    typeof candidate.response?.status === "number"
      ? candidate.response.status
      : typeof candidate.code === "number"
        ? candidate.code
        : null;
  return status;
}

async function verifyFolder(drive: drive_v3.Drive, folderId: string): Promise<void> {
  const response = await drive.files.get({
    fileId: folderId,
    fields: "id, mimeType",
    supportsAllDrives: true,
  });
  if (response.data.mimeType !== "application/vnd.google-apps.folder") {
    throw new Error("gdrive_folder_id bukan ID folder Google Drive.");
  }
}

export async function ensureFolderStructure(input: {
  namaSekolah: string;
  tahun: string | number;
  periode: string;
  existingSchoolFolderId?: string | null;
}): Promise<DriveFolderStructure> {
  const drive = getGoogleDriveClient();
  const configuredFolderId = input.existingSchoolFolderId?.trim();
  const existingSchoolFolderId = extractGoogleDriveFolderId(configuredFolderId);
  if (configuredFolderId && !existingSchoolFolderId) {
    return {
      rootFolderId: null,
      schoolFolderId: null,
      yearFolderId: null,
      periodFolderId: null,
      warning:
        "Link atau ID folder Google Drive tidak valid. File disimpan di root Drive.",
    };
  }

  if (existingSchoolFolderId) {
    try {
      await verifyFolder(drive, existingSchoolFolderId);
    } catch (error) {
      if (driveErrorStatus(error) === 403 || driveErrorStatus(error) === 404) {
        return {
          rootFolderId: null,
          schoolFolderId: null,
          yearFolderId: null,
          periodFolderId: null,
          warning:
            "Folder Google Drive tidak ditemukan atau tidak dapat diakses. File disimpan di root Drive.",
        };
      }
      if (
        error instanceof Error &&
        error.message === "gdrive_folder_id bukan ID folder Google Drive."
      ) {
        return {
          rootFolderId: null,
          schoolFolderId: null,
          yearFolderId: null,
          periodFolderId: null,
          warning:
            "ID Google Drive bukan folder. File disimpan di root Drive.",
        };
      }
      throw error;
    }
  }

  try {
    const rootFolderId = await ensureFolder(drive, "LPJ_PAUD_AUTOMATION", null);
    let schoolFolderId: string;
    if (existingSchoolFolderId) {
      schoolFolderId = existingSchoolFolderId;
    } else {
      schoolFolderId = await ensureFolder(drive, input.namaSekolah, rootFolderId);
    }
    const yearFolderId = await ensureFolder(drive, String(input.tahun), schoolFolderId);
    const periodFolderId = await ensureFolder(drive, input.periode, yearFolderId);

    return { rootFolderId, schoolFolderId, yearFolderId, periodFolderId };
  } catch (error) {
    if (driveErrorStatus(error) === 403 || driveErrorStatus(error) === 404) {
      return {
        rootFolderId: null,
        schoolFolderId: null,
        yearFolderId: null,
        periodFolderId: null,
        warning:
          "Folder tujuan tidak dapat digunakan. File disimpan di root Drive.",
      };
    }
    throw error;
  }
}

export async function uploadBinaryFile(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folderId?: string | null;
}): Promise<StoredDriveFile> {
  const drive = getGoogleDriveClient();
  let folderId = extractGoogleDriveFolderId(input.folderId);
  let warning: string | undefined;

  if (input.folderId && !folderId) {
    warning = "Folder tujuan tidak valid. File disimpan di root Drive.";
  } else if (folderId) {
    try {
      await verifyFolder(drive, folderId);
    } catch (error) {
      const status = driveErrorStatus(error);
      if (
        status === 403 ||
        status === 404 ||
        (error instanceof Error &&
          error.message === "gdrive_folder_id bukan ID folder Google Drive.")
      ) {
        warning =
          "Folder tujuan tidak ditemukan atau tidak dapat diakses. File disimpan di root Drive.";
        folderId = null;
      } else {
        throw error;
      }
    }
  } else {
    warning = "Folder tujuan kosong. File disimpan di root Drive.";
  }

  const createFile = async (parentFolderId: string | null) =>
    drive.files.create({
      requestBody: {
        name: input.fileName,
        mimeType: input.mimeType,
        ...(parentFolderId ? { parents: [parentFolderId] } : {}),
      },
      media: {
        mimeType: input.mimeType,
        body: Readable.from([input.buffer]),
      },
      fields: "id,name,mimeType,webViewLink",
      supportsAllDrives: true,
    });

  let response: Awaited<ReturnType<typeof createFile>>;
  try {
    response = await createFile(folderId);
  } catch (error) {
    const status = driveErrorStatus(error);
    if (!folderId || (status !== 403 && status !== 404)) {
      throw error;
    }
    warning =
      "Akses ke folder tujuan gagal. File disimpan di root Drive.";
    response = await createFile(null);
  }
  return { ...toStoredFile(response.data), ...(warning ? { warning } : {}) };
}

export async function extractPdfTextViaGoogleDrive(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const drive = getGoogleDriveClient();
  let temporaryFileId: string | null = null;
  let extractionFailed = false;

  try {
    const converted = await drive.files.create({
      requestBody: {
        name: fileName.replace(/\.pdf$/i, "") || "BKU",
        mimeType: "application/vnd.google-apps.document",
      },
      media: {
        mimeType: "application/pdf",
        body: Readable.from([buffer]),
      },
      fields: "id",
      supportsAllDrives: true,
    });
    temporaryFileId = requiredFileId(converted.data, "dokumen sementara hasil OCR");
    const exported = await drive.files.export(
      { fileId: temporaryFileId, mimeType: "text/plain" },
      { responseType: "arraybuffer" },
    );
    return responseDataToBuffer(exported.data).toString("utf8");
  } catch (error) {
    extractionFailed = true;
    throw error;
  } finally {
    if (temporaryFileId) {
      try {
        await drive.files.delete({
          fileId: temporaryFileId,
          supportsAllDrives: true,
        });
      } catch (cleanupError) {
        if (extractionFailed) {
          console.error("Google Drive temporary PDF cleanup failed:", cleanupError);
        } else {
          throw cleanupError;
        }
      }
    }
  }
}

function responseDataToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  throw new Error("Google Drive mengembalikan data PDF dengan format yang tidak dikenal.");
}

export async function convertToPdfViaDrive(input: {
  buffer: Buffer;
  fileName: string;
  sourceMimeType: string;
  nativeMimeType: "application/vnd.google-apps.document" | "application/vnd.google-apps.spreadsheet";
}): Promise<Buffer> {
  const drive = getGoogleDriveClient();
  const convertedName = input.fileName.replace(/\.[^.]+$/, "");
  let temporaryFileId: string | null = null;
  let conversionFailed = false;

  try {
    const converted = await drive.files.create({
      requestBody: {
        name: convertedName,
        mimeType: input.nativeMimeType,
      },
      media: {
        mimeType: input.sourceMimeType,
        body: Readable.from([input.buffer]),
      },
      fields: "id",
      supportsAllDrives: true,
    });
    temporaryFileId = requiredFileId(converted.data, "file hasil konversi native");
    const exported = await drive.files.export(
      { fileId: temporaryFileId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" },
    );
    return responseDataToBuffer(exported.data);
  } catch (error) {
    conversionFailed = true;
    throw error;
  } finally {
    if (temporaryFileId) {
      try {
        await drive.files.delete({
          fileId: temporaryFileId,
          supportsAllDrives: true,
        });
      } catch (cleanupError) {
        if (conversionFailed) {
          console.error("Google Drive temporary conversion cleanup failed:", cleanupError);
        } else {
          throw cleanupError;
        }
      }
    }
  }
}
