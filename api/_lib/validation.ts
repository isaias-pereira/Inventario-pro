/**
 * Schemas de validação (Zod) para as Serverless Functions.
 *
 * Centraliza a validação de entrada, evita Mass Assignment e dá
 * mensagens de erro consistentes. Cada action do backend deve ter
 * seu schema aqui e validar no início do handler.
 */

import { z } from 'zod';

/** Helpers comuns. */
const nonEmptyString = z.string().trim().min(1);
const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();
const optionalString = z.string().trim().optional();
const emailSchema = z.string().trim().email().toLowerCase().max(254);
const phoneSchema = z.string().trim().regex(/^\+?[1-9]\d{1,14}$/); // E.164

// ──────────────────────────────────────────────────────────────
// auth (action login)
// ──────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  username: nonEmptyString.max(100),
  password: nonEmptyString.max(255),
  // Opcional: token do Turnstile/hCaptcha
  turnstileToken: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ──────────────────────────────────────────────────────────────
// manage-users
// ──────────────────────────────────────────────────────────────
export const userRoleSchema = z.enum(['admin', 'user', 'promotor', 'encarregado', 'col_validade']);

export const addUserSchema = z.object({
  action: z.literal('add'),
  newUser: z.object({
    username: nonEmptyString.max(100).regex(/^[a-zA-Z0-9_.-]+$/),
    password: nonEmptyString.min(8).max(128), // política mínima
    role: userRoleSchema.default('user'),
    loja: positiveInt.optional(), // só admin; encarregado ignora
    encarregados: z.array(nonEmptyString).optional(), // só admin
  }),
});

export const updateUserSchema = z.object({
  action: z.literal('update'),
  newUser: z.object({
    username: nonEmptyString.max(100),
    role: userRoleSchema,
    password: nonEmptyString.min(8).max(128).optional(), // opcional: só se for trocar
    loja: positiveInt.optional(),
    encarregados: z.array(nonEmptyString).optional(),
  }),
});

export const deleteUserSchema = z.object({
  action: z.literal('delete'),
  username: nonEmptyString.max(100),
});

export const switchLojaSchema = z.object({
  action: z.literal('switch_loja'),
  loja: positiveInt,
});

export const listLojasSchema = z.object({
  action: z.literal('list_lojas'),
});

export const listUsersSchema = z.object({
  action: z.literal('list'),
});

export const listEncarregadosSchema = z.object({
  action: z.literal('list_encarregados'),
});

export type AddUserInput = z.infer<typeof addUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;
export type SwitchLojaInput = z.infer<typeof switchLojaSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type ListEncarregadosInput = z.infer<typeof listEncarregadosSchema>;
export type ListLojasInput = z.infer<typeof listLojasSchema>;

// ──────────────────────────────────────────────────────────────
// manage-validade
// ──────────────────────────────────────────────────────────────
export const validadeActionSchema = z.enum([
  'list',
  'list_all',
  'add',
  'update',
  'remove',
  'clear',
  'notifications',
  'consulta_periodo',
  'whatsapp_config',
  'whatsapp_preview',
  'whatsapp_send',
  'whatsapp_history',
]);

export const addValidadeSchema = z.object({
  action: z.literal('add'),
  codigo: z.union([nonEmptyString, positiveInt]),
  quantidade: positiveInt,
  validade: z.string().trim().optional(), // ISO date ou vazio para KG
  motivo: z.enum(['Excesso', 'Qualidade', 'Excesso/qualidade']).optional(),
  lote: z.string().trim().optional(),
});

export const updateValidadeSchema = z.object({
  action: z.literal('update'),
  id: positiveInt,
  quantidade: positiveInt.optional(),
  validade: z.string().trim().optional(),
  motivo: z.enum(['Excesso', 'Qualidade', 'Excesso/qualidade']).optional(),
  lote: z.string().trim().optional(),
  status: z.boolean().optional(),
});

export const removeValidadeSchema = z.object({
  action: z.literal('remove'),
  id: positiveInt,
});

export const clearValidadeSchema = z.object({
  action: z.literal('clear'),
});

export const listValidadeSchema = z.object({
  action: z.literal('list'),
  filtro: z.enum(['all', 'hoje', 'vencidos', 'proximos']).optional(),
});

export const consultaPeriodoSchema = z.object({
  action: z.literal('consulta_periodo'),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incluir_vencidos: z.boolean().optional(),
  coletado_por: z.string().trim().optional(),
});

