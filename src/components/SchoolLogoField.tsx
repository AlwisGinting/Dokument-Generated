"use client";

import Image from "next/image";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { convertSchoolLogoToPng } from "@/lib/utils/processSchoolLogo";

interface SchoolLogoFieldProps {
  logoDataUrl: string | null;
  onChange: (logoDataUrl: string | null) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
}

export default function SchoolLogoField({
  logoDataUrl,
  onChange,
  disabled = false,
  label = "Upload Logo Sekolah",
  description = "PNG atau JPG, otomatis dikonversi ke PNG (maks. 8 MiB).",
}: SchoolLogoFieldProps) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setProcessing(true);
    setError(null);
    try {
      onChange(await convertSchoolLogoToPng(file));
    } catch (logoError) {
      setError(
        logoError instanceof Error
          ? logoError.message
          : "Logo sekolah tidak dapat diproses.",
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
          {logoDataUrl ? (
            <Image
              alt="Pratinjau logo sekolah"
              className="h-full w-full object-contain"
              height={64}
              src={logoDataUrl}
              unoptimized
              width={64}
            />
          ) : (
            <ImagePlus aria-hidden="true" className="text-slate-400" size={22} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-700">{label}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-emerald-300 hover:text-emerald-800">
              {processing ? (
                <LoaderCircle className="animate-spin" size={13} />
              ) : (
                <ImagePlus size={13} />
              )}
              {processing ? "Memproses..." : logoDataUrl ? "Ganti logo" : "Pilih PNG/JPG"}
              <input
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                className="sr-only"
                disabled={disabled || processing}
                onChange={handleSelect}
                type="file"
              />
            </label>
            {logoDataUrl ? (
              <button
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                disabled={disabled || processing}
                onClick={() => {
                  setError(null);
                  onChange(null);
                }}
                type="button"
              >
                <Trash2 size={13} />
                Hapus logo
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {error ? (
        <p aria-live="polite" className="mt-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
