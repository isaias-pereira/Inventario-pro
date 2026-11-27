/**
 * Ficha técnica FLV (MVP) + registro de qualidade no recebimento.
 *
 * As ações `flv_*` são roteadas por `api/manage-validade.ts` (o plano Hobby da
 * Vercel limita o total de funções, então não existe `api/manage-flv.ts`).
 *
 * Tabelas do catálogo (compartilhadas, sem loja): `flv_ficha`,
 * `flv_ficha_codigo`, `flv_ficha_defeito`. Tabela operacional por loja:
 * `flv_recebimento` (a loja vem do JWT — nunca do cliente).
 *
 * Ações:
 * - `flv_ficha`: recebe `codigo` (entrada, balança/PLU ou EAN) e devolve a
 *   ficha + o produto do catálogo.
 * - `flv_listar_fichas`: índice das fichas ativas.
 * - `flv_registrar_recebimento`: grava o laudo da loja atual.
 * - `flv_list_recebimentos`: últimos registros da loja atual.
 *
 * Mapeamento de códigos da ficha (convenção do catálogo):
 * - E (código de entrada) = `produto.codigo` → `flv_ficha_codigo.tipo='ENTRADA'`;
 * - B (código de balança/PLU) = `produto.ean` → tipo='BALANCA';
 * - EAN da embalagem = `produto.ean`/`produto_eans` → tipo='EAN'.
 */

import { randomUUID } from 'node:crypto';
import type { Sql } from './db.js';
import type { JwtPayload } from './jwt.js';
import type { ApiRequest, ApiResponse } from './http.js';
import { sendJson } from './http.js';
import { identifier } from './product-validation.js';

const RECEBIMENTO_ROLES = ['admin', 'encarregado'] as const;
const DECISOES = ['aprovado', 'ressalva', 'rebaixa', 'rejeitado'] as const;
type Decisao = (typeof DECISOES)[number];

export interface FlvContext {
  sql: Sql;
  payload: JwtPayload;
  loja: number;
}

function canRegistrar(role: unknown): boolean {
  return typeof role === 'string' && (RECEBIMENTO_ROLES as readonly string[]).includes(role);
}

let schemaReady = false;

/** Cria as tabelas se a migration ainda não tiver rodado (idempotente). */
export async function ensureFlvSchema(sql: Sql): Promise<boolean> {
  if (schemaReady) return true;
  try {
    await sql(`CREATE TABLE IF NOT EXISTS public.flv_ficha (
      codigo TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      grupo TEXT NOT NULL,
      pagina_pdf INTEGER NOT NULL,
      revisao TEXT,
      data_revisao TEXT,
      fonte TEXT NOT NULL,
      pontos_atencao JSONB NOT NULL DEFAULT '[]'::jsonb,
      ativo BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await sql(`CREATE TABLE IF NOT EXISTS public.flv_ficha_codigo (
      ficha_codigo TEXT NOT NULL REFERENCES public.flv_ficha(codigo) ON DELETE CASCADE,
      tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'BALANCA', 'EAN')),
      codigo BIGINT NOT NULL,
      PRIMARY KEY (tipo, codigo)
    )`);
    await sql(`CREATE TABLE IF NOT EXISTS public.flv_ficha_defeito (
      id BIGSERIAL PRIMARY KEY,
      ficha_codigo TEXT NOT NULL REFERENCES public.flv_ficha(codigo) ON DELETE CASCADE,
      ordem INTEGER NOT NULL,
      grupo TEXT NOT NULL CHECK (grupo IN ('PODRIDAO', 'GRAVE', 'LEVE')),
      nome TEXT NOT NULL,
      cat1 NUMERIC(5,2),
      cat2 NUMERIC(5,2),
      detalhe TEXT,
      UNIQUE (ficha_codigo, ordem)
    )`);
    await sql('CREATE INDEX IF NOT EXISTS idx_flv_ficha_defeito_ficha ON public.flv_ficha_defeito(ficha_codigo, ordem)');
    await sql(`CREATE TABLE IF NOT EXISTS public.flv_recebimento (
      id UUID PRIMARY KEY,
      loja INTEGER NOT NULL REFERENCES public.lojas(codigo) ON UPDATE CASCADE,
      created_by TEXT NOT NULL,
      produto_codigo BIGINT,
      produto_ean BIGINT,
      descricao TEXT,
      ficha_codigo TEXT REFERENCES public.flv_ficha(codigo),
      amostra INTEGER NOT NULL CHECK (amostra > 0 AND amostra <= 10000),
      decisao TEXT NOT NULL CHECK (decisao IN ('aprovado', 'ressalva', 'rebaixa', 'rejeitado')),
      defeitos JSONB NOT NULL DEFAULT '[]'::jsonb,
      observacao TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await sql('CREATE INDEX IF NOT EXISTS idx_flv_recebimento_loja_created ON public.flv_recebimento(loja, created_at DESC)');
    schemaReady = true;
    return true;
  } catch (error) {
    console.error('FLV schema:', error);
    return false;
  }
}

