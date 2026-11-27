/**
 * Gera a migration do MVP da ficha técnica FLV a partir do JSON extraído
 * (`scripts/fichas-flv-extraidas.json`, gerado por `extrair-fichas-flv.py`).
 *
 * Uso:
 *   node scripts/gerar-fichas-flv.mjs [--top 30] [--saida db/migrations/XXXX_ficha_flv_mvp.sql]
 *
 * O ranking é pela quantidade de produtos do catálogo que casam com os códigos
 * da ficha (E = produto.codigo, B/EAN = produto.ean). A fonte da verdade do
 * catálogo é o Neon (NEON_DATABASE_URL); sem ela, o ranking cai para o número
 * de códigos da ficha.
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
function argValor(flag, padrao) {
  const indice = args.indexOf(flag);
  return indice >= 0 ? args[indice + 1] : padrao;
}
const top = Number(argValor('--top', '30') || 30);
const saida = argValor('--saida', 'db/migrations/20261126090000_ficha_flv_mvp.sql');

const fichas = JSON.parse(readFileSync('scripts/fichas-flv-extraidas.json', 'utf8'));

/** Códigos do catálogo: { codigo: Set, ean: Set }. */
async function carregarCatalogo() {
  const raw = process.env.NEON_DATABASE_URL
    ?? readFileSync('.env.local', 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith('NEON_DATABASE_URL='))
        ?.slice('NEON_DATABASE_URL='.length)
        .trim();
  if (!raw) return null;
  const url = new URL(raw.replace(/^["']|["']$/g, ''));
  url.searchParams.delete('channel_binding');
  const sql = neon(url.toString());
  const rows = await sql`SELECT codigo::text AS codigo, ean::text AS ean FROM public.produto`;
  const codigos = new Set(rows.map((r) => String(r.codigo)));
  const eans = new Set(rows.map((r) => String(r.ean)));
  return { codigos, eans };
}

const catalogo = await carregarCatalogo();

function produtosQueCasam(ficha) {
  if (!catalogo) return 0;
  let count = 0;
  for (const codigo of ficha.entrada) if (catalogo.codigos.has(codigo)) count += 1;
  for (const codigo of [...ficha.balanca, ...ficha.eans]) if (catalogo.eans.has(codigo)) count += 1;
  return count;
}

const ranqueadas = fichas
  .map((ficha) => ({ ficha, casam: produtosQueCasam(ficha) }))
  .sort((a, b) => b.casam - a.casam || b.ficha.codigo.localeCompare(a.ficha.codigo));

const selecionadas = ranqueadas.slice(0, top).map((r) => r.ficha);

// Um mesmo código não pode apontar para duas fichas no MVP: a de maior rank vence.
const usados = new Set();
const conflitos = [];
for (const ficha of [...selecionadas].sort((a, b) => (ranqueadas.findIndex((r) => r.ficha === a)) - (ranqueadas.findIndex((r) => r.ficha === b)))) {
  for (const tipo of ['entrada', 'balanca', 'eans']) {
    ficha[tipo] = ficha[tipo].filter((codigo) => {
      const chave = `${tipo}:${codigo}`;
      if (usados.has(chave)) {
        conflitos.push(`${chave} (${ficha.codigo})`);
        return false;
      }
      usados.add(chave);
      return true;
    });
  }
}

const sql = (valor) => String(valor).replace(/'/g, "''");
const jsonb = (valor) => `'${sql(JSON.stringify(valor))}'::jsonb`;

const linhas = [];
linhas.push('-- Migration: MVP da ficha técnica FLV (Fort Atacadista) + registro de qualidade no recebimento');
linhas.push('-- Data: 2026-11-26');
linhas.push('--');
linhas.push('-- Tabelas do CATÁLOGO (compartilhadas entre lojas, sem coluna de loja, sem RLS —');
linhas.push('-- mesmo padrão de produto/produto_eans/categoria):');
linhas.push('--   flv_ficha, flv_ficha_codigo, flv_ficha_defeito');
linhas.push('-- Tabela OPERACIONAL (por loja, com RLS no mesmo padrão das demais):');
linhas.push('--   flv_recebimento');
linhas.push('--');
linhas.push(`-- Seed: top ${selecionadas.length} fichas por cobertura do catálogo (ver scripts/gerar-fichas-flv.mjs).`);
linhas.push('');
linhas.push('CREATE TABLE IF NOT EXISTS public.flv_ficha (');
linhas.push('  codigo TEXT PRIMARY KEY,');
linhas.push('  titulo TEXT NOT NULL,');
linhas.push('  grupo TEXT NOT NULL,');
linhas.push('  pagina_pdf INTEGER NOT NULL,');
linhas.push('  revisao TEXT,');
linhas.push('  data_revisao TEXT,');
linhas.push('  fonte TEXT NOT NULL,');
linhas.push("  pontos_atencao JSONB NOT NULL DEFAULT '[]'::jsonb,");
linhas.push('  ativo BOOLEAN NOT NULL DEFAULT TRUE,');
linhas.push('  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
linhas.push(');');
linhas.push('');
linhas.push('CREATE TABLE IF NOT EXISTS public.flv_ficha_codigo (');
linhas.push('  ficha_codigo TEXT NOT NULL REFERENCES public.flv_ficha(codigo) ON DELETE CASCADE,');
linhas.push("  tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'BALANCA', 'EAN')),");
linhas.push('  codigo BIGINT NOT NULL,');
linhas.push('  PRIMARY KEY (tipo, codigo)');
linhas.push(');');
linhas.push('');
linhas.push('CREATE TABLE IF NOT EXISTS public.flv_ficha_defeito (');
linhas.push('  id BIGSERIAL PRIMARY KEY,');
linhas.push('  ficha_codigo TEXT NOT NULL REFERENCES public.flv_ficha(codigo) ON DELETE CASCADE,');
linhas.push('  ordem INTEGER NOT NULL,');
linhas.push("  grupo TEXT NOT NULL CHECK (grupo IN ('PODRIDAO', 'GRAVE', 'LEVE')),");
linhas.push('  nome TEXT NOT NULL,');
linhas.push('  cat1 NUMERIC(5,2),');
linhas.push('  cat2 NUMERIC(5,2),');
linhas.push('  detalhe TEXT,');
linhas.push('  UNIQUE (ficha_codigo, ordem)');
linhas.push(');');
linhas.push('CREATE INDEX IF NOT EXISTS idx_flv_ficha_defeito_ficha ON public.flv_ficha_defeito(ficha_codigo, ordem);');
linhas.push('');
linhas.push('CREATE TABLE IF NOT EXISTS public.flv_recebimento (');
linhas.push('  id UUID PRIMARY KEY,');
linhas.push('  loja INTEGER NOT NULL REFERENCES public.lojas(codigo) ON UPDATE CASCADE,');
linhas.push('  created_by TEXT NOT NULL,');
linhas.push('  produto_codigo BIGINT,');
linhas.push('  produto_ean BIGINT,');
linhas.push('  descricao TEXT,');
linhas.push('  ficha_codigo TEXT REFERENCES public.flv_ficha(codigo),');
linhas.push('  amostra INTEGER NOT NULL CHECK (amostra > 0 AND amostra <= 10000),');
linhas.push("  decisao TEXT NOT NULL CHECK (decisao IN ('aprovado', 'ressalva', 'rebaixa', 'rejeitado')),");
linhas.push("  defeitos JSONB NOT NULL DEFAULT '[]'::jsonb,");
linhas.push('  observacao TEXT,');
linhas.push('  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
linhas.push(');');
linhas.push('CREATE INDEX IF NOT EXISTS idx_flv_recebimento_loja_created ON public.flv_recebimento(loja, created_at DESC);');
linhas.push('');
linhas.push('-- RLS da tabela operacional (mesmo padrão das demais tabelas por loja).');
linhas.push('-- A função é recriada aqui (OR REPLACE) para a migration não depender de outra.');
linhas.push('CREATE OR REPLACE FUNCTION public.current_loja() RETURNS integer');
linhas.push('LANGUAGE sql STABLE');
linhas.push('AS $$');
linhas.push("  SELECT NULLIF(current_setting('app.current_loja', true), '')::int;");
linhas.push('$$;');
linhas.push('ALTER TABLE public.flv_recebimento ENABLE ROW LEVEL SECURITY;');
linhas.push('DROP POLICY IF EXISTS flv_recebimento_select_loja ON public.flv_recebimento;');
linhas.push('CREATE POLICY flv_recebimento_select_loja ON public.flv_recebimento FOR SELECT USING (loja = public.current_loja());');
linhas.push('DROP POLICY IF EXISTS flv_recebimento_insert_loja ON public.flv_recebimento;');
linhas.push('CREATE POLICY flv_recebimento_insert_loja ON public.flv_recebimento FOR INSERT WITH CHECK (loja = public.current_loja());');
linhas.push('DROP POLICY IF EXISTS flv_recebimento_delete_loja ON public.flv_recebimento;');
linhas.push('CREATE POLICY flv_recebimento_delete_loja ON public.flv_recebimento FOR DELETE USING (loja = public.current_loja());');
linhas.push('');
linhas.push('-- Seed das fichas (ON CONFLICT DO NOTHING: re-rodar é idempotente).');
linhas.push('');

for (const ficha of selecionadas) {
  linhas.push(
    `INSERT INTO public.flv_ficha (codigo, titulo, grupo, pagina_pdf, revisao, data_revisao, fonte, pontos_atencao) VALUES ('${sql(ficha.codigo)}', '${sql(ficha.titulo)}', '${sql(ficha.grupo)}', ${ficha.pagina_pdf}, ${ficha.revisao ? `'${sql(ficha.revisao)}'` : 'NULL'}, ${ficha.data_revisao ? `'${sql(ficha.data_revisao)}'` : 'NULL'}, '${sql(ficha.fonte)}', ${jsonb(ficha.pontos_atencao)}) ON CONFLICT (codigo) DO NOTHING;`,
  );
  const tipos = [['entrada', 'ENTRADA'], ['balanca', 'BALANCA'], ['eans', 'EAN']];
  for (const [campo, tipo] of tipos) {
    for (const codigo of ficha[campo]) {
      linhas.push(`INSERT INTO public.flv_ficha_codigo (ficha_codigo, tipo, codigo) VALUES ('${sql(ficha.codigo)}', '${tipo}', ${codigo}) ON CONFLICT (tipo, codigo) DO NOTHING;`);
    }
  }
  ficha.defeitos.forEach((defeito, ordem) => {
    linhas.push(
      `INSERT INTO public.flv_ficha_defeito (ficha_codigo, ordem, grupo, nome, cat1, cat2, detalhe) VALUES ('${sql(ficha.codigo)}', ${ordem}, '${defeito.grupo}', '${sql(defeito.nome)}', ${defeito.cat1 ?? 'NULL'}, ${defeito.cat2 ?? 'NULL'}, ${defeito.detalhe ? `'${sql(defeito.detalhe)}'` : 'NULL'}) ON CONFLICT (ficha_codigo, ordem) DO NOTHING;`,
    );
  });
  linhas.push('');
}

writeFileSync(saida, linhas.join('\n') + '\n');

console.log(`Migration escrita em ${saida}`);
console.log(`Fichas selecionadas: ${selecionadas.length} (top ${top} por cobertura do catálogo)`);
console.table(
  ranqueadas.slice(0, top).map((r) => ({
    codigo: r.ficha.codigo,
    titulo: r.ficha.titulo.slice(0, 48),
    grupo: r.ficha.grupo,
    produtos: r.casam,
    defeitos: r.ficha.defeitos.length,
  })),
);
if (conflitos.length) {
  console.log('Códigos em conflito (ficaram com a ficha de maior rank):');
  for (const c of conflictsSafe(conflitos)) console.log(' -', c);
}

function conflictsSafe(lista) { return lista; }
