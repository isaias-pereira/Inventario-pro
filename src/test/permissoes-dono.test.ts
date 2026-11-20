/**
 * Regra de telas do dono do projeto (frontend).
 *
 * A conta continua `encarregado` e mantém todas as permissões do perfil; o que
 * muda é o acesso excepcional a Consulta, Metas, Base de Dados e Revisão de
 * Seções. O encarregado comum não ganha nada.
 */
import { describe, expect, it } from 'vitest';
import {
  AREAS_EXTRAS_DONO,
  NAV_EXTRAS_DONO,
  podeAcessarView,
  viewInicial,
} from '../lib/permissoes';

describe('acesso do dono do projeto', () => {
  it('libera as quatro áreas extras para o encarregado marcado como dono', () => {
    for (const view of AREAS_EXTRAS_DONO) {
      expect(podeAcessarView('encarregado', true, view)).toBe(true);
    }
  });

  it('não libera nenhuma das áreas extras para outro encarregado', () => {
    for (const view of AREAS_EXTRAS_DONO) {
      expect(podeAcessarView('encarregado', false, view)).toBe(false);
    }
  });

  it('mantém as permissões normais do encarregado', () => {
    for (const view of ['validade', 'rebaixa', 'email', 'inventario', 'add-produto', 'usuarios', 'guias'] as const) {
      expect(podeAcessarView('encarregado', true, view)).toBe(true);
      expect(podeAcessarView('encarregado', false, view)).toBe(true);
    }
  });

  it('não muda o menu principal do encarregado comum', () => {
    expect(NAV_EXTRAS_DONO).toEqual(['consulta', 'metas']);
    expect(podeAcessarView('encarregado', false, 'consulta')).toBe(false);
    expect(podeAcessarView('encarregado', false, 'metas')).toBe(false);
  });

  it('o admin continua com acesso total (a claim de dono não é necessária)', () => {
    for (const view of ['consulta', 'metas', 'base', 'revisao-secoes'] as const) {
      expect(podeAcessarView('admin', false, view)).toBe(true);
    }
  });

  it('os demais perfis continuam restritos à Validade', () => {
    for (const role of ['user', 'promotor', 'col_validade'] as const) {
      expect(podeAcessarView(role, false, 'validade')).toBe(true);
      expect(podeAcessarView(role, false, 'consulta')).toBe(false);
      expect(podeAcessarView(role, false, 'base')).toBe(false);
    }
  });

  it('o encarregado continua pousando na Validade', () => {
    expect(viewInicial('encarregado')).toBe('validade');
    expect(viewInicial('admin')).toBe('consulta');
  });
});
