import type { Metadata } from 'next';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';

/**
 * Plus Jakarta Sans (§6.2) via @fontsource-variable — os arquivos .woff2
 * são bundlados no pacote npm e servidos como asset estático do próprio
 * build, sem nenhuma requisição de rede a fonts.googleapis.com/gstatic.com
 * em build time nem em runtime.
 *
 * Trocado de next/font/google para isto depois de reproduzir, neste mesmo
 * sandbox, o build de `apps/web` falhando com NextFontError ao tentar
 * buscar a fonte no Google Fonts — o sandbox bloqueia esse domínio
 * especificamente (confirmado via curl: CONNECT tunnel 403), mas nada
 * garante que builds locais dos devs, CI, ou redes corporativas com
 * proxy restritivo não tenham a mesma classe de bloqueio; um build de
 * produção não deveria depender de rede externa disponível no momento
 * exato do build. Com next/font/local (que é o que este pacote usa por
 * baixo) o build fica determinístico em qualquer ambiente, incluindo
 * offline. `font-display: swap` já vem definido pelo próprio pacote.
 */
const FONT_FAMILY_VARIABLE = "'Plus Jakarta Sans Variable'";

export const metadata: Metadata = {
  title: 'ZELII — O cuidado em sintonia',
  description: 'ZELII organiza o cuidado entre todos que fazem parte da rotina da família: agenda, escola, saúde e cuidado, em um só lugar.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" style={{ ['--font-plus-jakarta-sans' as string]: FONT_FAMILY_VARIABLE }}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
