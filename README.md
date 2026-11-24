# PAUD LPJ Automation

Next.js App Router application for deterministic BKU parsing, SPJ drafting, document generation, and Google Drive PDF conversion. Runtime document classification and splitting use fixed rules; the application does not call AI APIs.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the required values.
3. Apply [`supabase/schema.sql`](./supabase/schema.sql) to the Supabase project.
4. Enable Email/Password sign-in in Supabase Auth and enable the Google Drive API; configure OAuth credentials and a refresh token.
5. Run `npm run dev`, then create an account from `/login`.

The Google OAuth client secret and refresh token are server-only. Do not add real credentials to GitHub. Configure the same environment variables in the Vercel project settings before deployment.
The SQL schema enables row-level security and assigns each school and vendor to the authenticated user. If applying it to an existing database, assign any legacy rows an owner through a trusted Supabase admin session before using them; rows without an owner remain inaccessible.

## Web application

- `/login`: Supabase Email/Password sign-in and account creation.
- `/dashboard`: BKU upload, deterministic classification/splitting, editable Part review, LPJ/SPJ generation, Drive sync, and PDF preview.
- `/dashboard/profiles`: CRUD for multiple school profiles and categorized vendors. Seed buttons add the example profiles KB PAUD MELATI and KB HARAPAN KITA.
- All three API endpoints require a valid Supabase access token in `Authorization: Bearer <token>`; database ownership is enforced again by Supabase RLS.

## API

- `POST /api/bku/parse`: `multipart/form-data` with a `file` field (`.pdf` or `.xlsx`). Returns BKU metadata, classified transactions, and draft SPJ parts.
- `POST /api/spj/generate`: JSON with `schoolProfile`, `metadata`, and `parts`; optional fields include the cover, letter, and background narrative values. Validates barang totals (maximum Rp 1.000.000 per Part), generates four DOCX files, exports and bundles their PDFs in Drive, records a generation log, and returns Drive URLs plus base64 PDF data.
- `POST /api/convert`: `multipart/form-data` with `file` (`.docx` or `.xlsx`), `school_id`, `tahun`, and `periode`. XLSX page setup is set to fit one page wide before Google Drive native PDF export.

Uploads are limited to 4 MiB per request to fit the serverless request-size limit. Google Drive and Supabase credentials must be configured for the generation and conversion routes.

## Validation

```bash
npx tsx scripts/testEngines.ts
npx tsc --noEmit
npm run lint
npm run build
```

The test script checks BKU XLSX extraction, Indonesian Rupiah wording, category rules, repeated-month allocation, the Rp 1.000.000 First-Fit Decreasing limit, the honorarium exception, and XLSX fit-to-page configuration.
