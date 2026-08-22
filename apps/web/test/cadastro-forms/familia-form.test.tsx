// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FamiliaForm } from '@/components/cadastro-forms/familia-form';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

describe('FamiliaForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('starts with the submit button disabled until a name is entered', async () => {
    const user = userEvent.setup();
    render(<FamiliaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    const submit = screen.getByRole('button', { name: 'Criar família' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Nome da unidade familiar'), 'Família da Ana');
    expect(submit).toBeEnabled();
  });

  it('submits POST /family-units with the entered name and calls onSuccess', async () => {
    mockApiFetch.mockResolvedValueOnce({ id: 'fu1', name: 'Família da Ana' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<FamiliaForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome da unidade familiar'), 'Família da Ana');
    await user.click(screen.getByRole('button', { name: 'Criar família' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockApiFetch).toHaveBeenCalledWith('/family-units', {
      method: 'POST',
      body: JSON.stringify({ name: 'Família da Ana' }),
    });
  });

  it('shows an ErrorState and keeps the form usable when the API call fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network down'));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<FamiliaForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Nome da unidade familiar'), 'Família da Ana');
    await user.click(screen.getByRole('button', { name: 'Criar família' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao criar unidade familiar.');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancelar is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<FamiliaForm onSuccess={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
