import { describe, expect, it } from 'vitest';
import { loadFeatureFlags } from '../src/feature-flags';

describe('loadFeatureFlags', () => {
  it('defaults AI and OCR to disabled, finance and teen access to enabled', () => {
    const flags = loadFeatureFlags({});
    expect(flags).toEqual({
      AI_ENABLED: false,
      OCR_ENABLED: false,
      FINANCE_ENABLED: true,
      TEEN_ACCESS_ENABLED: true,
    });
  });

  it('reads FF_* environment overrides', () => {
    const flags = loadFeatureFlags({ FF_AI_ENABLED: 'true', FF_FINANCE_ENABLED: 'false' });
    expect(flags.AI_ENABLED).toBe(true);
    expect(flags.FINANCE_ENABLED).toBe(false);
  });

  it('keeps AI_ENABLED as a backward-compatible alias while FF_AI_ENABLED is canonical', () => {
    expect(loadFeatureFlags({ AI_ENABLED: 'true' }).AI_ENABLED).toBe(true);
    expect(loadFeatureFlags({ AI_ENABLED: 'true', FF_AI_ENABLED: 'false' }).AI_ENABLED).toBe(false);
  });
});
