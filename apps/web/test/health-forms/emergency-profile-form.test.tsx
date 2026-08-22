// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmergencyProfileForm } from '@/components/health-forms/emergency-profile-form';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

describe('EmergencyProfileForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('starts with one empty contact row and can add another', async () => {
    const user = userEvent.setup();
    render(<EmergencyProfileForm personId="p1" initial={null} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByLabelText('Nome')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '+ Contato' }));
    expect(screen.getAllByLabelText('Nome')).toHaveLength(2);
  });

  it('drops incomplete contact rows (missing name or phone) before submitting', async () => {
    mockApiFetch.mockResolvedValueOnce({});
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<EmergencyProfileForm personId="p1" initial={null} onSaved={onSaved} onCancel={vi.fn()} />);

    // Leave the only contact row blank, then submit.
    await user.click(screen.getByRole('button', { name: 'Salvar informações de emergência' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.emergencyContacts).toEqual([]);
  });

  it('submits a filled contact row and the critical medications list, and calls the emergency-profile endpoint', async () => {
    mockApiFetch.mockResolvedValueOnce({});
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<EmergencyProfileForm personId="p1" initial={null} onSaved={onSaved} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('Medicamentos críticos'), 'Insulina');
    await user.type(screen.getByLabelText('Nome'), 'Joana');
    await user.type(screen.getByLabelText('Relação (opcional)'), 'Mãe');
    await user.type(screen.getByLabelText('Telefone'), '11999990000');
    await user.click(screen.getByRole('button', { name: 'Salvar informações de emergência' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [path, opts] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/persons/p1/emergency-profile');
    const body = JSON.parse(opts.body);
    expect(body.criticalMedications).toEqual(['Insulina']);
    expect(body.emergencyContacts).toEqual([{ name: 'Joana', relationship: 'Mãe', phone: '11999990000' }]);
  });

  it('removes a contact row when there is more than one and "Remover" is clicked', async () => {
    const user = userEvent.setup();
    render(<EmergencyProfileForm personId="p1" initial={null} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '+ Contato' }));
    expect(screen.getAllByLabelText('Nome')).toHaveLength(2);

    await user.click(screen.getAllByRole('button', { name: 'Remover' })[0]);
    expect(screen.getAllByLabelText('Nome')).toHaveLength(1);
  });

  it('shows an ErrorState when the save fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<EmergencyProfileForm personId="p1" initial={null} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Salvar informações de emergência' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao salvar as informações de emergência.');
  });
});
