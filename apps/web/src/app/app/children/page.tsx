'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui';

/**
 * §5 — "Filhos" foi absorvida pela página Pessoas (filtro "Filhos e
 * dependentes"), que já tem o formulário de adicionar dependente e o
 * campo `roles` que esta página não tinha. Mantida como redirect (em
 * vez de simplesmente apagada) para não quebrar links/favoritos
 * antigos que apontem para /app/children.
 */
export default function ChildrenRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app/people');
  }, [router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <LoadingState label="Redirecionando para Pessoas…" />
    </div>
  );
}
