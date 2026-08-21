import { SiteFooter } from './site-footer';
import { SiteNav } from './site-nav';

export function MarketingPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-ink">{title}</h1>
        <div className="prose prose-neutral mt-6 max-w-none text-inkMuted [&>h2]:mt-8 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:text-ink [&>p]:mt-3 [&>ul]:mt-3 [&>ul]:list-disc [&>ul]:pl-6">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
