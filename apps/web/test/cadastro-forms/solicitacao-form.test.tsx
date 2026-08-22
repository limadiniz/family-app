// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SolicitacaoForm } from '@/components/cadastro-forms/solicitacao-form';

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

describe('SolicitacaoForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('shows an EmptyState when fewer than 2 people exist — a request always goes to someone else', async () => {
    mockApiFetch.mockResolvedValueOnce([{ id: 'p1', display_name: 'Mariana' }]);
    render(<SolicitacaoForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText('Cadastre mais uma pessoa primeiro')).toBeInTheDocument();
  });

  it('shows translated request-type labels, never the raw enum', async () => {
    mockApiFetch.mockResolvedValueOnce(PEOPLE);
    render(<SolicitacaoForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByLabelText('Tipo de solicitação');
    expect(screen.queryByText('PICKUP_REQUEST')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Pedido de busca' })).toBeInTheDocument();
  });

  it('keeps submit disabled until a "requested to" person is chosen, then submits POST /requests', async () => {
    mockApiFetch.mockResolvedValueOnce(PEOPLE);
    mockApiFetch.mockResolvedValueOnce({ id: 'r1' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<SolicitacaoForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    const submit = await screen.findByRole('button', { name: 'Enviar solicitação' });
    expect(submit).toBeDisabled();

    const toGroup = within(screen.getByRole('radiogroup', { name: 'Pedir para quem?' }));
    await user.click(toGroup.getByRole('radio', { name: 'Joana' }));
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const [, opts] = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
    const body = JSON.parse(opts.body);
    expect(body.requestedToPersonId).toBe('p2');
    expect(body.subjectPersonId).toBeUndefined();
  });

  it('shows an ErrorState with retry when loading people fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    render(<SolicitacaoForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar pessoas.');
  });
});
