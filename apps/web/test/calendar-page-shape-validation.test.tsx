// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CalendarPage from '@/app/app/calendar/page';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

const PEOPLE = [{ id: 'p1', display_name: 'Mariana', person_type: 'MINOR' }];

describe('CalendarPage — /calendar-events response shape validation', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  function mockEndpoints(eventsResponse: unknown) {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/persons') return Promise.resolve(PEOPLE);
      if (path.startsWith('/calendar-events')) return Promise.resolve(eventsResponse);
      return Promise.reject(new Error(`unexpected path in test: ${path}`));
    });
  }

  it('groups a well-shaped event list by day and renders it', async () => {
    mockEndpoints([
      { id: 'e1', title: 'Consulta', category: 'HEALTH', starts_at: new Date().toISOString(), ends_at: null, subject_person_id: 'p1', responsible_person_id: null, notes: null },
    ]);
    render(<CalendarPage />);

    expect(await screen.findByText('Consulta')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a contained ErrorState — not a crash — when /calendar-events returns an object instead of an array', async () => {
    mockEndpoints({ not: 'an array' });
    render(<CalendarPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar a agenda');
    expect(alert).toHaveTextContent('Resposta inesperada do servidor.');
  });

  it('shows the same contained ErrorState when /calendar-events returns null', async () => {
    mockEndpoints(null);
    render(<CalendarPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Resposta inesperada do servidor.');
  });
});
