/**
 * Cliente da API de IA — sempre server-side.
 *
 * A chave (`AI_API_KEY`) vive somente nas variáveis de ambiente da Vercel: ela
 * nunca chega ao navegador. O frontend chama a Function `ai-assist` pelo
 * `invokeFunction`, como nas demais rotas.
 *
 * O provedor usado é a API Messages da Anthropic (visão + texto), chamada por
 * `fetch` — sem dependência nova no `package.json`. Para trocar de provedor,
 * mexer só neste arquivo.
 */

const AI_API_URL = 'https://api.anthropic.com/v1/messages';
const AI_API_VERSION = '2023-06-01';

/** Modelo usado quando `AI_MODEL` não está configurada. */
export const DEFAULT_AI_MODEL = 'claude-sonnet-4-5';

/** Tempo máximo de espera pelo provedor (a Function tem `maxDuration` próprio). */
const DEFAULT_TIMEOUT_MS = 25000;

/** Tokens máximos da resposta (a tarefa é curta: extrair dados de uma imagem). */
const DEFAULT_MAX_TOKENS = 1024;

/** Imagens acima disso são recusadas antes de qualquer chamada externa. */
export const MAX_IMAGE_BASE64_CHARS = 4_500_000;

export interface AiImage {
  /** Conteúdo da imagem em base64 (sem o prefixo `data:`). */
  base64: string;
  /** MIME da imagem (ex.: `image/jpeg`). */
  mimeType: string;
}

export interface AiRequest {
  /** Instrução de sistema (papel do modelo). */
  system: string;
  /** Texto enviado pelo usuário (o que deve ser feito). */
  prompt: string;
  /** Imagem opcional (visão). */
  image?: AiImage;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult {
  /** Texto produced pelo modelo. */
  text: string;
  model: string;
  usage: AiUsage;
}

/** Erro de IA com status HTTP (o `ai-assist` repassa esse status ao cliente). */
export type AiError = Error & { status?: number };

function aiError(message: string, status: number): AiError {
  return Object.assign(new Error(message), { status });
}

/** Chave da API de IA (null quando não configurada). */
export function aiApiKey(): string | null {
  const key = process.env.AI_API_KEY?.trim();
  return key ? key : null;
}

/** Modelo configurado (ou o padrão do projeto). */
export function aiModel(): string {
  const model = process.env.AI_MODEL?.trim();
  return model ? model : DEFAULT_AI_MODEL;
}

/** A IA está configurada neste ambiente? */
export function aiConfigured(): boolean {
  return aiApiKey() !== null;
}

/** MIME aceito para visão. */
export function isSupportedImageMime(mimeType: unknown): boolean {
  return typeof mimeType === 'string' && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType);
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { type: string; text?: string } => !!part && typeof part === 'object')
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n')
    .trim();
}

/**
 * Chama o provedor de IA e devolve o texto da resposta.
 *
 * Erros: 503 (sem chave), 502 (provedor recusou/respondeu errado), 504 (timeout).
 */
export async function callAi(request: AiRequest): Promise<AiResult> {
  const apiKey = aiApiKey();
  if (!apiKey) {
    throw aiError('IA não configurada (AI_API_KEY ausente).', 503);
  }

  const userContent: Record<string, unknown>[] = [{ type: 'text', text: request.prompt }];
  if (request.image) {
    if (!isSupportedImageMime(request.image.mimeType)) {
      throw aiError('Formato de imagem não suportado.', 400);
    }
    if (!request.image.base64 || request.image.base64.length > MAX_IMAGE_BASE64_CHARS) {
      throw aiError('Imagem muito grande ou vazia.', 413);
    }
    userContent.unshift({
      type: 'image',
      source: {
        type: 'base64',
        media_type: request.image.mimeType,
        data: request.image.base64,
      },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': AI_API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel(),
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: request.system,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = controller.signal.aborted || (error as { name?: string })?.name === 'AbortError';
    if (aborted) throw aiError('A IA demorou demais para responder. Tente novamente.', 504);
    throw aiError('Não foi possível falar com a IA agora.', 502);
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const known = payload as { error?: { message?: string } } | null;
    console.error('AI provider error', response.status, known?.error?.message ?? raw.slice(0, 200));
    throw aiError('A IA recusou a solicitação. Tente novamente.', 502);
  }

  const text = extractText(payload);
  if (!text) {
    throw aiError('A IA devolveu uma resposta vazia.', 502);
  }

  const usage = (payload as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  return {
    text,
    model: typeof (payload as { model?: string })?.model === 'string' ? (payload as { model: string }).model : aiModel(),
    usage: {
      inputTokens: Number(usage?.input_tokens ?? 0),
      outputTokens: Number(usage?.output_tokens ?? 0),
    },
  };
}
