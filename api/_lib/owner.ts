import type { JwtPayload } from './jwt.js';

/**
 * Conta do dono do projeto.
 *
 * O dono mantém o perfil `encarregado` — continua enxergando apenas a operação
 * da própria loja — mas recebe acesso excepcional às áreas administrativas de
 * **Consulta, Metas, Base de Dados e Revisão de Seções**. A exceção é
 * individual: os demais encarregados continuam sem essas áreas.
 *
 * A identificação usa o `username` do token (a claim `dono` é assinada no
 * login e serve para deixar a decisão explícita no payload). A lista pode ser
 * ajustada pela env `OWNER_USERNAMES` (separada por vírgula); sem ela, vale a
 * conta padrão do dono do projeto.
 */
export const DONO_PADRAO = 'Isaias';

/** Nomes (normalizados) das contas com acesso excepcional de dono. */
export function donosDoProjeto(): string[] {
  const bruto = process.env.OWNER_USERNAMES?.trim();
  return (bruto ? bruto : DONO_PADRAO)
    .split(',')
    .map((nome) => nome.trim().toLowerCase())
    .filter(Boolean);
}

/** `true` quando o username é de uma conta do dono (comparação sem caixa). */
export function isDonoUsername(username: unknown): boolean {
  if (typeof username !== 'string') return false;
  const nome = username.trim().toLowerCase();
  return nome.length > 0 && donosDoProjeto().includes(nome);
}

type PayloadAcesso = Pick<JwtPayload, 'sub' | 'role' | 'dono'>;

/**
 * O dono é identificado pela claim assinada no token ou, para tokens emitidos
 * antes desta feature, pelo próprio username (sem depender de novo login para
 * as checagens do servidor).
 */
export function isDono(payload: PayloadAcesso | null | undefined): boolean {
  if (!payload) return false;
  if (payload.dono === true) return true;
  return isDonoUsername(payload.sub);
}

/** Acesso administrativo: admin do sistema ou a conta do dono do projeto. */
export function isAdminOrDono(payload: PayloadAcesso | null | undefined): boolean {
  return payload?.role === 'admin' || isDono(payload);
}
