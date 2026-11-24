import { NextResponse } from "next/server";
import { parseBkuFile } from "@/lib/engines/bkuParser";
import { classifyTransactions } from "@/lib/engines/classifierEngine";
import { splitTransactionsIntoSpjParts } from "@/lib/engines/splitterEngine";
import { authenticateRequest } from "@/lib/services/authServer";
import { listVendors } from "@/lib/services/supabaseClient";
import type { AuthenticatedRequest } from "@/lib/services/authServer";
import type { Vendor, VendorCategory } from "@/lib/types/lpj";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Terjadi kesalahan saat membaca BKU.";
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
    return NextResponse.json({ error: "File BKU wajib disertakan." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File BKU kosong." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Ukuran file BKU melebihi batas 4 MiB." },
      { status: 413 },
    );
  }

  let parsed;
  try {
    parsed = await parseBkuFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 422 });
  }

  try {
    const [vendors] = await Promise.all([listVendors(authenticated.accessToken)]);
    const transactions = classifyTransactions(parsed.transactions);
    const vendorByCategory = new Map<VendorCategory, Vendor>();
    for (const vendor of vendors) {
      if (!vendorByCategory.has(vendor.kategori_belanja)) {
        vendorByCategory.set(vendor.kategori_belanja, vendor);
      }
    }
    const parts = splitTransactionsIntoSpjParts(transactions).map((part) => {
      const vendor = vendorByCategory.get(part.kategori_toko ?? "UMUM");
      return vendor
        ? {
            ...part,
            nama_penjual: vendor.nama_toko,
            alamat_penjual: vendor.alamat_toko ?? "",
          }
        : part;
    });
    return NextResponse.json({ metadata: parsed.metadata, transactions, parts });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
