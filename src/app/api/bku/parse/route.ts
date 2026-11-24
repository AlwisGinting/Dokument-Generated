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
  return error instanceof Error ? error.message : String(error);
}

function errorResponse(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const authenticated: AuthenticatedRequest | null =
      await authenticateRequest(request);
    if (!authenticated) {
      return errorResponse("Sesi login tidak valid atau telah berakhir.");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      throw new Error(
        `Permintaan harus berupa multipart/form-data: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    const multipleFiles = formData.getAll("files");
    const submittedFiles =
      multipleFiles.length > 0
        ? multipleFiles
        : [formData.get("file")].filter((value) => value !== null);
    if (submittedFiles.length === 0) {
      return errorResponse("Setidaknya satu file BKU wajib disertakan.");
    }
    const files = submittedFiles.filter(
      (value): value is File => value instanceof File,
    );
    if (files.length !== submittedFiles.length) {
      return errorResponse("Semua file BKU harus berupa berkas PDF atau XLSX.");
    }
    if (files.length > MAX_UPLOAD_FILES) {
      return errorResponse(
        `Maksimal ${MAX_UPLOAD_FILES} file BKU dapat diproses sekaligus.`,
      );
    }
    if (files.some((file) => file.size === 0)) {
      return errorResponse("File BKU tidak boleh kosong.");
    }
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      return errorResponse("Total ukuran seluruh file BKU melebihi batas 4 MiB.");
    }

    const parsedFiles: BkuParseResult[] = [];
    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        parsedFiles.push(await parseBkuFile(buffer, file.name));
      } catch (error) {
        throw new Error(`${file.name}: ${errorMessage(error)}`, { cause: error });
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
    return errorResponse(errorMessage(error));
  }
}
