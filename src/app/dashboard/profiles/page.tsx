"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/services/supabaseBrowser";
import type { SchoolProfile, Vendor, VendorCategory } from "@/lib/types/lpj";

const vendorCategories: VendorCategory[] = ["ATK", "OBAT", "KONSUMSI", "CETAK", "UMUM"];

interface SchoolDraft {
  id: string;
  nama_sekolah: string;
  npsn: string;
  alamat_dusun_desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  email: string;
  no_hp: string;
  nama_kepsek: string;
  jabatan_kepsek: string;
  nama_bendahara: string;
  jumlah_siswa_l: string;
  jumlah_siswa_p: string;
  lama_berdiri: string;
  gdrive_folder_id: string;
}

interface VendorDraft {
  id: string;
  kategori_belanja: VendorCategory;
  nama_toko: string;
  nama_pemilik: string;
  alamat_toko: string;
}

const blankSchoolDraft = (): SchoolDraft => ({
  id: "",
  nama_sekolah: "",
  npsn: "",
  alamat_dusun_desa: "",
  kecamatan: "",
  kabupaten: "",
  provinsi: "",
  email: "",
  no_hp: "",
  nama_kepsek: "",
  jabatan_kepsek: "Kepala Sekolah",
  nama_bendahara: "",
  jumlah_siswa_l: "0",
  jumlah_siswa_p: "0",
  lama_berdiri: "",
  gdrive_folder_id: "",
});

const blankVendorDraft = (): VendorDraft => ({
  id: "",
  kategori_belanja: "ATK",
  nama_toko: "",
  nama_pemilik: "",
  alamat_toko: "",
});

const schoolFields: Array<{
  key: Exclude<keyof SchoolDraft, "id">;
  label: string;
  type?: "email" | "tel" | "number";
}> = [
  { key: "nama_sekolah", label: "Nama sekolah" },
  { key: "npsn", label: "NPSN" },
  { key: "alamat_dusun_desa", label: "Alamat dusun / desa" },
  { key: "kecamatan", label: "Kecamatan" },
  { key: "kabupaten", label: "Kabupaten" },
  { key: "provinsi", label: "Provinsi" },
  { key: "email", label: "Email", type: "email" },
  { key: "no_hp", label: "No. HP", type: "tel" },
  { key: "nama_kepsek", label: "Nama kepala sekolah / penyelenggara" },
  { key: "jabatan_kepsek", label: "Jabatan", },
  { key: "nama_bendahara", label: "Nama bendahara" },
  { key: "jumlah_siswa_l", label: "Jumlah siswa laki-laki", type: "number" },
  { key: "jumlah_siswa_p", label: "Jumlah siswa perempuan", type: "number" },
  { key: "lama_berdiri", label: "Lama berdiri (tahun)", type: "number" },
  { key: "gdrive_folder_id", label: "Folder ID Google Drive" },
];

function schoolToDraft(profile: SchoolProfile): SchoolDraft {
  return {
    id: profile.id,
    nama_sekolah: profile.nama_sekolah,
    npsn: profile.npsn ?? "",
    alamat_dusun_desa: profile.alamat_dusun_desa ?? "",
    kecamatan: profile.kecamatan ?? "",
    kabupaten: profile.kabupaten ?? "",
    provinsi: profile.provinsi ?? "",
    email: profile.email ?? "",
    no_hp: profile.no_hp ?? "",
    nama_kepsek: profile.nama_kepsek ?? "",
    jabatan_kepsek: profile.jabatan_kepsek ?? "Kepala Sekolah",
    nama_bendahara: profile.nama_bendahara ?? "",
    jumlah_siswa_l: String(profile.jumlah_siswa_l),
    jumlah_siswa_p: String(profile.jumlah_siswa_p),
    lama_berdiri: profile.lama_berdiri === null ? "" : String(profile.lama_berdiri),
    gdrive_folder_id: profile.gdrive_folder_id ?? "",
  };
}