function asJson(value: unknown): unknown {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

async function produtoPorCodigo(sql: Sql, codigo: string) {
  const rows = await sql(
    `SELECT p.codigo::text AS codigo, p.ean::text AS ean, p.descricao, p.tipo,
            c.secao
       FROM public.produto p
       LEFT JOIN public.categoria c ON c.codigo = p.categoria_codigo
      WHERE p.codigo = $1::bigint OR p.ean = $1::bigint
      ORDER BY (p.codigo = $1::bigint) DESC
      LIMIT 1`,
    [codigo],
  );
  return rows[0] ?? null;
}

function defectsJson(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    ordem: Number(row.ordem),
    grupo: String(row.grupo),
    nome: String(row.nome),
    cat1: row.cat1 === null || row.cat1 === undefined ? null : Number(row.cat1),
    cat2: row.cat2 === null || row.cat2 === undefined ? null : Number(row.cat2),
    detalhe: row.detalhe === null || row.detalhe === undefined ? null : String(row.detalhe),
  }));
}

async function fichaPorCodigoInterno(sql: Sql, codigo: string) {
  const hit = await sql(
    `SELECT ficha_codigo FROM public.flv_ficha_codigo
      WHERE codigo = $1::bigint AND tipo IN ('ENTRADA', 'BALANCA', 'EAN')
      ORDER BY (tipo = 'ENTRADA') DESC, (tipo = 'BALANCA') DESC, ficha_codigo
      LIMIT 1`,
    [codigo],
  );
  if (hit.length === 0) return null;
  const fichaCodigo = String(hit[0].ficha_codigo);

  const fichaRows = await sql(
    `SELECT codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao, ativo
       FROM public.flv_ficha
      WHERE codigo = $1 AND ativo = TRUE`,
    [fichaCodigo],
  );
  if (fichaRows.length === 0) return null;
  const ficha = fichaRows[0];

  const codigos = await sql(
    `SELECT tipo, codigo::text AS codigo FROM public.flv_ficha_codigo
      WHERE ficha_codigo = $1 ORDER BY (tipo='ENTRADA') DESC, (tipo='BALANCA') DESC, codigo`,
    [fichaCodigo],
  );
  const defeitos = await sql(
    `SELECT ordem, grupo, nome, cat1::float8 AS cat1, cat2::float8 AS cat2, detalhe
       FROM public.flv_ficha_defeito
      WHERE ficha_codigo = $1 ORDER BY ordem`,
    [fichaCodigo],
  );
  return {
    ...ficha,
    pontos_atencao: asJson(ficha.pontos_atencao),
    codigos: codigos.map((row) => ({ tipo: String(row.tipo), codigo: String(row.codigo) })),
    defeitos: defectsJson(defeitos),
  };
}

function pushDefeito(
  lista: Record<string, unknown>[],
  defeito: { ordem: number; grupo: string; nome: string; cat1: number | null; cat2: number | null },
  quantidade: number,
  amostra: number,
) {
  lista.push({
    ordem: defeito.ordem,
    grupo: defeito.grupo,
    nome: defeito.nome,
    cat1: defeito.cat1,
    cat2: defeito.cat2,
    quantidade,
    percentual: Number(((quantidade / amostra) * 100).toFixed(2)),
  });
}