export type AddValidadeInput = z.infer<typeof addValidadeSchema>;
export type UpdateValidadeInput = z.infer<typeof updateValidadeSchema>;
export type RemoveValidadeInput = z.infer<typeof removeValidadeSchema>;
export type ClearValidadeInput = z.infer<typeof clearValidadeSchema>;
export type ListValidadeInput = z.infer<typeof listValidadeSchema>;
export type ConsultaPeriodoInput = z.infer<typeof consultaPeriodoSchema>;

// ──────────────────────────────────────────────────────────────
// manage-inventory
// ──────────────────────────────────────────────────────────────
export const inventoryActionSchema = z.enum([
  'list',
  'list_lotes',
  'get_lote',
  'add',
  'update',
  'remove',
  'clear',
  'rename',
  'suspend',
  'resume',
  'finalize',
  'list_audit',
]);

export const addInventorySchema = z.object({
  action: z.literal('add'),
  codigo: z.union([nonEmptyString, positiveInt]),
  quantidade: positiveInt,
  lote_numero: nonEmptyString.max(50),
  validade: z.string().trim().optional(),
  embalagem: z.string().trim().optional(),
});

export type AddInventoryInput = z.infer<typeof addInventorySchema>;

// ──────────────────────────────────────────────────────────────
// manage-rebaixa
// ──────────────────────────────────────────────────────────────
export const rebaixaActionSchema = z.enum([
  'list',
  'add',
  'add_many',
  'update',
  'remove',
  'clear',
  'mark_sent',
  'history',
  'history_items',
]);

export const addRebaixaSchema = z.object({
  action: z.literal('add'),
  validade_id: positiveInt,
  preco_sugerido: z.number().nonnegative().optional(), // servidor recalcula se não vier
  preco_rebaixa: z.number().nonnegative().optional(),
});

export type AddRebaixaInput = z.infer<typeof addRebaixaSchema>;

// ──────────────────────────────────────────────────────────────
// manage-metas
// ──────────────────────────────────────────────────────────────
export const metasActionSchema = z.enum(['list', 'upsert', 'remove']);

export const upsertMetaSchema = z.object({
  action: z.literal('upsert'),
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  dia: z.number().int().min(1).max(31),
  meta: z.number().nonnegative(),
});

export type UpsertMetaInput = z.infer<typeof upsertMetaSchema>;

// ──────────────────────────────────────────────────────────────
// manage-emails
// ──────────────────────────────────────────────────────────────
export const emailActionSchema = z.enum([
  'list',
  'add',
  'update',
  'remove',
  'setDefault',
  'setDefaults',
  'my_account',
  'save_account',
  'list_accounts',
  'update_account',
  'remove_account',
  // Contatos pessoais (encarregado gerencia os seus)
  'add_pessoal',
  'update_pessoal',
  'remove_pessoal',
  'setDefault_pessoal',
]);

export const addEmailPadraoSchema = z.object({
  action: z.literal('add'),
  email: emailSchema,
  padrao: z.boolean().optional(),
  ativo: z.boolean().optional(),
});

/** Schema para contatos pessoais (encarregado gerencia os seus) */
export const emailPessoalSchema = z.object({
  action: z.union([
    z.literal('add_pessoal'),
    z.literal('update_pessoal'),
    z.literal('remove_pessoal'),
    z.literal('setDefault_pessoal'),
  ]),
  id: z.number().int().positive().optional(), // obrigatório para update/remove/setDefault
  nome: z.string().trim().min(1).max(60).optional(), // obrigatório para add/update
  email: emailSchema.optional(),
  padrao: z.boolean().optional(),
  ativo: z.boolean().optional(),
}).refine((data) => {
  // Para add_pessoal: nome e email obrigatórios
  if (data.action === 'add_pessoal') {
    return data.nome && data.email;
  }
  // Para update_pessoal: id obrigatório
  if (data.action === 'update_pessoal') {
    return data.id !== undefined;
  }
  // Para remove_pessoal e setDefault_pessoal: id obrigatório
  if (data.action === 'remove_pessoal' || data.action === 'setDefault_pessoal') {
    return data.id !== undefined;
  }
  return true;
}, { message: 'Campos obrigatórios ausentes para a ação' });

export const saveEmailAccountSchema = z.object({
  action: z.literal('save_account'),
  host: nonEmptyString.max(255),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: emailSchema,
  pass: nonEmptyString.min(1).max(255), // senha do SMTP (vai ser criptografada no servidor)
  from: emailSchema.optional(),
});

