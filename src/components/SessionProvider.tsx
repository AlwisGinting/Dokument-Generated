"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/services/supabaseBrowser";

interface SessionContextValue {
  session: Session | null;
  loading: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Sesi pengguna tidak dapat diperiksa.";
}

export function SessionProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => {};

    void Promise.resolve()
      .then(() => {
        if (!active) {
          return null;
        }
        const supabase = getSupabaseBrowserClient();
        const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) {
            return;
          }
          setSession(nextSession);
          setLoading(false);
          setError(null);
          if (!nextSession) {
            router.replace("/login");
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
        return supabase.auth.getSession();
      })
      .then((response) => {
        if (!active || !response) {
          return;
        }
        if (response.error) {
          throw response.error;
        }
        setSession(response.data.session);
        setLoading(false);
        if (!response.data.session) {
          router.replace("/login");
        }
      })
      .catch((sessionError: unknown) => {
        if (active) {
          setError(messageFromError(sessionError));
          setLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center text-sm font-medium text-slate-500">
        Memeriksa sesi akun...
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-800 shadow-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <SessionContext.Provider value={{ session, loading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useAuthSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useAuthSession harus digunakan di dalam SessionProvider.");
  }
  return context;
}
