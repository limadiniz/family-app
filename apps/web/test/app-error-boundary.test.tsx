// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppSegmentError from '@/app/app/error';

describe('AppSegmentError (the /app segment error boundary)', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The component intentionally logs every error it catches (§ diagnosability) —
    // expected noise for this whole file, not a real failure signal.
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders a contained error message instead of a blank/crashed page', () => {
    render(<AppSegmentError error={new Error('boom')} reset={vi.fn()} />);

    expect(screen.getByText('Algo deu errado nesta página')).toBeInTheDocument();
    expect(screen.getByText(/o menu continua funcionando normalmente/i)).toBeInTheDocument();
  });

  it('calls reset() when "Tentar de novo" is clicked, letting Next.js retry the segment', async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<AppSegmentError error={new Error('boom')} reset={reset} />);

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('logs the underlying error to the console for diagnosability, without leaking it into the UI copy', () => {
    const err = new Error('Resposta inesperada do servidor.');
    render(<AppSegmentError error={err} reset={vi.fn()} />);

    expect(consoleSpy).toHaveBeenCalledWith('Erro não tratado em /app:', err);
    expect(screen.queryByText('Resposta inesperada do servidor.')).not.toBeInTheDocument();
  });
});
