/**
 * Cliente da API de IA — sempre server-side.
 *
 * Provedor: **NVIDIA Integrate API** (endpoint compatível com OpenAI Chat
 * Completions) — `https://integrate.api.nvidia.com/v1/chat/completions`.
 *
 * A chave (`NVIDIA_API_KEY`) vive somente nas variáveis de ambiente da Vercel:
 * ela nunca chega ao navegador. O frontend chama a Function `ai-assist` pelo
 * `invokeFunction`, como nas demais rotas.
 *
 * A chamada é feita por `fetch` — sem dependência nova no `package.json`. Para
 * trocar de provedor ou de modelo, mexer só neste arquivo (ou na env `AI_MODEL`).
 */

const AI_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

/** Modelo usado quando `AI_MODEL` não está configurada. */
export const DEFAULT_AI_MODEL = 'mistralai/mistral-large-4-1t-a52b';

/** Tempo máximo de espera pelo provedor (a Function tem `maxDuration` próprio). */
const DEFAULT_TIMEOUT_MS = 25000;

/** Tokens máximos da resposta (a tarefa é curta: extrair dados de uma imagem). */
const DEFAULT_MAX_TOKENS = 1024;

/** Temperatura baixa: a tarefa é extração de dados, não conversa. */
const DEFAULT_TEMPERATURE = 0.2;

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
  temperature?: number;
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

/**
 * Chave da API de IA.
 *
 * `NVIDIA_API_KEY` é o nome oficial; `AI_API_KEY` continua aceito como
 * apelido para não quebrar ambientes já configurados.
 */
export function aiApiKey(): string | null {
  const key = (process.env.NVIDIA_API_KEY || process.env.AI_API_KEY || '').trim();
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

/** Data URL da imagem (é o formato que a API da NVIDIA espera no vision). */
export function imageDataUrl(image: AiImage): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}

/**
 * Monta o corpo da requisição no formato Chat Completions.
 *
 * A imagem vai como `image_url` com data URL (é o formato do exemplo da NVIDIA).
 */
export function buildChatPayload(request: AiRequest): Record<string, unknown> {
  const content: Record<string, unknown>[] = [{ type: 'text', text: request.prompt }];
  if (request.image) {
    content.unshift({
      type: 'image_url',
      image_url: { url: imageDataUrl(request.image) },
    });
  }

  return {
    model: aiModel(),
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content },
    ],
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: request.temperature ?? DEFAULT_TEMPERATURE,
    top_p: 1,
    stream: false,
  };
}

/** Extrai o texto da resposta no formato Chat Completions. */
export function extractChatText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return '';
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  // Alguns modelos devolvem o conteúdo como lista de partes.
  if (Array.isArray(content)) {
    return content
      .filter((part): part is { type?: string; text?: string } => !!part && typeof part === 'object')
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }
  return '';
}

/**
 * Chama o provedor de IA e devolve o texto da resposta.
 *
 * Erros: 503 (sem chave), 502 (provedor recusou/respondeu errado), 504 (timeout).
 */
export async function callAi(request: AiRequest): Promise<AiResult> {
  const apiKey = aiApiKey();
  if (!apiKey) {
    throw aiError('IA não configurada (NVIDIA_API_KEY ausente).', 503);
  }

  if (request.image) {
    if (!isSupportedImageMime(request.image.mimeType)) {
      throw aiError('Formato de imagem não suportado.', 400);
    }
    if (!request.image.base64 || request.image.base64.length > MAX_IMAGE_BASE64_CHARS) {
      throw aiError('Imagem muito grande ou vazia.', 413);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildChatPayload(request)),
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
    const known = payload as { error?: { message?: string }; detail?: string } | null;
    const detail = known?.error?.message || known?.detail || raw.slice(0, 200);
    console.error('AI provider error', response.status, detail);
    // 400 costuma ser "este modelo não aceita imagem" ou parâmetro inválido.
    if (response.status === 400) {
      throw aiError('A IA recusou o pedido (o modelo pode não aceitar imagem ou o texto).', 502);
    }
    if (response.status === 401 || response.status === 403) {
      throw aiError('A chave da IA foi recusada. Verifique a configuração no servidor.', 502);
    }
    if (response.status === 429) {
      throw aiError('A IA está ocupada no momento. Tente novamente em instantes.', 429);
    }
    throw aiError('A IA recusou a solicitação. Tente novamente.', 502);
  }

  const text = extractChatText(payload);
  if (!text) {
    throw aiError('A IA devolveu uma resposta vazia.', 502);
  }

  const usage = (payload as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
  return {
    text,
    model: typeof (payload as { model?: string })?.model === 'string' ? (payload as { model: string }).model : aiModel(),
    usage: {
      inputTokens: Number(usage?.prompt_tokens ?? 0),
      outputTokens: Number(usage?.completion_tokens ?? 0),
    },
  };
}
