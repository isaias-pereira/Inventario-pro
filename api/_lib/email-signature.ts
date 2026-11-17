/**
 * Assinatura dos e-mails do SGS-PRO (rebaixa).
 *
 * A assinatura é montada em HTML com tabelas e estilos inline: é o formato
 * que o Outlook, o Thunderbird e o Gmail renderizam igual. As logos podem
 * entrar como imagem (`EMAIL_SIGNATURE_LOGO_URL` /
 * `EMAIL_SIGNATURE_PARTNER_LOGO_URL`); sem elas, o nome da empresa e do
 * parceiro é desenhado em HTML, sem depender de arquivo externo.
 *
 * Tudo é configurável por variável de ambiente — nada fica preso no código:
 *
 * | Variável | Padrão | O que é |
 * |---|---|---|
 * | `EMAIL_SIGNATURE_ENABLED` | `true` | `false` desliga a assinatura |
 * | `EMAIL_SIGNATURE_NAME` | `Isaias Pereira da Silva` | nome do remetente |
 * | `EMAIL_SIGNATURE_ROLE` | `Encarregado(A)` | cargo |
 * | `EMAIL_SIGNATURE_ROLE2` | `F.L.V.` | segunda linha do cargo |
 * | `EMAIL_SIGNATURE_EMAIL` | — | e-mail (usa o remetente da mensagem) |
 * | `EMAIL_SIGNATURE_PHONE1` | `(65) 2128-2558` | telefone fixo |
 * | `EMAIL_SIGNATURE_PHONE2` | `(65) 99336-7428` | celular |
 * | `EMAIL_SIGNATURE_COMPANY` | `COMPER` | empresa |
 * | `EMAIL_SIGNATURE_COMPANY_COLOR` | `#1B4F9C` | cor da marca |
 * | `EMAIL_SIGNATURE_CERTIFIED` | `Empresa Certificada` | selo ao lado da logo |
 * | `EMAIL_SIGNATURE_PARTNER` | — | marca parceira (vazio = sem faixa) |
 * | `EMAIL_SIGNATURE_LOGO_URL` | — | URL da logo da empresa |
 * | `EMAIL_SIGNATURE_PARTNER_LOGO_URL` | — | URL da logo do parceiro |
 * | `EMAIL_SIGNATURE_IMAGE_URL` | — | URL da arte completa da assinatura (PNG) |
 *
 * Quando `EMAIL_SIGNATURE_IMAGE_URL` está configurada, a arte original é
 * usada como imagem — é o jeito mais fiel de reproduzir a assinatura.
 */

export interface SignatureData {
  nome: string;
  cargo: string;
  cargo2: string;
  email: string;
  telefone1: string;
  telefone2: string;
  empresa: string;
  empresaCor: string;
  certificado: string;
  parceiro: string;
  logoUrl: string;
  parceiroLogoUrl: string;
  /** URL da arte completa (PNG) — quando existe, ela é a assinatura. */
  imagemUrl: string;
}

export type SignatureEnv = Record<string, string | undefined>;

function texto(env: SignatureEnv, chave: string, padrao: string): string {
  const value = (env[chave] ?? '').trim();
  return value || padrao;
}

/** Dados da assinatura (com os padrões do SGS-PRO). */
export function signatureData(env: SignatureEnv = process.env): SignatureData {
  return {
    nome: texto(env, 'EMAIL_SIGNATURE_NAME', 'Isaias Pereira da Silva'),
    cargo: texto(env, 'EMAIL_SIGNATURE_ROLE', 'Encarregado(A)'),
    cargo2: texto(env, 'EMAIL_SIGNATURE_ROLE2', 'F.L.V.'),
    email: (env.EMAIL_SIGNATURE_EMAIL ?? '').trim(),
    telefone1: texto(env, 'EMAIL_SIGNATURE_PHONE1', '(65) 2128-2558'),
    telefone2: texto(env, 'EMAIL_SIGNATURE_PHONE2', '(65) 99336-7428'),
    empresa: texto(env, 'EMAIL_SIGNATURE_COMPANY', 'COMPER'),
    empresaCor: texto(env, 'EMAIL_SIGNATURE_COMPANY_COLOR', '#1B4F9C'),
    certificado: texto(env, 'EMAIL_SIGNATURE_CERTIFIED', 'Empresa Certificada'),
    // A marca parceira só aparece quando configurada (não inventa texto).
    parceiro: (env.EMAIL_SIGNATURE_PARTNER ?? '').trim(),
    logoUrl: (env.EMAIL_SIGNATURE_LOGO_URL ?? '').trim(),
    parceiroLogoUrl: (env.EMAIL_SIGNATURE_PARTNER_LOGO_URL ?? '').trim(),
    imagemUrl: (env.EMAIL_SIGNATURE_IMAGE_URL ?? '').trim(),
  };
}

