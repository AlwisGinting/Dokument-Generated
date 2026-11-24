import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";

export interface DriveFolderStructure {
  rootFolderId: string;
  schoolFolderId: string;
  yearFolderId: string;
  periodFolderId: string;
}

export interface StoredDriveFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
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

async function verifyFolder(drive: drive_v3.Drive, folderId: string): Promise<void> {
  const response = await drive.files.get({
    fileId: folderId,
    fields: "id,mimeType",
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
  const rootFolderId = await ensureFolder(drive, "LPJ_PAUD_AUTOMATION", null);
  let schoolFolderId: string;
  if (input.existingSchoolFolderId) {
    await verifyFolder(drive, input.existingSchoolFolderId);
    schoolFolderId = input.existingSchoolFolderId;
  } else {
    schoolFolderId = await ensureFolder(drive, input.namaSekolah, rootFolderId);
  }
  const yearFolderId = await ensureFolder(drive, String(input.tahun), schoolFolderId);
  const periodFolderId = await ensureFolder(drive, input.periode, yearFolderId);

  return { rootFolderId, schoolFolderId, yearFolderId, periodFolderId };
}

export async function uploadBinaryFile(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  folderId: string;
}): Promise<StoredDriveFile> {
  const drive = getGoogleDriveClient();
  const response = await drive.files.create({
    requestBody: {
      name: input.fileName,
      mimeType: input.mimeType,
      parents: [input.folderId],
    },
    media: {
      mimeType: input.mimeType,
      body: Readable.from([input.buffer]),
    },
    fields: "id,name,mimeType,webViewLink",
    supportsAllDrives: true,
  });
  return toStoredFile(response.data);
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
  folderId: string;
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
        parents: [input.folderId],
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
