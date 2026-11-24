import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SchoolProfile, Vendor } from "@/lib/types/lpj";

export interface GenerationLog {
  id: string;
  school_id: string;
  periode_bku: string;
  total_pengeluaran: number;
  gdrive_pdf_url: string | null;
  gdrive_docx_url: string | null;
  created_at: string;
}

type TableDefinition<Row, Insert, Update> = {
  Row: Row & Record<string, unknown>;
  Insert: Insert & Record<string, unknown>;
  Update: Update & Record<string, unknown>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      school_profiles: TableDefinition<
        SchoolProfile & { owner_id: string; created_at: string },
        Omit<SchoolProfile, "id"> & { id?: string; created_at?: string },
        Partial<Omit<SchoolProfile, "id">> & { created_at?: string }
      >;
      vendors: TableDefinition<
        Vendor & { owner_id: string; created_at: string },
        Omit<Vendor, "id"> & { id?: string; created_at?: string },
        Partial<Omit<Vendor, "id">> & { created_at?: string }
      >;
      generation_logs: TableDefinition<
        GenerationLog,
        Omit<GenerationLog, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        },
        Partial<Omit<GenerationLog, "id">>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

let client: SupabaseClient<Database, "public"> | undefined;

export function getSupabaseClient(
  accessToken?: string,
): SupabaseClient<Database, "public"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error(
      "Variabel lingkungan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY harus dikonfigurasi.",
    );
  }
  if (accessToken) {
    return createClient<Database, "public">(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }
  if (!client) {
    client = createClient<Database, "public">(url, anonKey);
  }
  return client;
}

function throwIfError(error: { message: string } | null): void {
  if (error) {
    throw new Error(`Supabase: ${error.message}`);
  }
}

function requiredData<T>(data: T | null, operation: string): T {
  if (data === null) {
    throw new Error(`Supabase tidak mengembalikan data untuk operasi ${operation}.`);
  }
  return data;
}

export async function listSchoolProfiles(accessToken?: string): Promise<SchoolProfile[]> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("school_profiles")
    .select("*")
    .order("nama_sekolah");
  throwIfError(error);
  return requiredData(data, "daftar profil sekolah");
}

export async function getSchoolProfile(
  id: string,
  accessToken?: string,
): Promise<SchoolProfile> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("school_profiles")
    .select("*")
    .eq("id", id)
    .single();
  throwIfError(error);
  return requiredData(data, "profil sekolah");
}

export async function upsertSchoolProfile(
  profile: Omit<SchoolProfile, "id"> & { id?: string },
  accessToken?: string,
): Promise<SchoolProfile> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("school_profiles")
    .upsert(profile)
    .select("*")
    .single();
  throwIfError(error);
  return requiredData(data, "simpan profil sekolah");
}

export async function updateSchoolProfile(
  id: string,
  changes: Partial<Omit<SchoolProfile, "id">>,
  accessToken?: string,
): Promise<SchoolProfile> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("school_profiles")
    .update(changes)
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error);
  return requiredData(data, "perbarui profil sekolah");
}

export async function deleteSchoolProfile(id: string, accessToken?: string): Promise<void> {
  const { error } = await getSupabaseClient(accessToken)
    .from("school_profiles")
    .delete()
    .eq("id", id);
  throwIfError(error);
}

export async function listVendors(accessToken?: string): Promise<Vendor[]> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("vendors")
    .select("*")
    .order("nama_toko");
  throwIfError(error);
  return requiredData(data, "daftar vendor");
}

export async function upsertVendor(
  vendor: Omit<Vendor, "id"> & { id?: string },
  accessToken?: string,
): Promise<Vendor> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("vendors")
    .upsert(vendor)
    .select("*")
    .single();
  throwIfError(error);
  return requiredData(data, "simpan vendor");
}

export async function updateVendor(
  id: string,
  changes: Partial<Omit<Vendor, "id">>,
  accessToken?: string,
): Promise<Vendor> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("vendors")
    .update(changes)
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error);
  return requiredData(data, "perbarui vendor");
}

export async function deleteVendor(id: string, accessToken?: string): Promise<void> {
  const { error } = await getSupabaseClient(accessToken)
    .from("vendors")
    .delete()
    .eq("id", id);
  throwIfError(error);
}

export async function listGenerationLogs(
  schoolId: string,
  accessToken?: string,
): Promise<GenerationLog[]> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("generation_logs")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  throwIfError(error);
  return requiredData(data, "daftar generation log");
}

export async function createGenerationLog(
  log: Omit<GenerationLog, "id" | "created_at">,
  accessToken?: string,
): Promise<GenerationLog> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("generation_logs")
    .insert(log)
    .select("*")
    .single();
  throwIfError(error);
  return requiredData(data, "buat generation log");
}

export async function updateGenerationLog(
  id: string,
  changes: Partial<Omit<GenerationLog, "id">>,
  accessToken?: string,
): Promise<GenerationLog> {
  const { data, error } = await getSupabaseClient(accessToken)
    .from("generation_logs")
    .update(changes)
    .eq("id", id)
    .select("*")
    .single();
  throwIfError(error);
  return requiredData(data, "perbarui generation log");
}

export async function deleteGenerationLog(id: string, accessToken?: string): Promise<void> {
  const { error } = await getSupabaseClient(accessToken)
    .from("generation_logs")
    .delete()
    .eq("id", id);
  throwIfError(error);
}