/** Trata as ações `flv_*` dentro de `manage-validade` (limite de funções da Vercel). */
export async function handleFlvPost(
  req: ApiRequest,
  res: ApiResponse,
  body: Record<string, unknown>,
  ctx: FlvContext,
): Promise<void> {
  const action = String(body.action ?? '');
  const { sql, payload, loja } = ctx;

  if (!['flv_ficha', 'flv_listar_fichas', 'flv_registrar_recebimento', 'flv_list_recebimentos'].includes(action)) {
    sendJson(res, { error: 'Ação inválida' }, 400);
    return;
  }
  if (!canRegistrar(payload.role)) {
    sendJson(res, { error: 'Acesso restrito a admin e encarregado' }, 403);
    return;
  }
  if (!await ensureFlvSchema(sql)) {
    sendJson(res, { error: 'Tabelas da ficha FLV não estão disponíveis' }, 503);
    return;
  }

  if (action === 'flv_ficha') {
    const codigo = identifier(body.codigo);
    if (!codigo) {
      sendJson(res, { error: 'Código inválido (apenas dígitos, até 14)' }, 400);
      return;
    }
    const ficha = await fichaPorCodigoInterno(sql, codigo);
    const produto = await produtoPorCodigo(sql, codigo);
    sendJson(res, { ficha, produto });
    return;
  }

  if (action === 'flv_listar_fichas') {
    const rows = await sql(
      `SELECT f.codigo, f.titulo, f.grupo, f.revisao, f.data_revisao, f.pagina_pdf,
              (SELECT COUNT(*)::int FROM public.flv_ficha_codigo c WHERE c.ficha_codigo = f.codigo) AS codigos,
              (SELECT COUNT(*)::int FROM public.flv_ficha_defeito d WHERE d.ficha_codigo = f.codigo) AS defeitos
         FROM public.flv_ficha f
        WHERE f.ativo = TRUE
        ORDER BY f.grupo, f.titulo`,
    );
    sendJson(res, {
      fichas: rows.map((row) => ({
        codigo: String(row.codigo),
        titulo: String(row.titulo),
        grupo: String(row.grupo),
        revisao: row.revisao ?? null,
        data_revisao: row.data_revisao ?? null,
        pagina_pdf: Number(row.pagina_pdf),
        codigos: Number(row.codigos),
        defeitos: Number(row.defeitos),
      })),
    });
    return;
  }

  if (action === 'flv_list_recebimentos') {
    const rows = await sql(
      `SELECT id, created_at, created_by, produto_codigo::text AS produto_codigo,
              produto_ean::text AS produto_ean, descricao, ficha_codigo, amostra, decisao,
              defeitos, observacao
         FROM public.flv_recebimento
        WHERE loja = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [loja],
    );
    sendJson(res, {
      recebimentos: rows.map((row) => ({ ...row, defeitos: asJson(row.defeitos) })),
    });
    return;
  }

  // flv_registrar_recebimento
  const codigo = identifier(body.codigo);
  if (!codigo) {
    sendJson(res, { error: 'Código inválido (apenas dígitos, até 14)' }, 400);
    return;
  }
  const ficha = await fichaPorCodigoInterno(sql, codigo);
  if (!ficha) {
    sendJson(res, { error: 'Ficha técnica não disponível para este produto (MVP: apenas produtos com ficha ativa)' }, 404);
    return;
  }
  const produto = await produtoPorCodigo(sql, codigo);

  const amostra = Number(body.amostra);
  if (!Number.isInteger(amostra) || amostra <= 0 || amostra > 10000) {
    sendJson(res, { error: 'Informe o tamanho da amostra (1 a 10000)' }, 400);
    return;
  }
  const decisao = String(body.decisao ?? '');
  if (!(DECISOES as readonly string[]).includes(decisao)) {
    sendJson(res, { error: 'Decisão inválida' }, 400);
    return;
  }
  const observacao = typeof body.observacao === 'string' ? body.observacao.trim().slice(0, 500) : null;

  const rawDefeitos = Array.isArray(body.defeitos) ? body.defeitos : [];
  if (rawDefeitos.length > 200) {
    sendJson(res, { error: 'Quantidade de defeitos inválida' }, 400);
    return;
  }
  const porOrdem = new Map(ficha.defeitos.map((defeito) => [defeito.ordem, defeito]));
  const defeitos: Record<string, unknown>[] = [];
  for (const item of rawDefeitos) {
    if (typeof item !== 'object' || item === null) {
      sendJson(res, { error: 'Defeito inválido' }, 400);
      return;
    }
    const entrada = item as Record<string, unknown>;
    const ordem = Number(entrada.ordem);
    const quantidade = Number(entrada.quantidade);
    const defeito = porOrdem.get(ordem);
    if (!defeito || !Number.isInteger(ordem) || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > amostra) {
      sendJson(res, { error: 'Defeito inválido para esta ficha' }, 400);
      return;
    }
    if (quantidade === 0) continue;
    pushDefeito(defeitos, defeito, quantidade, amostra);
  }

  const produtoCodigo = produto ? String(produto.codigo) : codigo;
  const produtoEan = produto && produto.ean ? String(produto.ean) : null;
  const descricao = produto && produto.descricao ? String(produto.descricao) : null;

  const inserted = await sql(
    `INSERT INTO public.flv_recebimento
       (id, loja, created_by, produto_codigo, produto_ean, descricao, ficha_codigo,
        amostra, decisao, defeitos, observacao)
     VALUES ($1, $2, $3, $4::bigint, $5::bigint, $6, $7, $8, $9, $10::jsonb, $11)
     RETURNING id, created_at, created_by, produto_codigo::text AS produto_codigo,
               produto_ean::text AS produto_ean, descricao, ficha_codigo, amostra, decisao,
               defeitos, observacao`,
    [
      randomUUID(),
      loja,
      payload.sub,
      produtoCodigo,
      produtoEan,
      descricao,
      ficha.codigo,
      amostra,
      decisao as Decisao,
      JSON.stringify(defeitos),
      observacao,
    ],
  );
  const registro = (inserted[0] ?? null) as Record<string, unknown> | null;
  if (registro) registro.defeitos = asJson(registro.defeitos);
  sendJson(res, { ok: true, recebimento: registro });
}
