export const MAX_LOGO_DATA_URL_LENGTH = 1_500_000;

export function isPngDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_LOGO_DATA_URL_LENGTH) {
    return false;
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  return Boolean(
    match &&
      match[1].length % 4 === 0 &&
      match[1].startsWith("iVBORw0KGgo"),
  );
}
