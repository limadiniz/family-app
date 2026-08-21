import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Você não precisa lembrar de tudo.
          <br />A plataforma lembra com você.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-inkMuted">
          Agenda, escola, saúde, medicamentos, cuidadores e documentos da sua família — organizados em um só
          lugar, com as permissões certas para cada pessoa que cuida.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <Link href="/cadastro" className="rounded-md bg-primary px-6 py-3 font-medium text-white hover:opacity-90">
            Começar gratuitamente
          </Link>
          <Link href="/produto" className="rounded-md border border-border px-6 py-3 font-medium text-ink hover:bg-surfaceMuted">
            Conhecer o produto
          </Link>
        </div>
      </main>
    </>
  );
}
