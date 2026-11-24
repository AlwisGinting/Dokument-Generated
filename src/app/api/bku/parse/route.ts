import { NextResponse } from "next/server";
import { mergeBkuParseResults } from "@/lib/engines/bkuBatch";
import { parseBkuFile } from "@/lib/engines/bkuParser";
import { classifyTransactions } from "@/lib/engines/classifierEngine";
import { splitTransactionsIntoSpjParts } from "@/lib/engines/splitterEngine";
import { authenticateRequest } from "@/lib/services/authServer";
import { listVendors } from "@/lib/services/supabaseClient";
import type { AuthenticatedRequest } from "@/lib/services/authServer";
import type { BkuParseResult, Vendor, VendorCategory } from "@/lib/types/lpj";

const MAX_TOTAL_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_UPLOAD_FILES = 12;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Terjadi kesalahan saat membaca BKU.";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const authenticated: AuthenticatedRequest | null =
      await authenticateRequest(request);
    if (!authenticated) {
      return NextResponse.json(
        { error: "Sesi login tidak valid atau telah berakhir." },
        { status: 401 },
      );
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

    const multipleFiles = formData.getAll("files");
    const submittedFiles =
      multipleFiles.length > 0
        ? multipleFiles
        : [formData.get("file")].filter((value) => value !== null);
    if (submittedFiles.length === 0) {
      return NextResponse.json(
        { error: "Setidaknya satu file BKU wajib disertakan." },
        { status: 400 },
      );
    }
    const files = submittedFiles.filter(
      (value): value is File => value instanceof File,
    );
    if (files.length !== submittedFiles.length) {
      return NextResponse.json(
        { error: "Semua file BKU harus berupa berkas PDF atau XLSX." },
        { status: 400 },
      );
    }
    if (files.length > MAX_UPLOAD_FILES) {
      return NextResponse.json(
        { error: `Maksimal ${MAX_UPLOAD_FILES} file BKU dapat diproses sekaligus.` },
        { status: 413 },
      );
    }
    if (files.some((file) => file.size === 0)) {
      return NextResponse.json({ error: "File BKU tidak boleh kosong." }, { status: 400 });
    }
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Total ukuran seluruh file BKU melebihi batas 4 MiB." },
        { status: 413 },
      );
    }

    const parsedFiles: BkuParseResult[] = [];
    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        parsedFiles.push(await parseBkuFile(buffer, file.name));
      } catch (error) {
        return NextResponse.json(
          { error: `${file.name}: ${errorMessage(error)}` },
          { status: 422 },
        );
      }
    }

    const batch = mergeBkuParseResults(parsedFiles);
    const vendors = await listVendors(authenticated.accessToken);
    const transactions = classifyTransactions(batch.transactions);
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

    return NextResponse.json({
      metadata: batch.metadata,
      period: batch.period,
      files: files.map((file) => file.name),
      transactions,
      parts,
    });
  } catch (error) {
    console.error("BKU parse failed:", error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
