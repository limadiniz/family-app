import { describe, expect, it } from 'vitest';
import { buildAuthUrl, resolveAuthReturnTo } from '../src/lib/auth-return';

describe('auth return routes', () => {
  it('preserves internal invitation and app destinations', () => {
    expect(resolveAuthReturnTo('/convite/abc_123-Z')).toBe('/convite/abc_123-Z');
    expect(resolveAuthReturnTo('/app/today')).toBe('/app/today');
    expect(buildAuthUrl('/entrar', '/convite/token')).toBe('/entrar?returnTo=%2Fconvite%2Ftoken');
  });

  it('blocks external and protocol-relative redirects', () => {
    expect(resolveAuthReturnTo('https://attacker.example')).toBe('/app/today');
    expect(resolveAuthReturnTo('//attacker.example')).toBe('/app/today');
  });
});