function vendorToDraft(vendor: Vendor): VendorDraft {
  return {
    id: vendor.id,
    kategori_belanja: vendor.kategori_belanja,
    nama_toko: vendor.nama_toko,
    nama_pemilik: vendor.nama_pemilik ?? "",
    alamat_toko: vendor.alamat_toko ?? "",
  };
}

function nullable(value: string): string | null {
  const cleaned = value.trim();
  return cleaned || null;
}

function integerValue(value: string, label: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} harus berupa bilangan bulat nonnegatif.`);
  }
  return parsed;
}

function TextField({
  label,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <input
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<SchoolProfile[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [schoolDraft, setSchoolDraft] = useState<SchoolDraft>(blankSchoolDraft);
  const [vendorDraft, setVendorDraft] = useState<VendorDraft>(blankVendorDraft);
  const [loading, setLoading] = useState(true);
  const [savingSchool, setSavingSchool] = useState(false);
  const [savingVendor, setSavingVendor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const [schoolResult, vendorResult] = await Promise.all([
        supabase.from("school_profiles").select("*").order("nama_sekolah"),
        supabase.from("vendors").select("*").order("nama_toko"),
      ]);
      if (schoolResult.error) {
        throw schoolResult.error;
      }
      if (vendorResult.error) {
        throw vendorResult.error;
      }
      setError(null);
      setProfiles(schoolResult.data);
      setVendors(vendorResult.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Data tidak dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [loadData]);

  async function saveSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSchool(true);
    setError(null);
    setNotice(null);
    try {
      const jumlahSiswaL = integerValue(schoolDraft.jumlah_siswa_l, "Jumlah siswa laki-laki");
      const jumlahSiswaP = integerValue(schoolDraft.jumlah_siswa_p, "Jumlah siswa perempuan");
      if (jumlahSiswaL === null || jumlahSiswaP === null) {
        throw new Error("Jumlah siswa laki-laki dan perempuan wajib diisi.");
      }
      if (!schoolDraft.nama_sekolah.trim()) {
        throw new Error("Nama sekolah wajib diisi.");
      }

      const payload = {
        ...(schoolDraft.id ? { id: schoolDraft.id } : {}),
        nama_sekolah: schoolDraft.nama_sekolah.trim(),
        npsn: nullable(schoolDraft.npsn),
        alamat_dusun_desa: nullable(schoolDraft.alamat_dusun_desa),
        kecamatan: nullable(schoolDraft.kecamatan),
        kabupaten: nullable(schoolDraft.kabupaten),
        provinsi: nullable(schoolDraft.provinsi),
        email: nullable(schoolDraft.email),
        no_hp: nullable(schoolDraft.no_hp),
        nama_kepsek: nullable(schoolDraft.nama_kepsek),
        jabatan_kepsek: schoolDraft.jabatan_kepsek.trim() || "Kepala Sekolah",
        nama_bendahara: nullable(schoolDraft.nama_bendahara),
        jumlah_siswa_l: jumlahSiswaL,
        jumlah_siswa_p: jumlahSiswaP,
        lama_berdiri: integerValue(schoolDraft.lama_berdiri, "Lama berdiri"),
        gdrive_folder_id: nullable(schoolDraft.gdrive_folder_id),
      };
      const { error: saveError } = await getSupabaseBrowserClient()
        .from("school_profiles")
        .upsert(payload)
        .select("*")
        .single();
      if (saveError) {
        throw saveError;
      }
      setNotice(schoolDraft.id ? "Profil sekolah diperbarui." : "Profil sekolah ditambahkan.");
      setSchoolDraft(blankSchoolDraft());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profil tidak dapat disimpan.");
    } finally {
      setSavingSchool(false);
    }
  }

  async function saveVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingVendor(true);
    setError(null);
    setNotice(null);
    try {
      if (!vendorDraft.nama_toko.trim()) {
        throw new Error("Nama toko / rekanan wajib diisi.");
      }
      const payload = {
        ...(vendorDraft.id ? { id: vendorDraft.id } : {}),
        kategori_belanja: vendorDraft.kategori_belanja,
        nama_toko: vendorDraft.nama_toko.trim(),
        nama_pemilik: nullable(vendorDraft.nama_pemilik),
        alamat_toko: nullable(vendorDraft.alamat_toko),
      };
      const { error: saveError } = await getSupabaseBrowserClient()
        .from("vendors")
        .upsert(payload)
        .select("*")
        .single();
      if (saveError) {
        throw saveError;
      }
      setNotice(vendorDraft.id ? "Data penjual diperbarui." : "Penjual ditambahkan.");
      setVendorDraft(blankVendorDraft());
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Penjual tidak dapat disimpan.");
    } finally {
      setSavingVendor(false);
    }
  }

  async function seedDefaultProfiles() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const names = ["KB PAUD MELATI", "KB HARAPAN KITA"];
      const existing = new Set(profiles.map((profile) => profile.nama_sekolah.toLowerCase()));
      const missing = names
        .filter((name) => !existing.has(name.toLowerCase()))
        .map((nama_sekolah) => ({
          nama_sekolah,
          npsn: null,
          alamat_dusun_desa: null,
          kecamatan: null,
          kabupaten: null,
          provinsi: null,
          email: null,
          no_hp: null,
          nama_kepsek: null,
          jabatan_kepsek: "Kepala Sekolah",
          nama_bendahara: null,
          jumlah_siswa_l: 0,
          jumlah_siswa_p: 0,
          lama_berdiri: null,
          gdrive_folder_id: null,
        }));
      if (missing.length === 0) {
        setNotice("Kedua profil contoh sudah tersedia.");
        return;
      }
      const { error: seedError } = await getSupabaseBrowserClient()
        .from("school_profiles")
        .insert(missing);
      if (seedError) {
        throw seedError;
      }
      setNotice(`${missing.length} profil contoh berhasil ditambahkan.`);
      await loadData();
    } catch (seedError) {
      setError(seedError instanceof Error ? seedError.message : "Profil contoh gagal ditambahkan.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSchool(profile: SchoolProfile) {
    if (!window.confirm(`Hapus profil "${profile.nama_sekolah}" dan riwayat LPJ terkait?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: deleteError } = await getSupabaseBrowserClient()
        .from("school_profiles")
        .delete()
        .eq("id", profile.id);
      if (deleteError) {
        throw deleteError;
      }
      if (schoolDraft.id === profile.id) {
        setSchoolDraft(blankSchoolDraft());
      }
      setNotice("Profil sekolah dihapus.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Profil tidak dapat dihapus.");
    } finally {
      setBusy(false);
    }
  }

  async function removeVendor(vendor: Vendor) {
    if (!window.confirm(`Hapus penjual "${vendor.nama_toko}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: deleteError } = await getSupabaseBrowserClient()
        .from("vendors")
        .delete()
        .eq("id", vendor.id);
      if (deleteError) {
        throw deleteError;
      }
      if (vendorDraft.id === vendor.id) {
        setVendorDraft(blankVendorDraft());
      }
      setNotice("Data penjual dihapus.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Penjual tidak dapat dihapus.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Data referensi</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
            Profil sekolah &amp; penjual
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Kelola profil sekolah dan rekanan. Profil serta data penjual tersimpan terpisah untuk akun Anda.
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60"
          disabled={busy || loading}
          onClick={seedDefaultProfiles}
          type="button"
        >
          {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Users size={16} />}
          Tambahkan 2 profil contoh
        </button>
      </div>

      {error ? (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button aria-label="Tutup pesan" onClick={() => setError(null)} type="button">
            <X size={16} />
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <Check size={16} />
          {notice}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-800">
                <Building2 size={19} />
              </span>
              <div>
                <h2 className="font-semibold text-slate-950">
                  {schoolDraft.id ? "Edit profil sekolah" : "Tambah profil sekolah"}
                </h2>
                <p className="text-xs text-slate-500">Kolom wajib hanya nama sekolah dan jumlah siswa.</p>
              </div>
            </div>
            {schoolDraft.id ? (
              <button
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setSchoolDraft(blankSchoolDraft())}
                title="Batalkan edit"
                type="button"
              >
                <X size={18} />
              </button>
            ) : null}
          </div>

          <form className="space-y-4" onSubmit={saveSchool}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {schoolFields.map(({ key, label, type }) => (
                <TextField
                  key={key}
                  label={label}
                  onChange={(value) =>
                    setSchoolDraft((current) => ({ ...current, [key]: value }))
                  }
                  type={type}
                  value={schoolDraft[key]}
                />
              ))}
            </div>
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60"
              disabled={savingSchool}
              type="submit"
            >
              {savingSchool ? <LoaderCircle className="animate-spin" size={16} /> : <Save size={16} />}
              {schoolDraft.id ? "Simpan perubahan" : "Simpan sekolah"}
            </button>
          </form>

          <div className="mt-7 border-t border-slate-100 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Sekolah terdaftar <span className="text-slate-400">({profiles.length})</span>
              </h3>
              {loading ? <LoaderCircle className="animate-spin text-slate-400" size={16} /> : null}
            </div>
            {profiles.length === 0 && !loading ? (
              <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                Belum ada profil sekolah. Tambahkan profil atau gunakan dua profil contoh.
              </p>
            ) : (
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3"
                    key={profile.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {profile.nama_sekolah}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {profile.npsn || "NPSN belum diisi"} ·{" "}
                        {profile.kecamatan || "Kecamatan belum diisi"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`Edit ${profile.nama_sekolah}`}
                        className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800"
                        onClick={() => setSchoolDraft(schoolToDraft(profile))}
                        type="button"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={`Hapus ${profile.nama_sekolah}`}
                        className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                        disabled={busy}
                        onClick={() => void removeSchool(profile)}
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-800">
              <Store size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">
                {vendorDraft.id ? "Edit penjual" : "Master penjual"}
              </h2>
              <p className="text-xs text-slate-500">Kategori digunakan untuk memasangkan penjual saat parse BKU.</p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={saveVendor}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Kategori belanja</span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
                onChange={(event) =>
                  setVendorDraft((current) => ({
                    ...current,
                    kategori_belanja: event.target.value as VendorCategory,
                  }))
                }
                value={vendorDraft.kategori_belanja}
              >
                {vendorCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Nama toko / rekanan"
              onChange={(value) => setVendorDraft((current) => ({ ...current, nama_toko: value }))}
              value={vendorDraft.nama_toko}
            />
            <TextField
              label="Nama pemilik"
              onChange={(value) => setVendorDraft((current) => ({ ...current, nama_pemilik: value }))}
              value={vendorDraft.nama_pemilik}
            />
            <TextField
              label="Alamat toko"
              onChange={(value) => setVendorDraft((current) => ({ ...current, alamat_toko: value }))}
              value={vendorDraft.alamat_toko}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60"
                disabled={savingVendor}
                type="submit"
              >
                {savingVendor ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}
                {vendorDraft.id ? "Simpan penjual" : "Tambah penjual"}
              </button>
              {vendorDraft.id ? (
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600"
                  onClick={() => setVendorDraft(blankVendorDraft())}
                  type="button"
                >
                  Batal
                </button>
              ) : null}
            </div>
          </form>

          <div className="mt-6 max-h-[460px] space-y-2 overflow-auto border-t border-slate-100 pt-4">
            {vendors.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
                Belum ada master penjual.
              </p>
            ) : (
              vendors.map((vendor) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3.5 py-3"
                  key={vendor.id}
                >
                  <div className="min-w-0">
                    <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-800">
                      {vendor.kategori_belanja}
                    </span>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                      {vendor.nama_toko}
                    </p>
                    <p className="truncate text-xs text-slate-500">{vendor.alamat_toko || "Alamat belum diisi"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      aria-label={`Edit ${vendor.nama_toko}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-800"
                      onClick={() => setVendorDraft(vendorToDraft(vendor))}
                      type="button"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label={`Hapus ${vendor.nama_toko}`}
                      className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                      disabled={busy}
                      onClick={() => void removeVendor(vendor)}
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
