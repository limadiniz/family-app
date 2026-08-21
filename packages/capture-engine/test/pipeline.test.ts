import { describe, expect, it } from 'vitest';
import { runCapturePipeline } from '../src/pipeline';

describe('runCapturePipeline', () => {
  it('never produces a CONFIRMED status — only NEEDS_REVIEW or READY (§77)', () => {
    const out = runCapturePipeline({ source: 'TEXT', rawText: 'Reunião de pais dia 25/08 às 19h.' });
    expect(['NEEDS_REVIEW', 'READY']).toContain(out.status);
  });

  it('§78: extracts a structured proposal from a school-meeting-shaped sentence', () => {
    const out = runCapturePipeline({ source: 'TEXT', rawText: 'Reunião de pais dia 25/08 às 19h.' });
    expect(out.category).toBe('SCHOOL_ANNOUNCEMENT');
    expect(out.proposal).not.toBeNull();
    expect(out.proposal?.targetType).toBe('CALENDAR_EVENT');
    expect(out.proposal?.proposedFields['date']).toBe('2026-08-25');
    expect(out.proposal?.proposedFields['time']).toBe('19:00');
  });

  it('routes non-text sources (photo/PDF/audio) to NEEDS_REVIEW without OCR/STT wired (documented ASSUMPTION)', () => {
    const out = runCapturePipeline({ source: 'PHOTO', rawText: null });
    expect(out.status).toBe('NEEDS_REVIEW');
    expect(out.proposal).toBeNull();
  });

  it('routes empty/unrecognizable text to NEEDS_REVIEW rather than a low-confidence guess presented as fact', () => {
    const out = runCapturePipeline({ source: 'TEXT', rawText: 'xyz' });
    expect(out.status).toBe('NEEDS_REVIEW');
  });

  it('never reports confidence >= 1.0 (§22: never hide uncertainty)', () => {
    const out = runCapturePipeline({ source: 'TEXT', rawText: 'Consulta com a pediatra Dra. Ana dia 10/09 às 15:30.' });
    expect(out.extraction?.confidence).toBeLessThan(1);
    expect(out.proposal?.confidence).toBeLessThan(1);
  });

  it('accepts an injected classifier/extractor (pluggable for a future real AI provider)', () => {
    const out = runCapturePipeline(
      { source: 'TEXT', rawText: 'qualquer coisa' },
      {
        classify: () => ({ category: 'MEDICAL_PRESCRIPTION', confidence: 0.99 }),
        extract: () => ({ fields: { medication: 'Amoxicilina' }, confidence: 0.95 }),
      },
    );
    expect(out.category).toBe('MEDICAL_PRESCRIPTION');
    expect(out.proposal?.targetType).toBe('DOCUMENT');
    expect(out.status).toBe('READY');
  });
});
