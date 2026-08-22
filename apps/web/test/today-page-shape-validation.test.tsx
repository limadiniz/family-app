// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TodayPage from '@/app/app/today/page';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

const VALID_PLAN = {
  date: '2026-08-22',
  tomorrowDate: '2026-08-23',
  people: [{ id: 'p1', displayName: 'Mariana', personType: 'MINOR' }],
  subjects: [{ id: 'p1', displayName: 'Mariana', personType: 'MINOR' }],
  needsAttention: { conflicts: [], tasks: [] },
  today: { events: [], tasks: [], routines: [] },
  tomorrow: { events: [], tasks: [], preparations: [] },
  confirmed: [],
};

/**
 * Regression coverage for the whole-app-crash bug found during P1
 * verification: a `/family-plan` response with the wrong shape (e.g. an array
 * instead of the expected object) must never reach `setToday()` as if it
 * were valid — `today.conflicts.length` etc. would throw during render
 * with no boundary above this page to contain it, unmounting the whole
 * `/app/*` shell (Sidebar included), not just this page's content.
 */
describe('TodayPage — /family-plan response shape validation', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  function mockEndpoints(planResponse: unknown) {
    mockApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/activity-feed')) return Promise.resolve([]);
      if (path.startsWith('/family-plan')) return Promise.resolve(planResponse);
      return Promise.reject(new Error(`unexpected path in test: ${path}`));
    });
  }

  it('renders the day normally for a well-shaped response', async () => {
    mockEndpoints(VALID_PLAN);
    render(<TodayPage />);

    expect(await screen.findByText('Nada na agenda para hoje')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a contained ErrorState — not a crash — when /family-plan returns an array', async () => {
    mockEndpoints([]); // the exact malformed shape that caused the original crash
    render(<TodayPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível montar o Plano da Família');
    expect(alert).toHaveTextContent('Resposta inesperada do servidor.');
  });

  it('shows the same contained ErrorState when /today is missing required array fields', async () => {
    mockEndpoints({ date: '2026-08-22', people: [], subjects: [], today: { events: [] } });
    render(<TodayPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Resposta inesperada do servidor.');
  });

  it('shows the same contained ErrorState when /family-plan returns null', async () => {
    mockEndpoints(null);
    render(<TodayPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Resposta inesperada do servidor.');
  });
});
