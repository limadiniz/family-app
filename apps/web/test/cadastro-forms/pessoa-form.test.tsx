// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PessoaForm } from '@/components/cadastro-forms/pessoa-form';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

const ONE_UNIT = [{ family_unit_id: 'fu1', family_units: { id: 'fu1', name: 'Família da Ana' } }];
const TWO_UNITS = [
  { family_unit_id: 'fu1', family_units: { id: 'fu1', name: 'Família da Ana' } },
  { family_unit_id: 'fu2', family_units: { id: 'fu2', name: 'Família do Bruno' } },
];

describe('PessoaForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('shows an EmptyState guiding the user to create a family first when there are zero family units', async () => {
    mockApiFetch.mockResolvedValueOnce([]);
    render(<PessoaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText('Crie uma família primeiro')).toBeInTheDocument();
  });

  it('auto-selects the only family unit and does not show the unit picker when there is just one', async () => {
    mockApiFetch.mockResolvedValueOnce(ONE_UNIT);
    render(<PessoaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByLabelText('Nome');
    expect(screen.queryByLabelText('Unidade familiar')).not.toBeInTheDocument();
  });

  it('shows the unit picker when there is more than one family unit, and submits the chosen one', async () => {
    mockApiFetch.mockResolvedValueOnce(TWO_UNITS);
    mockApiFetch.mockResolvedValueOnce({ id: 'p1' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<PessoaForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(await screen.findByLabelText('Nome'), 'Pedro');
    await user.selectOptions(screen.getByLabelText('Unidade familiar'), 'fu2');
    await user.click(screen.getByRole('button', { name: 'Adicionar pessoa' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenLastCalledWith('/dependents', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Pedro', birthDate: undefined, familyUnitId: 'fu2' }),
    });
  });

  it('omits birthDate when left blank, but sends it (creating a minor) when filled', async () => {
    mockApiFetch.mockResolvedValueOnce(ONE_UNIT);
    mockApiFetch.mockResolvedValueOnce({ id: 'p2' });
    const user = userEvent.setup();
    render(<PessoaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await user.type(await screen.findByLabelText('Nome'), 'Mariana');
    const dateInput = screen.getByLabelText('Data de nascimento (opcional)');
    await user.type(dateInput, '2015-04-20');
    await user.click(screen.getByRole('button', { name: 'Adicionar pessoa' }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenLastCalledWith('/dependents', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Mariana', birthDate: '2015-04-20', familyUnitId: 'fu1' }),
    }));
  });

  it('shows an ErrorState with retry when loading family units fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    render(<PessoaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar famílias.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
