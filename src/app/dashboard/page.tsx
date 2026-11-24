"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  LoaderCircle,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import SmartPartEditor from "@/components/SmartPartEditor";
import { validateSpjParts } from "@/lib/engines/spjValidation";
import { getSupabaseBrowserClient } from "@/lib/services/supabaseBrowser";
import type {
  BkuMetadata,
  BkuTransaction,
  SchoolProfile,
  SpjPart,
} from "@/lib/types/lpj";
import { useAuthSession } from "@/components/SessionProvider";

type DashboardTab = "generator" | "converter";

interface ParseResponse {
  metadata: BkuMetadata;
  transactions: BkuTransaction[];
  parts: SpjPart[];
  error?: string;
}

interface GeneratedFile {
  fileName: string;
  docxUrl: string;
  pdfUrl: string;
  docxDownloadUrl: string;
  pdfDownloadUrl: string;
}

interface GenerationResponse {
  success: boolean;
  bundlePdfUrl: string;
  bundlePdfDownloadUrl: string;
  folderUrl: string;
  pdfBase64: string;
  files: GeneratedFile[];
  error?: string;
}

interface ConversionResponse {
  success: boolean;
  sourceUrl: string;
  pdfUrl: string;
  pdfDownloadUrl: string;
  folderUrl: string;
  pdfBase64: string;
  error?: string;
}

interface QuickSchoolDraft {
  nama_sekolah: string;
  npsn: string;
  alamat_dusun_desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  nama_kepsek: string;
  no_hp: string;
}

