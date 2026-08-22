// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/app/settings/page';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiFetch }));

describe('SettingsPage — edição do próprio nome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockResolvedValueOnce({
      id: 'person-luana',
      displayName: 'Luana Diniz',
      email: 'luana@example.com',
    });
  });

  it('loads the current profile and saves a new display name', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const nameInput = await screen.findByLabelText('Seu nome');
    expect(nameInput).toHaveValue('Luana Diniz');
    expect(screen.getByLabelText('E-mail da conta')).toHaveValue('luana@example.com');

    apiFetch.mockResolvedValueOnce({
      id: 'person-luana',
      displayName: 'Luana Lima Diniz',
      email: 'luana@example.com',
    });
    await user.clear(nameInput);
    await user.type(nameInput, 'Luana Lima Diniz');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/accounts/me/profile');
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/accounts/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({ displayName: 'Luana Lima Diniz' }),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Nome atualizado com sucesso.');
  });
});
