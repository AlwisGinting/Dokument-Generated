"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/services/supabaseClient";

let browserClient: SupabaseClient<Database, "public"> | undefined;

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variabel lingkungan ${name} belum dikonfigurasi.`);
  }
  return value;
}

export function getSupabaseBrowserClient(): SupabaseClient<Database, "public"> {
  if (!browserClient) {
    browserClient = createClient<Database, "public">(
      requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_URL"),
      requiredEnvironmentValue("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    );
  }
  return browserClient;
}
