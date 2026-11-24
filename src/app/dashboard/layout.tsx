"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Building2, FileCheck2, LogOut } from "lucide-react";
import { useState, type ReactNode } from "react";
import { SessionProvider, useAuthSession } from "@/components/SessionProvider";
import { getSupabaseBrowserClient } from "@/lib/services/supabaseBrowser";

const navigation = [
  { href: "/dashboard", label: "Generator LPJ & SPJ", shortLabel: "Generator", icon: FileCheck2 },
  {
    href: "/dashboard/profiles",
    label: "Profil Sekolah & Penjual",
    shortLabel: "Profil",
    icon: Building2,
  },
];

function DashboardShell({ children }: { children: ReactNode }) {
  const { session } = useAuthSession();
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function signOut() {
    setLogoutError(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) {
        setLogoutError(error.message);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Sesi tidak dapat diakhiri.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f7f4]">
      <header className="sticky top-0 z-30 border-b border-emerald-950/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link className="flex shrink-0 items-center gap-3" href="/dashboard">
            <Image
              alt=""
              className="h-10 w-10 rounded-xl object-cover"
              height={40}
              priority
              src="/assets/logo_paud.png"
              width={40}
            />
            <span className="hidden sm:block">
              <span className="block text-sm font-bold tracking-tight text-slate-950">
                PAUD LPJ Automation
              </span>
              <span className="block text-[11px] text-slate-500">
                Sistem dokumen rule-based
              </span>
            </span>
          </Link>

          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {navigation.map(({ href, label, shortLabel, icon: Icon }) => {
              const active =
                pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition sm:px-4 sm:text-sm ${
                    active
                      ? "bg-white text-emerald-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  href={href}
                  key={href}
                >
                  <Icon size={16} />
                  <span className="lg:hidden">{shortLabel}</span>
                  <span className="hidden lg:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden max-w-36 truncate text-xs text-slate-500 lg:block">
              {session?.user.email}
            </span>
            <button
              aria-label="Keluar"
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-700"
              onClick={signOut}
              type="button"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
        {logoutError ? (
          <p className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-center text-xs text-rose-700">
            Gagal keluar: {logoutError}
          </p>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
      <footer className="mx-auto max-w-[1440px] px-4 pb-6 text-center text-xs text-slate-400 sm:px-6 lg:px-8">
        PAUD LPJ Automation · pemrosesan deterministik tanpa API AI
      </footer>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <DashboardShell>{children}</DashboardShell>
    </SessionProvider>
  );
}
