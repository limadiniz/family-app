/** Only internal app and invitation routes may survive an auth redirect. */
export function resolveAuthReturnTo(value: string | null | undefined, fallback = '/app/today'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  const path = value.split('#')[0]!.split('?')[0]!;
  if (path.startsWith('/app/') || /^\/convite\/[A-Za-z0-9_-]+$/.test(path)) return value;
  return fallback;
}
export function buildAuthUrl(base: '/entrar' | '/cadastro', returnTo: string): string {
  return `${base}?returnTo=${encodeURIComponent(resolveAuthReturnTo(returnTo))}`;
}
