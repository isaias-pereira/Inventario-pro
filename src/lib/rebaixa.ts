/**
 * Cliente da lista de rebaixa.
 *
 * A tela usa estes helpers para falar com `manage-rebaixa` e para formatar
 * quantidades/preços no padrão brasileiro. A planilha `.ods`/CSV reaproveita
 * `ValidadeSpreadsheetItem`: a Rebaixa só acrescenta o tipo explícito, o motivo
 * KG (coluna DESCRIÇÃO DA OFERTA) e o preço final decidido na tela.
 */

import { invokeFunction } from './api';
import type { ValidadeSpreadsheetItem } from './validade-spreadsheet';

export type RebaixaTipo = 'KG' | 'UN';
export type MotivoRebaixa = 'Excesso' | 'Qualidade' | 'Excesso/qualidade';

export const MOTIVOS_REBAIXA: MotivoRebaixa[] = ['Excesso', 'Qualidade', 'Excesso/qualidade'];

/**
 * Converte o motivo gravado na Validade para os motivos aceitos pela Rebaixa.
 * A Validade só usa "Excesso" e "Qualidade", mas o banco aceita o terceiro.
 */
export function motivoFromValidade(value: string | null | undefined): MotivoRebaixa | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return MOTIVOS_REBAIXA.find((motivo) => motivo.toLowerCase() === normalized) ?? null;
}

/** Item com motivo é de balança (KG); sem motivo, é unitário (UN). */
export function tipoFromMotivo(value: string | null | undefined): RebaixaTipo {
  return motivoFromValidade(value) ? 'KG' : 'UN';
}

export interface RebaixaItem {
  id: string;
  ean: string;
  codigo: string;
  descricao: string;
  tipo: RebaixaTipo;
  validade: string | null;
  motivo: string | null;
  quantidade: number;
  pmz: number | null;
  preco_sugerido: number | null;
  preco_final: number | null;
  validade_id: string | null;
  created_by: string | null;
  created_at: string;
  /** Seção (categoria) do produto no catálogo. */
  secao?: string | null;
}

export interface NewRebaixaItem {
  ean: string;
  codigo: string;
  descricao: string;
  tipo: RebaixaTipo;
  validade: string | null;
  motivo: string | null;
  quantidade: number;
  pmz?: number | null;
  preco_sugerido?: number | null;
  preco_final?: number | null;
  validade_id?: string | null;
}

export interface RebaixaHistoryBatch {
  batch_id: string;
  sent_at: string;
  sent_to: string | null;
  created_by: string | null;
  itens: number;
  total: number;
}

export interface AddRebaixaResult {
  added: number;
  skipped: number;
}

export interface MarkRebaixaSentResult {
  batch_id: string;
  sent: number;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await invokeFunction<T>('manage-rebaixa', { body });
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
  return data as T;
}

export async function fetchRebaixaList(): Promise<RebaixaItem[]> {
  const data = await invoke<{ items?: RebaixaItem[] }>({ action: 'list' });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function addRebaixaItems(items: NewRebaixaItem[]): Promise<AddRebaixaResult> {
  const data = await invoke<AddRebaixaResult>({ action: 'add_many', items });
  return { added: Number(data?.added) || 0, skipped: Number(data?.skipped) || 0 };
}

export interface RebaixaUpdatePatch {
  quantidade?: number;
  validade?: string | null;
  motivo?: string | null;
  preco_sugerido?: number | null;
  preco_final?: number | null;
}

export async function updateRebaixaItem(id: string, patch: RebaixaUpdatePatch): Promise<void> {
  await invoke({ action: 'update', id, ...patch });
}

export async function removeRebaixaItem(id: string): Promise<void> {
  await invoke({ action: 'remove', id });
}

export async function clearRebaixa(): Promise<number> {
  const data = await invoke<{ removed?: number }>({ action: 'clear' });
  return Number(data?.removed) || 0;
}

export async function markRebaixaSent(ids: string[], to: string): Promise<MarkRebaixaSentResult> {
  const data = await invoke<MarkRebaixaSentResult>({ action: 'mark_sent', ids, to });
  return { batch_id: String(data?.batch_id ?? ''), sent: Number(data?.sent) || 0 };
}

export async function fetchRebaixaHistory(): Promise<RebaixaHistoryBatch[]> {
  const data = await invoke<{ batches?: RebaixaHistoryBatch[] }>({ action: 'history' });
  return Array.isArray(data?.batches) ? data.batches : [];
}

export async function fetchRebaixaBatchItems(batchId: string): Promise<RebaixaItem[]> {
  const data = await invoke<{ items?: RebaixaItem[] }>({ action: 'history_items', batch_id: batchId });
  return Array.isArray(data?.items) ? data.items : [];
}

/** Converte "12,500", "12.5" ou "R$ 2,50" em número; vazio/inválido = null. */
export function parseDecimalInput(value: string): number | null {
  const clean = value.trim().replace(/[^\d.,-]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/** Quantidade na tela: kg com 3 casas, UN inteira. */
export function formatQuantity(value: number, tipo: RebaixaTipo): string {
  if (!Number.isFinite(value)) return '0';
  return tipo === 'KG' ? value.toFixed(3).replace('.', ',') : String(Math.round(value));
}

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

/** Valor para dentro do input (sem o "R$"). */
export function formatMoneyInput(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Margem da planilha: ((PMZ - sugestão) / PMZ) * 100. */
export function marginPercent(pmz: number | null, suggested: number | null): number | null {
  if (pmz === null || suggested === null || !Number.isFinite(pmz) || !Number.isFinite(suggested) || pmz <= 0) {
    return null;
  }
  return ((pmz - suggested) / pmz) * 100;
}

export function formatMargin(pmz: number | null, suggested: number | null): string {
  const value = marginPercent(pmz, suggested);
  return value === null ? '—' : `${value.toFixed(1).replace('.', ',')}%`;
}

/** Data local no formato do input `type="date"`. */
export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Itens da Rebaixa no formato da planilha (motivo KG vai para DESCRIÇÃO DA OFERTA). */
export function toSpreadsheetItems(items: RebaixaItem[]): ValidadeSpreadsheetItem[] {
  return items.map((item) => ({
    ean: item.ean,
    codigo: item.codigo,
    descricao: item.descricao,
    quantidade: item.quantidade,
    validade: item.validade,
    tipo: item.tipo,
    oferta: item.tipo === 'KG' ? (item.motivo ?? '') : '',
    precoFinal: item.preco_final,
  }));
}

/** Mapa código → tipo usado pela planilha. */
export function rebaixaTipoMap(items: RebaixaItem[]): Record<string, string> {
  return Object.fromEntries(items.map((item) => [item.codigo, item.tipo]));
}

/** Mapa código → PMZ usado pela planilha. */
export function rebaixaCustoMap(items: RebaixaItem[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    if (item.pmz !== null && Number.isFinite(item.pmz) && item.pmz > 0) {
      result[item.codigo] = item.pmz;
    }
  }
  return result;
}
