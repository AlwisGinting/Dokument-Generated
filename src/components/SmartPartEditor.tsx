"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  FileCheck2,
  FileText,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";
import type { BkuCategory, SpjItem, SpjPart } from "@/lib/types/lpj";
import {
  MAX_PART_TOTAL,
  validateSpjParts,
} from "@/lib/engines/spjValidation";

export { MAX_PART_TOTAL, validateSpjParts };

interface SmartPartEditorProps {
  parts: SpjPart[];
  onChange: (parts: SpjPart[]) => void;
  onAddManualPart: (category: BkuCategory) => void;
  disabled?: boolean;
}

function sumItems(items: readonly SpjItem[]): number {
  return Math.round(
    items.reduce((total, item) => total + item.jumlah_harga, 0) * 100,
  ) / 100;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function renumber(items: SpjItem[]): SpjItem[] {
  return items.map((item, index) => ({ ...item, no: index + 1 }));
}

export default function SmartPartEditor({
  parts,
  onChange,
  onAddManualPart,
  disabled = false,
}: SmartPartEditorProps) {
  const [moveTargets, setMoveTargets] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [manualCategory, setManualCategory] =
    useState<BkuCategory>("BELANJA_BARANG");

  const issues = useMemo(() => validateSpjParts(parts), [parts]);

  function updatePart(index: number, patch: Partial<SpjPart>) {
    onChange(parts.map((part, partIndex) => (partIndex === index ? { ...part, ...patch } : part)));
  }

  function updateItem(
    partIndex: number,
    itemIndex: number,
    patch: Partial<SpjItem>,
  ) {
    const currentPart = parts[partIndex];
    if (!currentPart) {
      return;
    }
    const items = currentPart.items.map((item, index) =>
      index === itemIndex ? { ...item, ...patch } : item,
    );
    onChange(
      parts.map((part, index) =>
        index === partIndex
          ? { ...part, items, total_part: sumItems(items) }
          : part,
      ),
    );
  }

  function addItem(partIndex: number) {
    const part = parts[partIndex];
    if (!part) {
      return;
    }
    setError(null);
    const items = renumber([
      ...part.items,
      {
        no: part.items.length + 1,
        nama_barang: "",
        diantar: part.tanggal_transaksi,
        banyaknya: "1",
        harga_satuan: 0,
        jumlah_harga: 0,
      },
    ]);
    updatePart(partIndex, { items, total_part: sumItems(items) });
  }

  function deleteItem(partIndex: number, itemIndex: number) {
    const part = parts[partIndex];
    if (!part) {
      return;
    }
    const items = renumber(part.items.filter((_, index) => index !== itemIndex));
    updatePart(partIndex, { items, total_part: sumItems(items) });
  }

  function splitItem(partIndex: number, itemIndex: number) {
    const part = parts[partIndex];
    const item = part?.items[itemIndex];
    if (!part || !item) {
      return;
    }
    const cents = Math.round(item.jumlah_harga * 100);
    if (cents < 2) {
      setError("Nominal harus minimal Rp 0,02 agar dapat dibagi menjadi dua rincian.");
      return;
    }
    setError(null);
    const firstAmount = Math.floor(cents / 2) / 100;
    const secondAmount = (cents - Math.floor(cents / 2)) / 100;
    const first: SpjItem = {
      ...item,
      banyaknya: "Bagian 1",
      harga_satuan: firstAmount,
      jumlah_harga: firstAmount,
    };
    const second: SpjItem = {
      ...item,
      no: item.no + 1,
      nama_barang: item.nama_barang ? `${item.nama_barang} (bagian 2)` : "",
      banyaknya: "Bagian 2",
      harga_satuan: secondAmount,
      jumlah_harga: secondAmount,
    };
    const items = renumber([
      ...part.items.slice(0, itemIndex),
      first,
      second,
      ...part.items.slice(itemIndex + 1),
    ]);
    updatePart(partIndex, { items, total_part: sumItems(items) });
  }

  function moveItem(sourceIndex: number, itemIndex: number) {
    const targetIndex = moveTargets[sourceIndex];
    const source = parts[sourceIndex];
    const target = parts[targetIndex];
    const item = source?.items[itemIndex];
    if (!source || !target || !item || !target.is_barang) {
      setError("Pilih Part belanja barang tujuan yang valid.");
      return;
    }
    const nextTargetTotal = sumItems(target.items) + item.jumlah_harga;
    if (nextTargetTotal > MAX_PART_TOTAL) {
      setError(
        `Item tidak dipindahkan: total Part tujuan akan menjadi ${formatCurrency(nextTargetTotal)}.`,
      );
      return;
    }
    setError(null);
    const sourceItems = renumber(source.items.filter((_, index) => index !== itemIndex));
    const targetItems = renumber([...target.items, item]);
    onChange(
      parts.map((part, index) => {
        if (index === sourceIndex) {
          return { ...part, items: sourceItems, total_part: sumItems(sourceItems) };
        }
        if (index === targetIndex) {
          return { ...part, items: targetItems, total_part: sumItems(targetItems) };
        }
        return part;
      }),
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">
            Smart Part Editor
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Tinjau alokasi bulan, penjual, dan rincian sebelum dokumen dibuat.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <p className="text-xs font-medium text-slate-500">
            {parts.length} Part · batas belanja barang Rp 1.000.000 / Part
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Jenis Part manual"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:flex-none"
              disabled={disabled}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === "BELANJA_BARANG" ||
                  value === "UTILITAS" ||
                  value === "HONOR_GURU"
                ) {
                  setManualCategory(value);
                }
              }}
              value={manualCategory}
            >
              <option value="BELANJA_BARANG">Belanja barang</option>
              <option value="UTILITAS">Utilitas</option>
              <option value="HONOR_GURU">Honor guru</option>
            </select>
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={disabled}
              onClick={() => onAddManualPart(manualCategory)}
              type="button"
            >
              + Tambah Transaksi / Part Manual
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {issues.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Periksa validasi rincian:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {parts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Belum ada Part. Parse BKU atau tambahkan transaksi manual.
        </div>
      ) : (
        <div className="space-y-3">
          {parts.map((part, partIndex) => {
            const calculatedTotal = part.is_barang ? sumItems(part.items) : part.total_part;
            const overLimit = part.is_barang && calculatedTotal > MAX_PART_TOTAL;
            return (
              <article
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  overLimit ? "border-rose-300" : "border-slate-200"
                }`}
                key={part.id}
              >
                <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex items-start gap-3">
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        part.is_barang
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-sky-100 text-sky-800"
                      }`}
                    >
                      {part.is_barang ? <FileCheck2 size={19} /> : <FileText size={19} />}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-950">{part.kode_part}</h3>
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            part.is_barang
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-sky-100 text-sky-800"
                          }`}
                        >
                          {part.is_barang ? "3 halaman · barang" : "1 halaman · kuitansi"}
                        </span>
                        {part.kategori_toko ? (
                          <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {part.kategori_toko}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">{part.uraian_singkat}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
                      Bulan alokasi
                      <input
                        className="w-32 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-600"
                        disabled={disabled}
                        onChange={(event) =>
                          updatePart(partIndex, { bulan_alokasi: event.target.value })
                        }
                        value={part.bulan_alokasi}
                      />
                    </label>
                    <strong className={`whitespace-nowrap text-sm ${overLimit ? "text-rose-700" : "text-slate-900"}`}>
                      {formatCurrency(calculatedTotal)}
                    </strong>
                  </div>
                </div>

                <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 sm:p-5">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">Nama penjual</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                      disabled={disabled}
                      onChange={(event) =>
                        updatePart(partIndex, { nama_penjual: event.target.value })
                      }
                      placeholder="Pilih dari master penjual atau isi manual"
                      value={part.nama_penjual}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">Alamat penjual</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                      disabled={disabled}
                      onChange={(event) =>
                        updatePart(partIndex, { alamat_penjual: event.target.value })
                      }
                      placeholder="Alamat toko / rekanan"
                      value={part.alamat_penjual}
                    />
                  </label>
                </div>

                {part.is_barang ? (
                  <div className="p-4 sm:p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Rincian barang</h4>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Total Part dihitung otomatis dari jumlah harga setiap item.
                        </p>
                      </div>
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                        disabled={disabled}
                        onClick={() => addItem(partIndex)}
                        type="button"
                      >
                        <Plus size={14} />
                        Tambah item
                      </button>
                    </div>

                    <div className="space-y-3">
                      {part.items.map((item, itemIndex) => (
                        <div
                          className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 lg:grid-cols-[minmax(160px,1.5fr)_minmax(100px,0.8fr)_100px_130px_130px_auto]"
                          key={`${part.id}-${itemIndex}`}
                        >
                          <label>
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Nama barang
                            </span>
                            <input
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-emerald-600"
                              disabled={disabled}
                              onChange={(event) =>
                                updateItem(partIndex, itemIndex, {
                                  nama_barang: event.target.value,
                                })
                              }
                              value={item.nama_barang}
                            />
                          </label>
                          <label>
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Banyaknya
                            </span>
                            <input
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-emerald-600"
                              disabled={disabled}
                              onChange={(event) =>
                                updateItem(partIndex, itemIndex, {
                                  banyaknya: event.target.value,
                                })
                              }
                              value={item.banyaknya}
                            />
                          </label>
                          <label>
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Diantar
                            </span>
                            <input
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-emerald-600"
                              disabled={disabled}
                              onChange={(event) =>
                                updateItem(partIndex, itemIndex, { diantar: event.target.value })
                              }
                              value={item.diantar}
                            />
                          </label>
                          <label>
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Harga satuan
                            </span>
                            <input
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-emerald-600"
                              disabled={disabled}
                              min="0"
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                updateItem(partIndex, itemIndex, {
                                  harga_satuan: Number.isFinite(value) ? value : 0,
                                });
                              }}
                              type="number"
                              value={item.harga_satuan}
                            />
                          </label>
                          <label>
                            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Jumlah harga
                            </span>
                            <input
                              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-emerald-600"
                              disabled={disabled}
                              min="0"
                              onChange={(event) => {
                                const value = Number(event.target.value);
                                updateItem(partIndex, itemIndex, {
                                  harga_satuan: Number.isFinite(value) ? value : 0,
                                  jumlah_harga: Number.isFinite(value) ? value : 0,
                                });
                              }}
                              type="number"
                              value={item.jumlah_harga}
                            />
                          </label>
                          <div className="flex items-end gap-1">
                            <button
                              aria-label="Pecah item menjadi dua"
                              className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-emerald-800 disabled:opacity-50"
                              disabled={disabled}
                              onClick={() => splitItem(partIndex, itemIndex)}
                              title="Pecah item menjadi dua dengan total tetap"
                              type="button"
                            >
                              <Scissors size={15} />
                            </button>
                            <button
                              aria-label="Hapus item"
                              className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-rose-700 disabled:opacity-50"
                              disabled={disabled}
                              onClick={() => deleteItem(partIndex, itemIndex)}
                              title="Hapus item"
                              type="button"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          {parts.filter(
                            (target, index) => target.is_barang && index !== partIndex,
                          ).length > 0 ? (
                            <div className="flex flex-wrap items-center gap-2 lg:col-span-full">
                              <ArrowRightLeft className="text-slate-400" size={14} />
                              <select
                                aria-label="Part tujuan"
                                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
                                disabled={disabled}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setMoveTargets((current) => {
                                    if (!value) {
                                      const next = { ...current };
                                      delete next[partIndex];
                                      return next;
                                    }
                                    return { ...current, [partIndex]: Number(value) };
                                  });
                                }}
                                value={moveTargets[partIndex] ?? ""}
                              >
                                <option value="">Pindahkan ke Part...</option>
                                {parts.map((target, targetIndex) =>
                                  target.is_barang && targetIndex !== partIndex ? (
                                    <option key={target.id} value={targetIndex}>
                                      {target.kode_part} · {formatCurrency(sumItems(target.items))}
                                    </option>
                                  ) : null,
                                )}
                              </select>
                              <button
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                disabled={disabled || moveTargets[partIndex] === undefined}
                                onClick={() => moveItem(partIndex, itemIndex)}
                                type="button"
                              >
                                Pindahkan
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-5">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Uraian transaksi
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                        disabled={disabled}
                        onChange={(event) =>
                          updatePart(partIndex, { uraian_singkat: event.target.value })
                        }
                        placeholder="Contoh: Tagihan listrik bulan Mei"
                        value={part.uraian_singkat}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Nominal (Rp)
                      </span>
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                        disabled={disabled}
                        min="0"
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          updatePart(partIndex, {
                            total_part: Number.isFinite(value) ? value : 0,
                          });
                        }}
                        step="1"
                        type="number"
                        value={part.total_part}
                      />
                    </label>
                    <p className="flex items-center gap-2 text-xs text-slate-500 sm:col-span-2">
                      <FileText size={15} className="shrink-0 text-sky-700" />
                      Kuitansi kosong · nominal tidak dipecah
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
