import { invokeFunction } from '@/lib/api';

const CACHE_KEY = 'validade_tipo_cache';
const CACHE_LIMIT = 1000;
const CONCURRENCY = 4;

export function readTipoCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: Record<string, string> = {};
    for (const [codigo, tipo] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof tipo === 'string' && tipo.trim()) result[codigo] = tipo.trim().toUpperCase();
    }
    return result;
  } catch {
    return {};
  }
}

function writeTipoCache(cache: Record<string, string>): void {
  try {
    const entries = Object.entries(cache).filter(([, tipo]) => tipo);
    const trimmed = entries.slice(-CACHE_LIMIT);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(trimmed)));
  } catch {
    /* cache indisponível: segue sem persistir */
  }
}

async function fetchTipo(codigo: string, token: string | null): Promise<string | null> {
  try {
    const { data, error } = await invokeFunction('query-product', {
      body: { codigo },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    if (error || !data?.found || !data.product?.tipo) return null;
    const tipo = String(data.product.tipo).trim().toUpperCase();
    return tipo || null;
  } catch {
    return null;
  }
}

/**
 * Busca o tipo (KG/UN) de cada código no catálogo, com cache local e concorrência limitada.
 * Códigos não encontrados ficam fora do mapa e são tentados de novo na próxima exportação.
 */
export async function fetchProductTipos(codigos: string[], token: string | null): Promise<Record<string, string>> {
  const cache = readTipoCache();
  const result: Record<string, string> = { ...cache };

  const unique = [...new Set(codigos.map((codigo) => String(codigo).trim()).filter(Boolean))];
  const missing = unique.filter((codigo) => !result[codigo]);
  if (missing.length === 0) return result;

  let index = 0;
  const worker = async () => {
    while (index < missing.length) {
      const codigo = missing[index];
      index += 1;
      const tipo = await fetchTipo(codigo, token);
      if (tipo) result[codigo] = tipo;
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, missing.length) }, worker));
  writeTipoCache(result);
  return result;
}
