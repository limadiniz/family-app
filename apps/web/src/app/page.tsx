import Link from 'next/link';
import { SiteNav } from '@/components/site-nav';

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">ZELII — O cuidado em sintonia</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          A ZELII recebe o que chegou, mostra o que precisa acontecer e deixa claro quem está cuidando.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-inkMuted">
          ZELII organiza o cuidado entre todos que fazem parte da rotina da família — agenda, escola, saúde,
          medicamentos, documentos e a rede de quem cuida, com a permissão certa para cada pessoa.
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
