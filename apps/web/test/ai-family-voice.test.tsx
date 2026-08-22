import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AiPage from '@/app/app/ai/page';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiFetch: apiFetchMock }));

function mockApi() {
  apiFetchMock.mockImplementation(async (path, options) => {
    if (path === '/persons') {
      return [
        { id: 'person-1', display_name: 'Miguel Diniz' },
        { id: 'person-2', display_name: 'Ana Liz Diniz' },
      ] as never;
    }
    if (path === '/ai/memory-preferences') {
      return {
        memory_enabled: true,
        proactive_enabled: false,
        explanation_detail: 'BALANCED',
        quiet_hours_start: null,
        quiet_hours_end: null,
      } as never;
    }
    if (path === '/ai/proposals' || path.startsWith('/ai/memory?')) return [] as never;
    if (path === '/ai/ask' && options?.method === 'POST') {
      return { text: 'Tudo organizado.', facts: [], deniedDomains: [] } as never;
    }
    return [] as never;
  });
}

describe('Pergunte à ZELII — family scope and voice', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mockApi();
    delete (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as typeof window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it('shows the whole family as automatic scope and sends no client-selected person ids', async () => {
    const user = userEvent.setup();
    render(<AiPage />);

    expect(await screen.findByText('Toda a família será considerada')).toBeInTheDocument();
    expect(screen.getByText(/Miguel Diniz, Ana Liz Diniz/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Sua pergunta para a ZELII'), 'O que temos amanhã?');
    await user.click(screen.getByRole('button', { name: 'Perguntar' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question: 'O que temos amanhã?' }),
      });
    });
  });

  it('places a Portuguese voice transcript in the input for user review', async () => {
    class FakeSpeechRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        this.onresult?.({ results: [{ 0: { transcript: 'O que a família tem amanhã' }, isFinal: true }] });
        this.onend?.();
      }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    (window as typeof window & { SpeechRecognition?: unknown }).SpeechRecognition = FakeSpeechRecognition;
    const user = userEvent.setup();
    render(<AiPage />);

    await screen.findByText('Toda a família será considerada');
    await user.click(screen.getByRole('button', { name: 'Fazer pergunta por voz' }));

    expect(screen.getByLabelText('Sua pergunta para a ZELII')).toHaveValue('O que a família tem amanhã');
    expect(screen.getByText(/Revise o texto/)).toBeInTheDocument();
  });
});
