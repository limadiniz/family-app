// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompromissoForm } from '@/components/cadastro-forms/compromisso-form';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

const PEOPLE = [
  { id: 'p1', display_name: 'Mariana' },
  { id: 'p2', display_name: 'Joana' },
];

describe('CompromissoForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('shows an EmptyState when there are no people yet', async () => {
    mockApiFetch.mockResolvedValueOnce([]);
    render(<CompromissoForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText('Cadastre uma pessoa primeiro')).toBeInTheDocument();
  });

  it('pre-selects the first person as subject and disables submit until title and start time are filled', async () => {
    mockApiFetch.mockResolvedValueOnce(PEOPLE);
    render(<CompromissoForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    const subjectGroup = within(await screen.findByRole('radiogroup', { name: 'Sobre quem é?' }));
    expect(subjectGroup.getByRole('radio', { name: 'Mariana' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Criar compromisso' })).toBeDisabled();
  });

  it('submits POST /calendar-events with title, chosen subject, ISO start time and category (translated, not raw)', async () => {
    mockApiFetch.mockResolvedValueOnce(PEOPLE);
    mockApiFetch.mockResolvedValueOnce({ id: 'e1' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<CompromissoForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(await screen.findByLabelText('Título'), 'Consulta com o pediatra');
    await user.type(screen.getByLabelText('Início'), '2026-09-01T10:00');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'HEALTH');

    // The <option> text is the translated label, never the raw enum.
    expect(screen.getByRole('option', { name: 'Saúde' })).toBeInTheDocument();
    expect(screen.queryByText('HEALTH')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Criar compromisso' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const [, opts] = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
    const body = JSON.parse(opts.body);
    expect(body.title).toBe('Consulta com o pediatra');
    expect(body.subjectPersonId).toBe('p1');
    expect(body.category).toBe('HEALTH');
    expect(new Date(body.startsAt).toISOString()).toBe(body.startsAt);
  });

  it('shows an ErrorState with retry when loading people fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    render(<CompromissoForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar pessoas.');
  });
});