const blankQuickSchool = (): QuickSchoolDraft => ({
  nama_sekolah: "",
  npsn: "",
  alamat_dusun_desa: "",
  kecamatan: "",
  kabupaten: "",
  provinsi: "",
  nama_kepsek: "",
  no_hp: "",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function responseJson<T extends { error?: string }>(
  response: Response,
): Promise<T> {
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("Respons server tidak valid.");
  }
  const result = payload as T;
  if (!response.ok) {
    throw new Error(result.error || `Permintaan gagal (HTTP ${response.status}).`);
  }
  return result;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

interface PdfPreviewState {
  source: string;
  url?: string;
  error?: string;
}

function usePdfObjectUrl(pdfBase64: string | null): PdfPreviewState | null {
  const [preview, setPreview] = useState<PdfPreviewState | null>(null);

  useEffect(() => {
    if (!pdfBase64) {
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    void Promise.resolve()
      .then(() => {
        const binary = window.atob(pdfBase64);
        const buffer = new ArrayBuffer(binary.length);
        const bytes = new Uint8Array(buffer);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        return URL.createObjectURL(
          new Blob([buffer], { type: "application/pdf" }),
        );
      })
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreview({ source: pdfBase64, url });
      })
      .catch((error: unknown) => {
        if (active) {
          setPreview({
            source: pdfBase64,
            error:
              error instanceof Error
                ? `Pratinjau PDF gagal disiapkan: ${error.message}`
                : "Pratinjau PDF gagal disiapkan.",
          });
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [pdfBase64]);

  return pdfBase64 && preview?.source === pdfBase64 ? preview : null;
}

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useAccessToken(): string {
  const { session } = useAuthSession();
  return session?.access_token ?? "";
}

function FileDropzone({
  accept,
  file,
  onSelect,
  onDropFile,
  onClear,
  label,
}: {
  accept: string;
  file: File | null;
  onSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onDropFile: (file: File) => void;
  onClear: () => void;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dropped = event.dataTransfer.files[0];
    if (dropped) {
      onDropFile(dropped);
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 border-dashed p-5 transition sm:p-7 ${
        file
          ? "border-emerald-300 bg-emerald-50/50"
          : "border-slate-300 bg-slate-50/70 hover:border-emerald-400 hover:bg-emerald-50/40"
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        accept={accept}
        className="hidden"
        onChange={onSelect}
        ref={inputRef}
        type="file"
      />
      {file ? (
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-emerald-800 shadow-sm">
              {file.name.toLowerCase().endsWith(".xlsx") ? (
                <FileSpreadsheet size={21} />
              ) : (
                <FileText size={21} />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
              <p className="mt-1 text-xs text-slate-500">{fileSize(file.size)}</p>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:flex-none"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              Ganti file
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              onClick={onClear}
              type="button"
            >
              Hapus
            </button>
          </div>
        </div>
      ) : (
        <button
          className="flex w-full flex-col items-center text-center"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-800 shadow-sm">
            <CloudUpload size={23} />
          </span>
          <span className="mt-3 text-sm font-semibold text-slate-800">{label}</span>
          <span className="mt-1 text-xs text-slate-500">Tarik file ke sini atau klik untuk memilih · Maks. 4 MiB</span>
        </button>
      )}
    </div>
  );
}

function StepHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-800 text-xs font-bold text-white">
        {number}
      </span>
      <div>
        <h2 className="font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const accessToken = useAccessToken();
  const [tab, setTab] = useState<DashboardTab>("generator");
  const [profiles, setProfiles] = useState<SchoolProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [quickSchool, setQuickSchool] = useState<QuickSchoolDraft>(blankQuickSchool);
  const [quickSchoolOpen, setQuickSchoolOpen] = useState(false);
  const [quickSchoolSaving, setQuickSchoolSaving] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<BkuMetadata | null>(null);
  const [transactions, setTransactions] = useState<BkuTransaction[]>([]);
  const [parts, setParts] = useState<SpjPart[]>([]);
  const [period, setPeriod] = useState("");
  const [year, setYear] = useState("");
  const [coverTitle, setCoverTitle] = useState("LAPORAN PERTANGGUNGJAWABAN DAN SPJ PAUD");
  const [reportNumber, setReportNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [letterPlace, setLetterPlace] = useState("");
  const [letterDate, setLetterDate] = useState("");
  const [backgroundNarrative, setBackgroundNarrative] = useState("");
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [generatorNotice, setGeneratorNotice] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResponse | null>(null);

  const [converterFile, setConverterFile] = useState<File | null>(null);
  const [converterYear, setConverterYear] = useState("");
  const [converterPeriod, setConverterPeriod] = useState("");
  const [converting, setConverting] = useState(false);
  const [converterError, setConverterError] = useState<string | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResponse | null>(null);

  const selectedSchool = useMemo(
    () => profiles.find((profile) => profile.id === selectedSchoolId) ?? null,
    [profiles, selectedSchoolId],
  );
  const partIssues = useMemo(() => validateSpjParts(parts), [parts]);
  const generationPdf = usePdfObjectUrl(generationResult?.pdfBase64 ?? null);
  const conversionPdf = usePdfObjectUrl(conversionResult?.pdfBase64 ?? null);

  const loadProfiles = useCallback(async () => {
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("school_profiles")
        .select("*")
        .order("nama_sekolah");
      if (error) {
        throw error;
      }
      setProfileError(null);
      setProfiles(data);
      setSelectedSchoolId((current) =>
        data.some((profile) => profile.id === current)
          ? current
          : data[0]?.id ?? "",
      );
    } catch (loadError) {
      setProfileError(
        loadError instanceof Error ? loadError.message : "Profil sekolah tidak dapat dimuat.",
      );
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadProfiles());
  }, [loadProfiles]);

  function selectBkuFile(nextFile: File | null) {
    setFile(nextFile);
    setMetadata(null);
    setTransactions([]);
    setParts([]);
    setGenerationResult(null);
    setGeneratorError(null);
    setGeneratorNotice(null);
  }

  async function parseBku() {
    if (!file) {
      setGeneratorError("Pilih file BKU PDF atau XLSX terlebih dahulu.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setGeneratorError("Ukuran file BKU melebihi batas 4 MiB.");
      return;
    }
    setParsing(true);
    setGeneratorError(null);
    setGeneratorNotice(null);
    setGenerationResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/bku/parse", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const result = await responseJson<ParseResponse>(response);
      setMetadata(result.metadata);
      setTransactions(result.transactions);
      setParts(result.parts);
      const nextPeriod = [result.metadata.bulan, result.metadata.tahun]
        .filter(Boolean)
        .join(" ");
      setPeriod(nextPeriod);
      setYear(result.metadata.tahun ? String(result.metadata.tahun) : "");
      setLetterPlace(result.metadata.kabupaten ?? selectedSchool?.kabupaten ?? "");
      setGeneratorNotice(
        `${result.transactions.length} transaksi diperiksa dan ${result.parts.length} Part disiapkan.`,
      );
    } catch (parseError) {
      setGeneratorError(
        parseError instanceof Error ? parseError.message : "File BKU tidak dapat diproses.",
      );
    } finally {
      setParsing(false);
    }
  }

  async function createQuickSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quickSchool.nama_sekolah.trim()) {
      setProfileError("Nama sekolah wajib diisi.");
      return;
    }
    setQuickSchoolSaving(true);
    setProfileError(null);
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("school_profiles")
        .insert({
          nama_sekolah: quickSchool.nama_sekolah.trim(),
          npsn: quickSchool.npsn.trim() || null,
          alamat_dusun_desa: quickSchool.alamat_dusun_desa.trim() || null,
          kecamatan: quickSchool.kecamatan.trim() || null,
          kabupaten: quickSchool.kabupaten.trim() || null,
          provinsi: quickSchool.provinsi.trim() || null,
          email: null,
          no_hp: quickSchool.no_hp.trim() || null,
          nama_kepsek: quickSchool.nama_kepsek.trim() || null,
          jabatan_kepsek: "Kepala Sekolah",
          nama_bendahara: null,
          jumlah_siswa_l: 0,
          jumlah_siswa_p: 0,
          lama_berdiri: null,
          gdrive_folder_id: null,
        })
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      setProfiles((current) =>
        [...current, data].sort((left, right) =>
          left.nama_sekolah.localeCompare(right.nama_sekolah),
        ),
      );
      setSelectedSchoolId(data.id);
      setQuickSchool(blankQuickSchool());
      setQuickSchoolOpen(false);
    } catch (saveError) {
      setProfileError(
        saveError instanceof Error ? saveError.message : "Profil sekolah baru gagal disimpan.",
      );
    } finally {
      setQuickSchoolSaving(false);
    }
  }

  async function generateDocuments() {
    if (!selectedSchool || !metadata || parts.length === 0) {
      setGeneratorError("Pilih profil sekolah dan parse BKU sebelum membuat dokumen.");
      return;
    }
    if (!/^\d{4}$/.test(year.trim()) || !period.trim()) {
      setGeneratorError("Tahun anggaran dan periode BKU wajib diisi.");
      return;
    }
    if (partIssues.length > 0) {
      setGeneratorError("Selesaikan validasi Part sebelum melakukan generate.");
      return;
    }
    setGenerating(true);
    setGeneratorError(null);
    setGeneratorNotice(null);
    setGenerationResult(null);
    try {
      const response = await fetch("/api/spj/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          schoolProfile: selectedSchool,
          metadata,
          parts,
          tahunAnggaran: Number(year),
          periodeBku: period,
          judulDokumen: coverTitle,
          nomorSurat: reportNumber,
          namaBank: bankName,
          tanggalTerima: receivedDate,
          tempatSurat: letterPlace,
          tanggalSurat: letterDate,
          latarBelakangNarasi: backgroundNarrative,
        }),
      });
      const result = await responseJson<GenerationResponse>(response);
      setGenerationResult(result);
      setGeneratorNotice("Empat dokumen berhasil dibuat, dikonversi, dan disinkronkan ke Drive.");
    } catch (generateError) {
      setGeneratorError(
        generateError instanceof Error
          ? generateError.message
          : "Dokumen tidak dapat dibuat.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function convertFile() {
    if (!converterFile) {
      setConverterError("Pilih file DOCX atau XLSX terlebih dahulu.");
      return;
    }
    if (!selectedSchool) {
      setConverterError("Pilih profil sekolah sebagai tujuan penyimpanan Drive.");
      return;
    }
    if (!/^\d{4}$/.test(converterYear.trim()) || !converterPeriod.trim()) {
      setConverterError("Tahun dan periode folder tujuan wajib diisi.");
      return;
    }
    if (converterFile.size > 4 * 1024 * 1024) {
      setConverterError("Ukuran file melebihi batas 4 MiB.");
      return;
    }
    setConverting(true);
    setConverterError(null);
    setConversionResult(null);
    try {
      const formData = new FormData();
      formData.append("file", converterFile);
      formData.append("school_id", selectedSchool.id);
      formData.append("tahun", converterYear);
      formData.append("periode", converterPeriod);
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const result = await responseJson<ConversionResponse>(response);
      setConversionResult(result);
    } catch (convertError) {
      setConverterError(
        convertError instanceof Error ? convertError.message : "Konversi tidak berhasil.",
      );
    } finally {
      setConverting(false);
    }
  }

  function handleBkuChange(event: ChangeEvent<HTMLInputElement>) {
    selectBkuFile(event.target.files?.[0] ?? null);
  }

  function handleConverterChange(event: ChangeEvent<HTMLInputElement>) {
    setConverterFile(event.target.files?.[0] ?? null);
    setConversionResult(null);
    setConverterError(null);
  }

  function handleConverterDrop(nextFile: File) {
    setConverterFile(nextFile);
    setConversionResult(null);
    setConverterError(null);
  }

  const summaryTotal =
    metadata?.total_pengeluaran ??
    parts.reduce((total, part) => total + part.total_part, 0);

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#173b2a] px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <div className="absolute -right-14 -top-32 h-80 w-80 rounded-full border border-white/10" />
        <div className="absolute -bottom-48 right-40 h-80 w-80 rounded-full border border-white/10" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
              <ShieldCheck size={14} />
              Data terlindungi · pemrosesan deterministik
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Administrasi PAUD, lebih rapi dan siap dipertanggungjawabkan.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-emerald-50/75">
              Olah BKU, tinjau setiap Part, lalu susun bundel LPJ &amp; SPJ untuk disimpan di Google Drive.
            </p>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-xs text-emerald-50">
            <Sparkles size={16} className="text-emerald-200" />
            Tidak menggunakan API AI saat runtime
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <button
          aria-selected={tab === "generator"}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            tab === "generator"
              ? "border-emerald-800 text-emerald-900"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
          onClick={() => setTab("generator")}
          role="tab"
          type="button"
        >
          <FileCheck2 size={17} />
          Smart LPJ &amp; SPJ Generator
        </button>
        <button
          aria-selected={tab === "converter"}
          className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            tab === "converter"
              ? "border-emerald-800 text-emerald-900"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
          onClick={() => setTab("converter")}
          role="tab"
          type="button"
        >
          <FileSpreadsheet size={17} />
          Precision File Converter
        </button>
      </div>

      {tab === "generator" ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="min-w-0 space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <StepHeading
                number="1"
                title="Pilih sekolah & periode"
                description="Data profil akan digunakan di kop surat, cover, tanda tangan, dan folder Drive."
              />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">Profil sekolah</span>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                    disabled={profilesLoading}
                    onChange={(event) => setSelectedSchoolId(event.target.value)}
                    value={selectedSchoolId}
                  >
                    <option value="">
                      {profilesLoading ? "Memuat profil..." : "Pilih sekolah"}
                    </option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.nama_sekolah}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tahun anggaran</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                      inputMode="numeric"
                      onChange={(event) => setYear(event.target.value)}
                      placeholder="2026"
                      value={year}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">Periode BKU</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                      onChange={(event) => setPeriod(event.target.value)}
                      placeholder="Januari 2026"
                      value={period}
                    />
                  </label>
                </div>
              </div>

              {selectedSchool ? (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-emerald-50/80 px-4 py-3 text-xs text-emerald-950">
                  <span className="font-semibold">{selectedSchool.nama_sekolah}</span>
                  <span>NPSN {selectedSchool.npsn || "—"}</span>
                  <span>
                    {selectedSchool.jumlah_siswa_l + selectedSchool.jumlah_siswa_p} peserta didik
                  </span>
                  <Link
                    className="inline-flex items-center gap-1 font-semibold text-emerald-800 hover:underline"
                    href="/dashboard/profiles"
                  >
                    Edit profil lengkap <ArrowUpRight size={13} />
                  </Link>
                </div>
              ) : null}
              {profileError ? (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {profileError}
                </p>
              ) : null}

              <details
                className="mt-4 rounded-xl border border-dashed border-slate-300"
                onToggle={(event) => setQuickSchoolOpen(event.currentTarget.open)}
                open={quickSchoolOpen}
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-emerald-800">
                  <Plus size={15} />
                  Tambah sekolah cepat
                </summary>
                <form
                  className="grid gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4"
                  onSubmit={createQuickSchool}
                >
                  {(
                    [
                      ["nama_sekolah", "Nama sekolah *"],
                      ["npsn", "NPSN"],
                      ["alamat_dusun_desa", "Dusun / desa"],
                      ["kecamatan", "Kecamatan"],
                      ["kabupaten", "Kabupaten"],
                      ["provinsi", "Provinsi"],
                      ["nama_kepsek", "Kepala sekolah"],
                      ["no_hp", "No. HP"],
                    ] as const
                  ).map(([key, label]) => (
                    <label className="block" key={key}>
                      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
                      <input
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-emerald-600"
                        onChange={(event) =>
                          setQuickSchool((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        value={quickSchool[key]}
                      />
                    </label>
                  ))}
                  <div className="flex items-end sm:col-span-2 lg:col-span-4">
                    <button
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-3.5 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
                      disabled={quickSchoolSaving}
                      type="submit"
                    >
                      {quickSchoolSaving ? <LoaderCircle className="animate-spin" size={14} /> : <Plus size={14} />}
                      Simpan dan pilih sekolah
                    </button>
                  </div>
                </form>
              </details>

              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">
                  Edit cepat cover, surat, dan narasi
                </summary>
                <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">Judul cover</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"
                      onChange={(event) => setCoverTitle(event.target.value)}
                      value={coverTitle}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">Nomor surat BOP</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"
                      onChange={(event) => setReportNumber(event.target.value)}
                      placeholder="Contoh: 01/PAUD/2026"
                      value={reportNumber}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">Nama bank</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"
                      onChange={(event) => setBankName(event.target.value)}
                      placeholder="Contoh: Bank BRI"
                      value={bankName}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">Tanggal penerimaan</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"
                      onChange={(event) => setReceivedDate(event.target.value)}
                      placeholder="Contoh: 10 Januari 2026"
                      value={receivedDate}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">Tempat surat</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"
                      onChange={(event) => setLetterPlace(event.target.value)}
                      value={letterPlace}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">Tanggal surat</span>
                    <input
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs"
                      onChange={(event) => setLetterDate(event.target.value)}
                      placeholder="Contoh: 31 Januari 2026"
                      value={letterDate}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-500">
                      Narasi latar belakang (kosongkan untuk narasi standar)
                    </span>
                    <textarea
                      className="min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5"
                      onChange={(event) => setBackgroundNarrative(event.target.value)}
                      value={backgroundNarrative}
                    />
                  </label>
                </div>
              </details>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <StepHeading
                number="2"
                title="Unggah file BKU"
                description="File diproses lokal di server dengan parser PDF/XLSX dan aturan klasifikasi deterministik."
              />
              <FileDropzone
                accept=".pdf,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                file={file}
                label="Tarik file BKU .pdf atau .xlsx ke area ini"
                onClear={() => selectBkuFile(null)}
                onDropFile={selectBkuFile}
                onSelect={handleBkuChange}
              />
              <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <p className="text-xs text-slate-500">
                  File harus memuat tanggal, uraian, dan kolom pengeluaran.
                </p>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!file || parsing}
                  onClick={parseBku}
                  type="button"
                >
                  {parsing ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />}
                  {parsing ? "Memeriksa BKU..." : "Parse BKU"}
                </button>
              </div>
              {metadata ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    ["Sekolah dari BKU", metadata.nama_sekolah || "—"],
                    ["Periode", [metadata.bulan, metadata.tahun].filter(Boolean).join(" ") || "—"],
                    ["Penerimaan", formatCurrency(metadata.total_penerimaan)],
                    ["Pengeluaran", formatCurrency(metadata.total_pengeluaran)],
                  ].map(([label, value]) => (
                    <div className="rounded-xl bg-slate-50 px-3.5 py-3" key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <StepHeading
                number="3"
                title="Tinjau dan edit Part"
                description="Penjual dari Master Penjual diisi otomatis berdasarkan kategori; Anda tetap dapat mengubahnya."
              />
              <SmartPartEditor parts={parts} onChange={setParts} disabled={generating} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <StepHeading
                number="4"
                title="Generate, preview & sinkronkan"
                description="Empat DOCX diisi, diekspor ke PDF native melalui Google Drive, lalu digabung menjadi satu bundel."
              />
              {generatorError ? (
                <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {generatorError}
                </p>
              ) : null}
              {generatorNotice ? (
                <p className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <CheckCircle2 size={16} />
                  {generatorNotice}
                </p>
              ) : null}
              <div className="flex flex-col justify-between gap-4 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedSchool?.nama_sekolah || "Pilih profil sekolah"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {parts.length} Part · {formatCurrency(summaryTotal)} total pengeluaran
                  </p>
                </div>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!selectedSchool || !metadata || parts.length === 0 || partIssues.length > 0 || generating}
                  onClick={generateDocuments}
                  type="button"
                >
                  {generating ? <LoaderCircle className="animate-spin" size={17} /> : <Sparkles size={17} />}
                  {generating ? "Membuat bundel..." : "Generate Bundel LPJ & SPJ"}
                </button>
              </div>
              {generationResult ? (
                <div className="mt-5 space-y-4">
                  <div className="flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-800">
                        <FolderOpen size={19} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-emerald-950">Bundel siap dicetak</p>
                        <a
                          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:underline"
                          href={generationResult.folderUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Buka folder Google Drive <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                    <a
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-900"
                      href={generationResult.bundlePdfDownloadUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Download size={15} />
                      Unduh PDF bundel
                    </a>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {generationResult.files.map((generatedFile) => (
                      <div
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3"
                        key={generatedFile.fileName}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {generatedFile.fileName}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">DOCX + PDF</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <a
                            aria-label={`Unduh ${generatedFile.fileName}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800"
                            href={generatedFile.docxDownloadUrl}
                            rel="noreferrer"
                            target="_blank"
                            title="Unduh DOCX"
                          >
                            <Download size={15} />
                          </a>
                          <a
                            aria-label={`Buka PDF ${generatedFile.fileName}`}
                            className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800"
                            href={generatedFile.pdfUrl}
                            rel="noreferrer"
                            target="_blank"
                            title="Buka PDF"
                          >
                            <ExternalLink size={15} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <ReceiptText size={16} className="text-emerald-800" />
                  Live PDF Preview
                </p>
                {generationResult ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
                    Siap
                  </span>
                ) : null}
              </div>
              {generationResult ? (
                <>
                  {generationPdf?.url ? (
                    <iframe
                      className="h-[64vh] min-h-[420px] max-h-[840px] w-full bg-slate-100"
                      src={generationPdf.url}
                      title="Pratinjau bundel LPJ dan SPJ"
                    />
                  ) : (
                    <div
                      aria-live="polite"
                      className="grid h-[420px] place-items-center bg-slate-50 p-6 text-center text-sm text-slate-500"
                    >
                      {generationPdf?.error ?? "Menyiapkan pratinjau PDF..."}
                    </div>
                  )}
                  <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
                    <a
                      aria-disabled={!generationPdf?.url}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold ${
                        generationPdf?.url
                          ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                          : "pointer-events-none border-slate-100 text-slate-400"
                      }`}
                      href={generationPdf?.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={14} />
                      Buka PDF di Tab Baru
                    </a>
                    <a
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-900"
                      href={generationResult.bundlePdfDownloadUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Download size={14} />
                      Download PDF
                    </a>
                  </div>
                </>
              ) : (
                <div className="grid min-h-[420px] place-items-center bg-slate-50 p-6 text-center">
                  <div className="max-w-xs">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-800 shadow-sm">
                      <FileCheck2 size={22} />
                    </span>
                    <p className="mt-4 text-sm font-semibold text-slate-800">
                      Pratinjau bundel akan tampil di sini
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Unggah dan periksa BKU, lalu generate dokumen untuk melihat PDF.
                    </p>
                  </div>
                </div>
              )}
            </section>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ringkasan BKU</p>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                {formatCurrency(summaryTotal)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Total pengeluaran terdeteksi</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Transaksi</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-950">{transactions.length}</p>
                </div>
                <div className="rounded-xl bg-sky-50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">Part</p>
                  <p className="mt-1 text-lg font-semibold text-sky-950">{parts.length}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-900/10 bg-[#eaf2ec] p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                <ShieldCheck size={17} />
                Aturan bisnis aktif
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-emerald-950/75">
                <li>• Barang dipaketkan maksimal Rp 1.000.000 per Part.</li>
                <li>• Honor guru di atas batas tetap utuh.</li>
                <li>• Tagihan identik dialokasikan per bulan.</li>
                <li>• Part barang 3 halaman; utilitas/honor kuitansi saja.</li>
              </ul>
            </div>
            <Link
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:text-emerald-900"
              href="/dashboard/profiles"
            >
              Kelola profil &amp; penjual
              <ArrowUpRight size={16} />
            </Link>
          </aside>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <p className="text-sm font-semibold text-emerald-700">Precision Converter</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                Konversi DOCX / XLSX ke PDF
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Konversi memakai Google Drive Native Export API. Lembar Excel disetel fit-to-page width sebelum diunggah.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block sm:col-span-1">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Folder sekolah</span>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                  disabled={profilesLoading}
                  onChange={(event) => setSelectedSchoolId(event.target.value)}
                  value={selectedSchoolId}
                >
                  <option value="">Pilih sekolah</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.nama_sekolah}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tahun</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-600"
                  onChange={(event) => setConverterYear(event.target.value)}
                  placeholder="2026"
                  value={converterYear}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Periode folder</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-emerald-600"
                  onChange={(event) => setConverterPeriod(event.target.value)}
                  placeholder="Januari"
                  value={converterPeriod}
                />
              </label>
            </div>

            <div className="mt-5">
              <FileDropzone
                accept=".docx,.xlsx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                file={converterFile}
                label="Tarik file DOCX atau XLSX ke area ini"
                onClear={() => setConverterFile(null)}
                onDropFile={handleConverterDrop}
                onSelect={handleConverterChange}
              />
            </div>
            {converterError ? (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {converterError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-xs text-slate-500">
                Tujuan: Drive / LPJ_PAUD_AUTOMATION / sekolah / tahun / periode
              </p>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!converterFile || !selectedSchool || converting}
                onClick={convertFile}
                type="button"
              >
                {converting ? <LoaderCircle className="animate-spin" size={16} /> : <FileSpreadsheet size={16} />}
                {converting ? "Mengonversi..." : "Konversi ke PDF"}
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-24">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <ReceiptText size={16} className="text-emerald-800" />
                  Live PDF Preview
                </h3>
                {conversionResult ? (
                  <p className="mt-1 text-[11px] text-slate-500">PDF berhasil dibuat</p>
                ) : null}
              </div>
              {conversionResult ? (
                <a
                  className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:underline"
                  href={conversionResult.folderUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <FolderOpen size={14} />
                  Folder Drive
                </a>
              ) : null}
            </div>
            {conversionResult ? (
              <>
                {conversionPdf?.url ? (
                  <iframe
                    className="h-[64vh] min-h-[420px] max-h-[840px] w-full bg-slate-100"
                    src={conversionPdf.url}
                    title="Pratinjau hasil konversi PDF"
                  />
                ) : (
                  <div
                    aria-live="polite"
                    className="grid h-[420px] place-items-center bg-slate-50 p-6 text-center text-sm text-slate-500"
                  >
                    {conversionPdf?.error ?? "Menyiapkan pratinjau PDF..."}
                  </div>
                )}
                <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
                  <a
                    aria-disabled={!conversionPdf?.url}
                    className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-semibold ${
                      conversionPdf?.url
                        ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                        : "pointer-events-none border-slate-100 text-slate-400"
                    }`}
                    href={conversionPdf?.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink size={14} />
                    Buka PDF di Tab Baru
                  </a>
                  <a
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-800 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-900"
                    href={conversionResult.pdfDownloadUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <Download size={14} />
                    Download PDF
                  </a>
                </div>
                <div className="flex flex-wrap gap-4 border-t border-slate-100 px-4 py-3 text-xs">
                  <a
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-emerald-800"
                    href={conversionResult.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Buka file sumber <ExternalLink size={12} />
                  </a>
                  <a
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-emerald-800"
                    href={conversionResult.pdfUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Buka PDF di Drive <ExternalLink size={12} />
                  </a>
                </div>
              </>
            ) : (
              <div className="grid min-h-[420px] place-items-center bg-slate-50 p-6 text-center">
                <div className="max-w-xs">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-emerald-800 shadow-sm">
                    <FileSpreadsheet size={22} />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-800">
                    Pratinjau PDF akan tampil di sini
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Pilih dokumen Word atau Excel dan mulai konversi.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
