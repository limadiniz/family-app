'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { AppNav } from '@/components/app-nav';

/**
 * Auth-gated shell for the whole /app area (§79). Client-rendered check
 * against the Supabase session; every actual data fetch still goes
 * through apps/api with the bearer token (§54), so this guard is a UX
 * convenience, not a security boundary — the boundary is server-side.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/entrar');
      } else {
        setChecked(true);
      }
    });
  }, [router]);

  if (!checked) {
    return (
      <main className="flex min-h-screen items-center justify-center text-inkMuted">Carregando...</main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
