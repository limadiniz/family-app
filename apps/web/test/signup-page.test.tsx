// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CadastroPage from '@/app/cadastro/page';

const signUp = vi.fn();
const push = vi.fn();

vi.mock('@/lib/supabase-client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { signUp } }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/google-auth-button', () => ({ GoogleButton: () => null }));
vi.mock('@/components/apple-auth-button', () => ({ AppleButton: () => null }));

describe('CadastroPage — e-mail já existente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUp.mockResolvedValue({
      data: { user: { id: 'obfuscated-user' }, session: null },
      error: null,
    });
  });

  it('does not claim that an account was created when Supabase returns an obfuscated user', async () => {
    const user = userEvent.setup();
    render(<CadastroPage />);

    await user.type(screen.getByLabelText('Seu nome'), 'Daniel Diniz');
    await user.type(screen.getByLabelText('E-mail'), 'daniel@example.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-segura');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('heading', { name: 'Verifique sua caixa de entrada' })).toBeInTheDocument();
    expect(screen.queryByText('Conta criada')).not.toBeInTheDocument();
    expect(screen.getByText(/nenhum novo cadastro foi criado/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar na minha conta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Esqueci minha senha' })).toHaveAttribute('href', '/recuperar-senha');
    expect(push).not.toHaveBeenCalled();
  });

  it('lets the person return and use a different e-mail', async () => {
    const user = userEvent.setup();
    render(<CadastroPage />);

    await user.type(screen.getByLabelText('Seu nome'), 'Daniel Diniz');
    await user.type(screen.getByLabelText('E-mail'), 'daniel@example.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-segura');
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));
    await user.click(await screen.findByRole('button', { name: 'Usar outro e-mail' }));

    expect(screen.getByRole('heading', { name: 'Criar sua conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveValue('daniel@example.com');
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });
});
