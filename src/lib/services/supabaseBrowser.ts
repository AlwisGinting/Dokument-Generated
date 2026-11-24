"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/services/supabaseClient";

let browserClient: SupabaseClient<Database, "public"> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database, "public"> {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !anonKey) {
      throw new Error(
        "Variabel lingkungan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY harus dikonfigurasi.",
      );
    }
    browserClient = createClient<Database, "public">(
      url,
      anonKey,
    );
  }
  return browserClient;
}
