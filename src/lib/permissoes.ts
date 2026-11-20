import type { UserRole } from '@/contexts/AuthContext';

/** Telas do SGS-PRO (a navegação interna não muda a URL). */
export type ViewType =
  | 'consulta'
  | 'inventario'
  | 'base'
  | 'usuarios'
  | 'metas'
  | 'validade'
  | 'rebaixa'
  | 'add-produto'
  | 'email'
  | 'revisao-secoes'
  | 'guias';

/**
 * Áreas administrativas que a conta do dono do projeto também acessa.
 *
 * O dono mantém o perfil `encarregado` — e com ele o escopo da própria loja —
 * mas recebe estas quatro exceções. Os demais encarregados continuam sem elas.
 */
export const AREAS_EXTRAS_DONO: readonly ViewType[] = [
  'consulta',
  'metas',
  'base',
  'revisao-secoes',
];

/** Itens extras que o dono vê na barra principal (os outros ficam no menu). */
export const NAV_EXTRAS_DONO: readonly ViewType[] = ['consulta', 'metas'];

/** Regra de acesso às telas (espelha as checagens do servidor). */
export function podeAcessarView(
  role: UserRole | null,
  dono: boolean,
  view: ViewType,
): boolean {
  if (role === 'admin') return true;
  if (role === 'encarregado') {
    if (dono && AREAS_EXTRAS_DONO.includes(view)) return true;
    return view === 'validade' || view === 'rebaixa' || view === 'email'
      || view === 'inventario' || view === 'add-produto' || view === 'usuarios' || view === 'guias';
  }
  if (role === 'user') return view === 'validade';
  if (role === 'promotor' || role === 'col_validade') return view === 'validade';
  return false;
}

/** Tela inicial do perfil (a exceção do dono não muda o pouso do encarregado). */
export function viewInicial(role: UserRole | null): ViewType {
  if (role === 'encarregado' || role === 'user' || role === 'promotor' || role === 'col_validade') {
    return 'validade';
  }
  return 'consulta';
}
