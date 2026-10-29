import { invokeFunction } from '@/lib/api';

/** Custo (PMZ) por código do produto. */
export type CustoMap = Record<string, number>;

/** Quantidade máxima de códigos por requisição (limite do endpoint). */
const CHUNK_SIZE = 500;
/** Tempo limite por tentativa, para não travar a exportação. */
const TIMEOUT_MS = 20000;

/**
 * Busca o custo (PMZ) de vários códigos no catálogo de produtos.
 * Códigos sem custo ficam fora do mapa — a planilha segue com a coluna vazia.
 */
export async function fetchProductCustos(
  codigos: string[],
  token: string | null,
): Promise<CustoMap> {
  const unique = [...new Set(codigos.map((codigo) => String(codigo).trim()).filter(Boolean))];
  const result: CustoMap = {};
  if (unique.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    chunks.push(unique.slice(i, i + CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const { data, error } = await invokeFunction<{ costs?: Record<string, unknown> }>('query-product', {
            body: { action: 'costs', codigos: chunk },
            ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          });
          if (error || !data?.costs) return;
          for (const [codigo, valor] of Object.entries(data.costs)) {
            const numero = Number(valor);
            if (Number.isFinite(numero) && numero > 0) result[codigo] = numero;
          }
        } finally {
          clearTimeout(timer);
        }
        void controller;
      } catch {
        /* custo indisponível: a planilha segue sem a coluna preenchida */
      }
    }),
  );

  return result;
}
