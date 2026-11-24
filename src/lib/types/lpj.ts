export type VendorCategory = "ATK" | "OBAT" | "KONSUMSI" | "CETAK" | "UMUM";

export type BkuCategory = "BELANJA_BARANG" | "UTILITAS" | "HONOR_GURU";

export interface SchoolProfile {
  id: string;
  owner_id?: string;
  nama_sekolah: string;
  npsn: string | null;
  alamat_dusun_desa: string | null;
  alamat_jalan: string | null;
  kecamatan: string | null;
  kabupaten: string | null;
  provinsi: string | null;
  email: string | null;
  no_hp: string | null;
  nama_kepsek: string | null;
  jabatan_kepsek: string;
  nama_bendahara: string | null;
  jumlah_siswa_l: number;
  jumlah_siswa_p: number;
  lama_berdiri: number | null;
  gdrive_folder_id: string | null;
  logo_data_url: string | null;
}

export interface Vendor {
  id: string;
  owner_id?: string;
  kategori_belanja: VendorCategory;
  nama_toko: string;
  nama_pemilik: string | null;
  alamat_toko: string | null;
}

export interface BkuTransaction {
  tanggal: string;
  bulan?: string;
  kode_kegiatan: string;
  kode_rekening: string;
  no_bukti: string;
  uraian: string;
  penerimaan: number;
  pengeluaran: number;
  saldo: number;
  kategori: BkuCategory;
  sub_kategori_toko: VendorCategory | null;
}

export type UnclassifiedBkuTransaction = Omit<
  BkuTransaction,
  "kategori" | "sub_kategori_toko"
>;

export interface BkuMetadata {
  bulan: string | null;
  tahun: number | null;
  npsn: string | null;
  nama_sekolah: string | null;
  kecamatan: string | null;
  kabupaten: string | null;
  provinsi: string | null;
  saldo_awal: number | null;
  total_penerimaan: number | null;
  total_pengeluaran: number | null;
  saldo_akhir: number | null;
  audit?: BkuAudit | null;
}

export interface BkuAudit {
  expectedPengeluaran: number | null;
  detectedPengeluaran: number;
  difference: number | null;
  balanceMismatchCount: number;
  verified: boolean;
}

export interface BkuParseResult {
  metadata: BkuMetadata;
  transactions: UnclassifiedBkuTransaction[];
}

export interface SpjItem {
  no: number;
  nama_barang: string;
  diantar: string;
  banyaknya: string;
  harga_satuan: number;
  jumlah_harga: number;
}

export interface SpjPart {
  id: string;
  kode_part: string;
  is_barang: boolean;
  kategori_bku?: BkuCategory;
  kategori_toko: VendorCategory | null;
  bulan_alokasi: string;
  tanggal_transaksi: string;
  nama_penjual: string;
  alamat_penjual: string;
  uraian_singkat: string;
  items: SpjItem[];
  total_part: number;
}
