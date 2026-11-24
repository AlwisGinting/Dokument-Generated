const DRIVE_FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

export function extractGoogleDriveFolderId(
  input?: string | null,
): string | null {
  const value = input?.trim();
  if (!value) {
    return null;
  }
  if (DRIVE_FOLDER_ID_PATTERN.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname !== "drive.google.com") {
      return null;
    }

    const pathMatch = url.pathname.match(/(?:^|\/)folders\/([^/]+)/);
    const id = pathMatch?.[1] ?? url.searchParams.get("id");
    return id && DRIVE_FOLDER_ID_PATTERN.test(id) ? id : null;
  } catch {
    return null;
  }
}
