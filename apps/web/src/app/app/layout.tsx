'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';
import { Sidebar } from '@/components/app-nav';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { MobileMenu } from '@/components/mobile-menu';
import { FamilyGate } from '@/components/family-gate';
import { OnboardingGate } from '@/components/onboarding-gate';

/**
 * Auth-gated shell for the whole /app area (§79). Client-rendered check
 * against the Supabase session; every actual data fetch still goes
 * through apps/api with the bearer token (§54), so this guard is a UX
 * convenience, not a security boundary — the boundary is server-side.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    <FamilyGate>
      {/*
        Desktop/tablet paisagem (≥1024px, `lg`): `Sidebar` fixo à
        esquerda, sem barra superior/inferior extra. Abaixo de `lg`
        (tablet retrato e mobile): `Sidebar` se esconde, `MobileTopBar`
        (marca + hambúrguer) fica fixa no topo, `MobileBottomNav` (5
        áreas) fixa embaixo, e `MobileMenu` — a navegação completa, com
        sub-itens, troca de família e Configurações/Sair — abre por
        cima de tudo quando o hambúrguer é clicado. §P0.3.
      */}
      <div className="flex min-h-screen flex-col lg:flex-row">
        <Sidebar />
        <MobileTopBar onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 p-4 pb-24 lg:p-8 lg:pb-8">
          <OnboardingGate>{children}</OnboardingGate>
        </main>
        <MobileBottomNav />
        <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      </div>
    </FamilyGate>
  );
}
