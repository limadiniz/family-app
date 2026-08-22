// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CuidadorForm } from '@/components/cadastro-forms/cuidador-form';

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

describe('CuidadorForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('shows an EmptyState when fewer than 2 people exist', async () => {
    mockApiFetch.mockResolvedValueOnce([{ id: 'p1', display_name: 'Mariana' }]);
    render(<CuidadorForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByText('Cadastre mais uma pessoa primeiro')).toBeInTheDocument();
  });

  it('excludes the chosen subject from the caregiver picker, and clears an already-picked caregiver if it becomes the new subject', async () => {
    mockApiFetch.mockResolvedValueOnce(PEOPLE);
    const user = userEvent.setup();
    render(<CuidadorForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    const subjectGroup = within(await screen.findByRole('radiogroup', { name: 'Quem recebe o cuidado?' }));
    const caregiverGroup = within(screen.getByRole('radiogroup', { name: 'Quem vai cuidar?' }));

    // Pick Joana as caregiver first.
    await user.click(caregiverGroup.getByRole('radio', { name: 'Joana' }));
    expect(caregiverGroup.getByRole('radio', { name: 'Joana' })).toHaveAttribute('aria-checked', 'true');

    // Now pick Joana as the subject too — she must disappear from the caregiver options,
    // and the previous caregiver selection must be cleared (can't be your own caregiver).
    await user.click(subjectGroup.getByRole('radio', { name: 'Joana' }));
    expect(caregiverGroup.queryByRole('radio', { name: 'Joana' })).not.toBeInTheDocument();
  });

  it('submits POST /care-network/members with the selected subject, caregiver, and toggled capabilities', async () => {
    mockApiFetch.mockResolvedValueOnce(PEOPLE);
    mockApiFetch.mockResolvedValueOnce({ id: 'm1', status: 'PENDING' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<CuidadorForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.click(within(await screen.findByRole('radiogroup', { name: 'Quem recebe o cuidado?' })).getByRole('radio', { name: 'Mariana' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Quem vai cuidar?' })).getByRole('radio', { name: 'Joana' }));
    await user.click(screen.getByLabelText('Administrar medicação registrada'));

    await user.click(screen.getByRole('button', { name: 'Adicionar cuidador' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const [, opts] = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
    const body = JSON.parse(opts.body);
    expect(body.subjectPersonId).toBe('p1');
    expect(body.personId).toBe('p2');
    expect(body.capabilities).toEqual(['CAN_ADMINISTER_REGISTERED_MEDICATION']);
  });

  it('shows an ErrorState with retry when loading people fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    render(<CuidadorForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar pessoas.');
  });
});
