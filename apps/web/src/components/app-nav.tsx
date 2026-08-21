'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase-client';

const links = [
  { href: '/app/today', label: 'Hoje' },
  { href: '/app/capture', label: 'Caixa de Entrada' },
  { href: '/app/family', label: 'Família' },
  { href: '/app/children', label: 'Filhos' },
  { href: '/app/calendar', label: 'Agenda' },
  { href: '/app/tasks', label: 'Tarefas' },
  { href: '/app/requests', label: 'Solicitações' },
  { href: '/app/care-network', label: 'Rede de Cuidado' },
  { href: '/app/health', label: 'Saúde' },
  { href: '/app/emergency', label: 'Emergência' },
  { href: '/app/documents', label: 'Documentos' },
  { href: '/app/ai', label: 'Assistente' },
  { href: '/app/settings', label: 'Configurações' },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await getSupabaseBrowserClient().auth.signOut();
    router.push('/entrar');
  }

  return (
    <aside className="flex w-56 flex-col border-r border-border bg-surface p-4">
      <span className="mb-6 px-2 text-lg font-semibold text-ink">Family App</span>
      <nav className="flex flex-1 flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-3 py-2 text-sm ${
              pathname?.startsWith(l.href) ? 'bg-surfaceMuted font-medium text-ink' : 'text-inkMuted hover:bg-surfaceMuted'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <button onClick={handleLogout} className="mt-4 rounded-md px-3 py-2 text-left text-sm text-inkMuted hover:bg-surfaceMuted">
        Sair
      </button>
    </aside>
  );
}