/** A assinatura está ativa? (por padrão, sim) */
export function signatureEnabled(env: SignatureEnv = process.env): boolean {
  return (env.EMAIL_SIGNATURE_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

/** Escapa o texto para ir dentro do HTML do e-mail (entidades numéricas). */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&#38;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/"/g, '&#34;');
}

/** Bloco da logo da empresa (imagem quando há URL; wordmark em HTML caso contrário). */
function logoEmpresa(data: SignatureData): string {
  if (data.logoUrl) {
    return `<img src="${escapeHtml(data.logoUrl)}" alt="${escapeHtml(data.empresa)}" width="160" style="display:block;border:0;height:auto;" />`;
  }
  // Wordmark: o nome da marca em caixa alta, na cor da empresa, com um
  // traço fino embaixo (no lugar da arte original, que é uma imagem).
  return (
    '<span style="display:inline-block;text-align:right;">' +
    `<span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;` +
    `letter-spacing:4px;line-height:1;color:${escapeHtml(data.empresaCor)};">${escapeHtml(data.empresa)}</span>` +
    `<span style="display:block;width:100%;min-width:110px;height:3px;margin-top:5px;` +
    `background:${escapeHtml(data.empresaCor)};font-size:0;line-height:0;">&#160;</span>` +
    '</span>'
  );
}

/** Selo circular de "Empresa Certificada". */
function seloCertificado(): string {
  return (
    '<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;' +
    'border:1px solid #9ca3af;border-radius:9px;color:#1b4f9c;font-size:11px;font-weight:bold;' +
    'margin-right:6px;vertical-align:-2px;">&#10003;</span>'
  );
}

/**
 * Bloco da marca parceira (imagem quando há URL; texto empilhado caso contrário).
 * Na faixa azul o texto é branco — por isso a cor é paramétrica.
 */
function logoParceiro(data: SignatureData, cor: string = '#ffffff'): string {
  if (data.parceiroLogoUrl) {
    return `<img src="${escapeHtml(data.parceiroLogoUrl)}" alt="${escapeHtml(data.parceiro)}" width="130" style="display:block;border:0;height:auto;margin-left:auto;" />`;
  }
  // "OFER TOPERA" empilhado, como na arte: uma linha por palavra.
  const palavras = data.parceiro.split(/\s+/).filter(Boolean);
  const linhas = palavras.map((palavra) =>
    `<span style="display:block;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;` +
    `letter-spacing:3px;line-height:1.25;color:${cor};">${escapeHtml(palavra)}</span>`,
  ).join('');
  return `<span style="display:inline-block;text-align:right;">${linhas}</span>`;
}

/**
 * Assinatura em HTML (tabelas + estilos inline: funciona no Outlook).
 *
 * Duas formas:
 * - com `EMAIL_SIGNATURE_IMAGE_URL`: a arte original (PNG) entra como imagem
 *   — é a reprodução mais fiel da assinatura enviada;
 * - sem ela: o layout é remontado em HTML (contato à esquerda, marca e selo
 *   à direita, faixa da marca parceira na base, quando configurada).
 *
 * O e-mail do remetente tem prioridade sobre `EMAIL_SIGNATURE_EMAIL`: quem
 * envia da própria caixa (`email_envio`) mostra o endereço dessa caixa.
 */
export function buildSignatureHtml(
  options: { email?: string | null } = {},
  env: SignatureEnv = process.env,
): string {
  const data = signatureData(env);
  const email = (options.email ?? '').trim() || data.email;
  const cor = escapeHtml(data.empresaCor);
  const linhas: string[] = [];

  // Arte original: a assinatura é a própria imagem (400×170 na arte atual).
  if (data.imagemUrl) {
    return (
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">' +
      '<tr><td style="padding:0;">' +
      `<img src="${escapeHtml(data.imagemUrl)}" alt="${escapeHtml(data.nome)} — ${escapeHtml(data.empresa)}" ` +
      'width="400" style="display:block;border:0;width:auto;max-width:100%;height:auto;' +
      'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1f2937;" />' +
      '</td></tr></table>'
    );
  }

  if (email) {
    linhas.push(`<div style="color:#1d4ed8;line-height:1.5;">${escapeHtml(email)}</div>`);
  }
  if (data.telefone1) {
    linhas.push(`<div style="line-height:1.5;">${escapeHtml(data.telefone1)}</div>`);
  }
  if (data.telefone2) {
    linhas.push(`<div style="line-height:1.5;">${escapeHtml(data.telefone2)}</div>`);
  }

  const faixaParceira = data.parceiro || data.parceiroLogoUrl;

  return [
    // ── Bloco principal: contato à esquerda, marca à direita ──
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1f2937;max-width:520px;">',
    '<tr>',
    '<td style="padding:0 20px 0 0;vertical-align:top;width:56%;">',
    `<div style="font-size:14px;font-weight:bold;color:#111827;line-height:1.5;">${escapeHtml(data.nome)}</div>`,
    data.cargo ? `<div style="color:#374151;line-height:1.5;">${escapeHtml(data.cargo)}</div>` : '',
    data.cargo2 ? `<div style="color:#374151;line-height:1.5;">${escapeHtml(data.cargo2)}</div>` : '',
    ...linhas,
    '</td>',
    '<td style="padding:0;vertical-align:top;text-align:right;width:44%;">',
    logoEmpresa(data),
    data.certificado
      ? `<div style="margin-top:8px;color:#374151;font-size:11px;line-height:1.4;">${seloCertificado()}${escapeHtml(data.certificado)}</div>`
      : '',
    '</td>',
    '</tr>',
    // ── Separador ──
    '<tr>',
    '<td colspan="2" style="padding:12px 0 0;">',
    '<div style="border-top:1px solid #d1d5db;font-size:0;line-height:0;">&#160;</div>',
    '</td>',
    '</tr>',
    // ── Faixa azul com a marca parceira (só quando ela existe) ──
    faixaParceira
      ? '<tr>' +
        `<td colspan="2" bgcolor="${cor}" style="padding:9px 14px;background:${cor};text-align:right;">` +
        logoParceiro(data, '#ffffff') +
        '</td></tr>'
      : '',
    '</table>',
  ].join('');
}

/** Assinatura em texto puro (para a parte `text/plain` do e-mail). */
export function buildSignatureText(
  options: { email?: string | null } = {},
  env: SignatureEnv = process.env,
): string {
  const data = signatureData(env);
  const email = (options.email ?? '').trim() || data.email;
  const linhas = [
    data.nome,
    data.cargo,
    data.cargo2,
    email,
    data.telefone1,
    data.telefone2,
  ].filter(Boolean);
  return linhas.join('\n');
}
