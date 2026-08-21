import { Hero } from '@/components/hero';
import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';
import { TrustBar } from '@/components/trust-bar';

export default function HomePage() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <TrustBar />
      </main>
      <SiteFooter />
    </>
  );
}
