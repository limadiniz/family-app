import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Family App — Você não precisa lembrar de tudo',
  description: 'A plataforma que organiza a vida da sua família: agenda, escola, saúde e cuidado, em um só lugar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-bg text-ink antialiased">{children}</body>
    </html>
  );
}
