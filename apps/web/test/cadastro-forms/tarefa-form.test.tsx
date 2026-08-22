// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TarefaForm } from '@/components/cadastro-forms/tarefa-form';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@/lib/api-client';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

const PEOPLE = [{ id: 'p1', display_name: 'Mariana' }];

describe('TarefaForm', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('does not require any person to exist — the subject person picker is entirely optional', async () => {
    mockApiFetch.mockResolvedValueOnce([]);
    render(<TarefaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByLabelText('O que precisa ser feito?');
    expect(screen.queryByText('Sobre quem é? (opcional)')).not.toBeInTheDocument();
  });

  it('submits POST /tasks with just a title when nothing else is filled', async () => {
    mockApiFetch.mockResolvedValueOnce([]);
    mockApiFetch.mockResolvedValueOnce({ id: 't1' });
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<TarefaForm onSuccess={onSuccess} onCancel={vi.fn()} />);

    await user.type(await screen.findByLabelText('O que precisa ser feito?'), 'Levar Mariana à escola');
    await user.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const [, opts] = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ title: 'Levar Mariana à escola', description: undefined, dueAt: undefined, priority: 'MEDIUM', subjectPersonId: undefined });
  });

  it('toggles the subject person picker off (deselects) on a second click of the same person', async () => {
    mockApiFetch.mockResolvedValueOnce(PEOPLE);
    mockApiFetch.mockResolvedValueOnce({ id: 't2' });
    const user = userEvent.setup();
    render(<TarefaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    await user.type(await screen.findByLabelText('O que precisa ser feito?'), 'Tarefa');
    const group = within(screen.getByRole('radiogroup', { name: 'Sobre quem é? (opcional)' }));
    const marianaRadio = group.getByRole('radio', { name: 'Mariana' });

    await user.click(marianaRadio);
    expect(marianaRadio).toHaveAttribute('aria-checked', 'true');
    await user.click(marianaRadio);
    expect(marianaRadio).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Criar tarefa' }));
    await waitFor(() => {
      const [, opts] = mockApiFetch.mock.calls[mockApiFetch.mock.calls.length - 1];
      expect(JSON.parse(opts.body).subjectPersonId).toBeUndefined();
    });
  });

  it('shows an ErrorState with retry when loading people fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    render(<TarefaForm onSuccess={vi.fn()} onCancel={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao carregar pessoas.');
  });
});
