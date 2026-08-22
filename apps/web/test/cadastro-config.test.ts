import { describe, expect, it } from 'vitest';
import { CADASTRO_CATEGORIES, getCadastroCategory } from '../src/lib/cadastro-config';

describe('cadastro-config', () => {
  it('has exactly the 6 categories from the master prompt (família, pessoa, cuidador, compromisso, tarefa, solicitação)', () => {
    expect(CADASTRO_CATEGORIES.map((c) => c.slug).sort()).toEqual(
      ['familia', 'pessoa', 'cuidador', 'compromisso', 'tarefa', 'solicitacao'].sort(),
    );
  });

  it('every category has a non-empty label, description and icon', () => {
    for (const c of CADASTRO_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
      expect(c.icon).toBeTruthy();
    }
  });

  it('getCadastroCategory finds a known slug and returns undefined for an unknown one', () => {
    expect(getCadastroCategory('pessoa')?.label).toBe('Pessoa');
    expect(getCadastroCategory('nao-existe')).toBeUndefined();
  });
});
