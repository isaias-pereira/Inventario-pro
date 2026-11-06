import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  aiApiKey,
  aiConfigured,
  aiModel,
  buildChatPayload,
  DEFAULT_AI_MODEL,
  extractChatText,
  imageDataUrl,
} from '../../api/_lib/ai';

beforeEach(() => {
  delete process.env.NVIDIA_API_KEY;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

afterEach(() => {
  delete process.env.NVIDIA_API_KEY;
  delete process.env.AI_API_KEY;
  delete process.env.AI_MODEL;
});

describe('Cliente da API da NVIDIA', () => {
  it('usa a NVIDIA_API_KEY e cai no modelo padrão', () => {
    expect(aiConfigured()).toBe(false);
    process.env.NVIDIA_API_KEY = 'nvapi-teste';
    expect(aiConfigured()).toBe(true);
    expect(aiApiKey()).toBe('nvapi-teste');
    expect(aiModel()).toBe(DEFAULT_AI_MODEL);
    expect(DEFAULT_AI_MODEL).toBe('mistralai/mistral-large-4-1t-a52b');
  });

  it('aceita AI_API_KEY como apelido e AI_MODEL para trocar o modelo', () => {
    process.env.AI_API_KEY = 'apelido';
    process.env.AI_MODEL = 'outro/modelo';
    expect(aiApiKey()).toBe('apelido');
    expect(aiModel()).toBe('outro/modelo');
  });

  it('monta a requisição no formato Chat Completions', () => {
    process.env.NVIDIA_API_KEY = 'nvapi-teste';
    const payload = buildChatPayload({
      system: 'Você lê etiquetas.',
      prompt: 'Leia a etiqueta.',
      image: { base64: 'AAAA', mimeType: 'image/jpeg' },
    });

    expect(payload.model).toBe(DEFAULT_AI_MODEL);
    expect(payload.stream).toBe(false);
    expect(payload.max_tokens).toBe(1024);
    expect((payload.messages as { role: string }[])[0].role).toBe('system');

    const user = (payload.messages as { role: string; content: unknown }[])[1];
    expect(user.role).toBe('user');
    const parts = user.content as { type: string; image_url?: { url: string }; text?: string }[];
    expect(parts[0].type).toBe('image_url');
    expect(parts[0].image_url?.url).toBe('data:image/jpeg;base64,AAAA');
    expect(parts[1].type).toBe('text');
  });

  it('monta a requisição sem imagem (revisão de planilha)', () => {
    const payload = buildChatPayload({ system: 'S', prompt: 'P' });
    const user = (payload.messages as { role: string; content: unknown }[])[1];
    const parts = user.content as { type: string }[];
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('text');
  });

  it('envia reasoning_effort quando informado', () => {
    const payload = buildChatPayload({
      system: 'S',
      prompt: 'P',
      reasoningEffort: 'low',
    });
    expect(payload.reasoning_effort).toBe('low');
  });

  it('omite reasoning_effort quando não informado (o provedor recusa valores fora de low/medium/high)', () => {
    const payload = buildChatPayload({ system: 'S', prompt: 'P' });
    expect('reasoning_effort' in payload).toBe(false);
  });

  it('usa os tokens e a temperatura informados', () => {
    const payload = buildChatPayload({
      system: 'S',
      prompt: 'P',
      maxTokens: 2048,
      temperature: 0.1,
    });
    expect(payload.max_tokens).toBe(2048);
    expect(payload.temperature).toBe(0.1);
  });

  it('gera a data URL da imagem', () => {
    expect(imageDataUrl({ base64: 'Zm9v', mimeType: 'image/png' })).toBe('data:image/png;base64,Zm9v');
  });

  it('extrai o texto da resposta do provedor', () => {
    expect(extractChatText({ choices: [{ message: { content: '  olá  ' } }] })).toBe('olá');
    expect(extractChatText({ choices: [{ message: { content: [{ type: 'text', text: 'parte' }] } }] })).toBe('parte');
    expect(extractChatText({ choices: [] })).toBe('');
    expect(extractChatText(null)).toBe('');
  });
});
