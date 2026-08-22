// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HealthProfileForm } from '@/components/health-forms/health-profile-form';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

describe('HealthProfileForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('pre-fills fields from `initial` when editing an existing profile', () => {
    render(
      <HealthProfileForm
        personId="p1"
        initial={{ blood_type: 'O+', allergies: ['Amendoim', 'Poeira'], conditions: [], health_plan_name: 'Amil', health_plan_card_number: '123' }}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Tipo sanguíneo')).toHaveValue('O+');
    expect(screen.getByLabelText('Alergias')).toHaveValue('Amendoim, Poeira');
    expect(screen.getByLabelText('Plano de saúde')).toHaveValue('Amil');
  });

  it('submits a comma-separated allergies field as a parsed array, trimming whitespace', async () => {
    mockApiFetch.mockResolvedValueOnce({ blood_type: 'O+', allergies: ['Amendoim', 'Poeira'], conditions: [], health_plan_name: null, health_plan_card_number: null });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<HealthProfileForm personId="p1" initial={null} onSaved={onSaved} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Tipo sanguíneo'), 'O+');
    await user.type(screen.getByLabelText('Alergias'), 'Amendoim,  Poeira ');
    await user.click(screen.getByRole('button', { name: 'Salvar perfil de saúde' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/persons/p1/health-profile');
    const body = JSON.parse(opts.body);
    expect(body.allergies).toEqual(['Amendoim', 'Poeira']);
    expect(body.bloodType).toBe('O+');
  });

  it('shows an ErrorState and does not call onSaved when the save fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<HealthProfileForm personId="p1" initial={null} onSaved={onSaved} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Salvar perfil de saúde' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao salvar o perfil de saúde.');
    expect(onSaved).not.toHaveBeenCalled();
  });
});
