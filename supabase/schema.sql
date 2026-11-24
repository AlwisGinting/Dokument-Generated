create extension if not exists pgcrypto;

create table if not exists public.school_profiles (
  id uuid primary key default gen_random_uuid(),
  nama_sekolah text not null,
  npsn text,
  alamat_dusun_desa text,
  alamat_jalan text,
  kecamatan text,
  kabupaten text,
  provinsi text,
  email text,
  no_hp text,
  nama_kepsek text,
  jabatan_kepsek text not null default 'Kepala Sekolah',
  nama_bendahara text,
  jumlah_siswa_l integer not null default 0,
  jumlah_siswa_p integer not null default 0,
  lama_berdiri integer,
  gdrive_folder_id text,
  logo_data_url text,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint school_profiles_jumlah_siswa_l_nonnegative check (jumlah_siswa_l >= 0),
  constraint school_profiles_jumlah_siswa_p_nonnegative check (jumlah_siswa_p >= 0)
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  kategori_belanja text not null check (
    kategori_belanja in ('ATK', 'OBAT', 'KONSUMSI', 'CETAK', 'UMUM')
  ),
  nama_toko text not null,
  nama_pemilik text,
  alamat_toko text,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.generation_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.school_profiles (id) on delete cascade,
  periode_bku text not null,
  total_pengeluaran numeric(14, 2) not null default 0,
  gdrive_pdf_url text,
  gdrive_docx_url text,
  created_at timestamptz not null default now(),
  constraint generation_logs_total_pengeluaran_nonnegative check (total_pengeluaran >= 0)
);

alter table public.school_profiles
  add column if not exists alamat_jalan text;
alter table public.school_profiles
  add column if not exists logo_data_url text;
alter table public.school_profiles
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.school_profiles
  alter column owner_id set default auth.uid();
alter table public.vendors
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.vendors
  alter column owner_id set default auth.uid();

alter table public.school_profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.generation_logs enable row level security;

grant select, insert, update, delete on public.school_profiles to authenticated;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, insert, update, delete on public.generation_logs to authenticated;

drop policy if exists "Users manage their school profiles" on public.school_profiles;
create policy "Users manage their school profiles"
  on public.school_profiles
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users manage their vendors" on public.vendors;
create policy "Users manage their vendors"
  on public.vendors
  for all
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Users manage logs for their schools" on public.generation_logs;
create policy "Users manage logs for their schools"
  on public.generation_logs
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.school_profiles
      where school_profiles.id = generation_logs.school_id
        and school_profiles.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.school_profiles
      where school_profiles.id = generation_logs.school_id
        and school_profiles.owner_id = (select auth.uid())
    )
  );