export type SaveEmailAccountInput = z.infer<typeof saveEmailAccountSchema>;

// ──────────────────────────────────────────────────────────────
// send-rebaixa-email
// ──────────────────────────────────────────────────────────────
export const sendRebaixaEmailSchema = z.object({
  action: z.literal('send'),
  to: z.array(emailSchema).min(1).max(20),
  subject: z.string().trim().max(200).optional(),
  text: z.string().trim().max(2000).optional(),
  filename: z.string().trim().max(120).regex(/^[\w.\- ]+\.(ods|csv)$/i),
  attachment: z.string().min(1), // base64 (validado no handler com decodeAttachment)
  attachmentSize: z.number().int().positive().max(2 * 1024 * 1024).optional(),
});

export type SendRebaixaEmailInput = z.infer<typeof sendRebaixaEmailSchema>;

// ──────────────────────────────────────────────────────────────
// ai-assist
// ──────────────────────────────────────────────────────────────
export const aiActionSchema = z.enum(['config', 'read_label', 'import_review', 'review_categorias']);

export const readLabelSchema = z.object({
  action: z.literal('read_label'),
  image: z.string().min(1), // base64 sem prefixo data:
  mimeType: z.enum(['image/jpeg', 'image/png']),
});

export const importReviewSchema = z.object({
  action: z.literal('import_review'),
  headers: z.array(z.string()).min(1).max(50),
  sampleRows: z.array(z.array(z.string())).min(1).max(10),
  target: z.enum(['validade', 'inventory', 'rebaixa', 'consulta']),
});

export const reviewCategoriasSchema = z.object({
  action: z.literal('review_categorias'),
  limit: z.number().int().min(1).max(50).default(20),
});

export type ReadLabelInput = z.infer<typeof readLabelSchema>;
export type ImportReviewInput = z.infer<typeof importReviewSchema>;
export type ReviewCategoriasInput = z.infer<typeof reviewCategoriasSchema>;

// ──────────────────────────────────────────────────────────────
// manage-arrastao
// ──────────────────────────────────────────────────────────────
export const arrastaoActionSchema = z.enum([
  'create',
  'join',
  'leave',
  'add_item',
  'remove_item',
  'list',
  'list_all',
  'finalize',
  'consulta_all_items',
]);

export const createArrastaoSchema = z.object({
  action: z.literal('create'),
  nome: nonEmptyString.max(100),
});

export const joinArrastaoSchema = z.object({
  action: z.literal('join'),
  sessionId: positiveInt,
});

export const addArrastaoItemSchema = z.object({
  action: z.literal('add_item'),
  sessionId: positiveInt,
  codigo: z.union([nonEmptyString, positiveInt]),
  quantidade: positiveInt,
  lote: z.string().trim().optional(),
});

export type CreateArrastaoInput = z.infer<typeof createArrastaoSchema>;
export type JoinArrastaoInput = z.infer<typeof joinArrastaoSchema>;
export type AddArrastaoItemInput = z.infer<typeof addArrastaoItemSchema>;

// ──────────────────────────────────────────────────────────────
// manage-consulta
// ──────────────────────────────────────────────────────────────
export const consultaActionSchema = z.enum(['produto', 'periodo', 'lote']);

export const consultaProdutoSchema = z.object({
  action: z.literal('produto'),
  codigo: z.union([nonEmptyString, positiveInt]),
});

export const consultaPeriodoConsultaSchema = z.object({
  action: z.literal('periodo'),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  incluir_vencidos: z.boolean().optional(),
});

export type ConsultaProdutoInput = z.infer<typeof consultaProdutoSchema>;
export type ConsultaPeriodoConsultaInput = z.infer<typeof consultaPeriodoConsultaSchema>;

// ──────────────────────────────────────────────────────────────
// query-product (catálogo)
// ──────────────────────────────────────────────────────────────
export const queryProductActionSchema = z.enum(['search', 'by_code', 'by_ean', 'costs', 'categorias', 'set_categoria']);

export const setCategoriaSchema = z.object({
  action: z.literal('set_categoria'),
  codigo: positiveInt,
  categoria_codigo: positiveInt.optional(), // null/undefined = limpar
});

export type SetCategoriaInput = z.infer<typeof setCategoriaSchema>;

// ──────────────────────────────────────────────────────────────
// Helper genérico para validar no handler
// ──────────────────────────────────────────────────────────────

export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false as const, error: `Dados inválidos: ${issues}` };
  }
  return { ok: true as const, data: result.data };
}