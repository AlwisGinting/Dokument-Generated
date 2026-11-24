"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, LoaderCircle, Mail } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/services/supabaseBrowser";

type AuthMode = "login" | "signup";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Autentikasi tidak berhasil.";
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(() => getSupabaseBrowserClient().auth.getSession())
      .then(({ data, error: sessionError }) => {
        if (sessionError) {
          throw sessionError;
        }
        if (active && data.session) {
          router.replace("/dashboard");
        }
      })
      .catch((sessionError: unknown) => {
        if (active) {
          setError(errorText(sessionError));
        }
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const auth = getSupabaseBrowserClient().auth;
      if (mode === "login") {
        const { error: authError } = await auth.signInWithPassword({ email, password });
        if (authError) {
          throw authError;
        }
        router.replace("/dashboard");
        router.refresh();
      } else {
        const { data, error: authError } = await auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/login` },
        });
        if (authError) {
          throw authError;
        }
        if (data.session) {
          router.replace("/dashboard");
          router.refresh();
        } else {
          setMessage("Akun dibuat. Periksa email untuk mengonfirmasi alamat sebelum masuk.");
          setMode("login");
        }
      }
    } catch (authError) {
      setError(errorText(authError));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f7f4] px-4 py-10">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-white shadow-[0_30px_90px_-45px_rgba(16,54,34,0.35)] md:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden bg-[#173b2a] p-12 text-white md:flex">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border border-white/10" />
          <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <Image
              alt=""
              className="h-11 w-11 rounded-2xl object-cover"
              height={44}
              priority
              src="/assets/logo_paud.png"
              width={44}
            />
            <span className="font-semibold tracking-tight">PAUD LPJ Automation</span>
          </div>
          <div className="relative max-w-md">
            <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-emerald-200">
              Administrasi lebih tertata
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Dokumen LPJ &amp; SPJ, dibuat dengan aturan yang jelas.
            </h1>
            <p className="mt-5 max-w-sm text-base leading-7 text-emerald-50/75">
              Unggah BKU, tinjau pecahan belanja, lalu siapkan bundel dokumen untuk sekolah.
            </p>
          </div>
          <p className="relative text-xs text-emerald-100/60">
            Rule-based • Tanpa API AI saat runtime
          </p>
        </div>

        <div className="flex min-h-[620px] flex-col justify-center p-6 sm:p-10 md:p-12">
          <div className="mb-9 flex items-center gap-3 md:hidden">
            <Image
              alt=""
              className="h-11 w-11 rounded-2xl object-cover"
              height={44}
              priority
              src="/assets/logo_paud.png"
              width={44}
            />
            <span className="font-semibold tracking-tight text-slate-900">
              PAUD LPJ Automation
            </span>
          </div>
          <p className="text-sm font-semibold text-emerald-700">
            {mode === "login" ? "Selamat datang kembali" : "Mulai gunakan aplikasi"}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            {mode === "login" ? "Masuk ke akun" : "Buat akun"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Gunakan email dan kata sandi untuk mengakses data sekolah Anda.
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
              <span className="relative block">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@sekolah.id"
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Kata sandi</span>
              <span className="relative block">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimal 8 karakter"
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {message}
              </p>
            ) : null}

            <button
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? <LoaderCircle className="animate-spin" size={18} /> : <ArrowRight size={18} />}
              {pending ? "Memproses..." : mode === "login" ? "Masuk" : "Daftar"}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-slate-500">
            {mode === "login" ? "Belum memiliki akun?" : "Sudah memiliki akun?"}{" "}
            <button
              className="font-semibold text-emerald-800 hover:text-emerald-950"
              onClick={() => {
                setError(null);
                setMessage(null);
                setMode(mode === "login" ? "signup" : "login");
              }}
              type="button"
            >
              {mode === "login" ? "Daftar di sini" : "Masuk"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
