import { describe, expect, it, vi } from 'vitest';
import {
  buildTemplatePayload,
  buildValidadeDigest,
  daysUntilSaoPaulo,
  formatDateSaoPaulo,
  maskPhone,
  normalizePhone,
  parseRecipients,
  sanitizeParam,
  saoPauloDay,
  sendWhatsappTemplate,
  sendWhatsappToRecipients,
  slotFromSchedule,
  whatsappConfig,
  WhatsappError,
  type WhatsappConfig,
} from '../../api/_lib/whatsapp';

const CONFIG: WhatsappConfig = {
  enabled: true,
  token: 'token-secreto',
  phoneNumberId: '1234567890',
  recipients: ['5511999999999'],
  templateName: 'alerta_validade_sgs',
  templateLang: 'pt_BR',
  apiVersion: 'v23.0',
  alertDays: 4,
  maxItems: 30,
};

/** Resposta falsa do fetch, com o corpo em texto como a Meta devolve. */
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

describe('normalizePhone', () => {
  it('mantém número já normalizado com código do país', () => {
    expect(normalizePhone('5511999999999')).toBe('5511999999999');
  });

  it('remove máscara e adiciona o 55 em números brasileiros', () => {
    expect(normalizePhone('+55 (11) 99999-9999')).toBe('5511999999999');
    expect(normalizePhone('11 99999-9999')).toBe('5511999999999');
    expect(normalizePhone('(11) 3333-4444')).toBe('551133334444');
  });

  it('recusa valores vazios, curtos demais ou longos demais', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('1'.repeat(16))).toBeNull();
  });
});

describe('parseRecipients', () => {
  it('separa por vírgula, ponto e vírgula ou espaço e remove repetidos', () => {
    const result = parseRecipients(
      '5511999999999, +55 (11) 99999-9999; 5511888888888\n5511777777777',
    );
    expect(result).toEqual(['5511999999999', '5511888888888', '5511777777777']);
  });

  it('aceita número formatado com espaços e parênteses', () => {
    expect(parseRecipients('+55 (11) 99999-9999')).toEqual(['5511999999999']);
  });

  it('aceita lista separada só por espaço', () => {
    expect(parseRecipients('5511999999999 5511888888888')).toEqual([
      '5511999999999',
      '5511888888888',
    ]);
  });

  it('ignora entradas inválidas', () => {
    expect(parseRecipients('abc, 123, 5511999999999')).toEqual(['5511999999999']);
    expect(parseRecipients(undefined)).toEqual([]);
  });
});

describe('maskPhone', () => {
  it('mostra só o começo e o fim do número', () => {
    expect(maskPhone('5511999999999')).toBe('5511*****9999');
  });
});

describe('whatsappConfig', () => {
  it('fica desabilitada sem credenciais', () => {
    const config = whatsappConfig({});
    expect(config.enabled).toBe(false);
    expect(config.recipients).toEqual([]);
    expect(config.templateName).toBe('alerta_validade_sgs');
    expect(config.templateLang).toBe('pt_BR');
    expect(config.apiVersion).toBe('v23.0');
    expect(config.alertDays).toBe(4);
    expect(config.maxItems).toBe(30);
  });

  it('habilita com token, número e destinatários e aceita apelidos', () => {
    const config = whatsappConfig({
      WHATSAPP_ACCESS_TOKEN: 'token',
      WHATSAPP_PHONE_ID: '999',
      WHATSAPP_RECIPIENTS: '11999999999',
      WHATSAPP_TEMPLATE: 'outro_template',
      WHATSAPP_TEMPLATE_LANG: 'en_US',
      WHATSAPP_API_VERSION: '26.0',
      WHATSAPP_ALERT_DAYS: '7',
      WHATSAPP_MAX_ITEMS: '15',
    });
    expect(config.enabled).toBe(true);
    expect(config.token).toBe('token');
    expect(config.phoneNumberId).toBe('999');
    expect(config.recipients).toEqual(['5511999999999']);
    expect(config.templateName).toBe('outro_template');
    expect(config.templateLang).toBe('en_US');
    expect(config.apiVersion).toBe('v26.0');
    expect(config.alertDays).toBe(7);
    expect(config.maxItems).toBe(15);
  });

  it('usa os padrões quando os números são inválidos', () => {
    const config = whatsappConfig({
      WHATSAPP_TOKEN: 'token',
      WHATSAPP_PHONE_NUMBER_ID: '999',
      WHATSAPP_RECIPIENTS: '11999999999',
      WHATSAPP_ALERT_DAYS: 'abc',
      WHATSAPP_MAX_ITEMS: '0',
    });
    expect(config.alertDays).toBe(4);
    expect(config.maxItems).toBe(30);
  });
});

describe('datas em America/Sao_Paulo', () => {
  it('conta dias de calendário mesmo quando o UTC já virou o dia', () => {
    // 11/11 02:00 UTC = 10/11 23:00 em Brasília.
    const now = new Date('2026-11-11T02:00:00Z');
    expect(daysUntilSaoPaulo('2026-11-11T01:00:00Z', now)).toBe(0);
    expect(saoPauloDay(now)).toBe('2026-11-10');
  });

  it('devolve negativo para vencidos e positivo para próximos', () => {
    const now = new Date('2026-11-10T12:00:00Z');
    expect(daysUntilSaoPaulo('2026-11-09T12:00:00Z', now)).toBe(-1);
    expect(daysUntilSaoPaulo('2026-11-13T12:00:00Z', now)).toBe(3);
  });

  it('formata a data no fuso de Brasília', () => {
    expect(formatDateSaoPaulo('2026-11-10T02:00:00Z')).toBe('09/11/2026');
    expect(formatDateSaoPaulo('2026-11-10T12:00:00Z')).toBe('10/11/2026');
  });

  it('ignora data inválida', () => {
    expect(daysUntilSaoPaulo('não é data')).toBeNull();
    expect(formatDateSaoPaulo('não é data')).toBe('—');
  });
});

describe('buildValidadeDigest', () => {
  const now = new Date('2026-11-10T12:00:00Z'); // 10/11 09:00 em Brasília

  const rows = [
    { descricao: 'ARROZ 5KG', quantidade: 3, validade: '2026-11-09T12:00:00Z' },
    { descricao: 'FEIJÃO 1KG', quantidade: 2, validade: '2026-11-10T12:00:00Z' },
    { descricao: 'LEITE 1L', quantidade: 4, validade: '2026-11-12T12:00:00Z' },
    { descricao: 'CAFÉ 500G', quantidade: 1, validade: '2026-11-20T12:00:00Z' },
    { descricao: 'BANANA', quantidade: 2, validade: '2026-11-10T12:00:00Z', motivo: 'Qualidade' },
    { descricao: 'REMOVIDO', quantidade: 1, validade: '2026-11-10T12:00:00Z', status: false },
  ];

  it('filtra motivo, inativos e itens fora do prazo', () => {
    const digest = buildValidadeDigest(rows, 4, now);
    expect(digest.items.map((item) => item.descricao)).toEqual([
      'ARROZ 5KG',
      'FEIJÃO 1KG',
      'LEITE 1L',
    ]);
    expect(digest.total).toBe(3);
    expect(digest.vencidos).toBe(1);
    expect(digest.hoje).toBe(1);
    expect(digest.proximos).toBe(1);
  });

  it('monta o resumo com plural correto', () => {
    const digest = buildValidadeDigest(rows, 4, now);
    expect(digest.summary).toBe('1 vencido · 1 vence hoje · 1 vence em até 4 dias — 3 produtos no total.');
  });

  it('monta a lista em uma linha, com descrição, quantidade e validade', () => {
    const digest = buildValidadeDigest(rows, 4, now);
    expect(digest.list).not.toMatch(/[\r\n\t]/);
    expect(digest.list).toContain('ARROZ 5KG — 3 un — vencido (09/11/2026)');
    expect(digest.list).toContain('FEIJÃO 1KG — 2 un — vence hoje (10/11/2026)');
    expect(digest.list).toContain(' • ');
  });

  it('resume quando não há nenhum produto no período', () => {
    const digest = buildValidadeDigest([], 4, now);
    expect(digest.total).toBe(0);
    expect(digest.summary).toBe('Nenhum produto vence nos próximos 4 dias.');
    expect(digest.list).toBe('');
  });

  it('limita a quantidade de itens e avisa quantos ficaram de fora', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      descricao: `PRODUTO ${index + 1}`,
      quantidade: 1,
      validade: '2026-11-10T12:00:00Z',
    }));
    const digest = buildValidadeDigest(many, 4, now, 5);
    expect(digest.list.match(/PRODUTO/g)).toHaveLength(5);
    expect(digest.list).toContain('e mais 3 produtos');
    expect(digest.truncated).toBe(3);
  });
});

describe('sanitizeParam', () => {
  it('remove quebras de linha e tabs e colapsa espaços', () => {
    expect(sanitizeParam('  linha 1\nlinha 2\tfim  ')).toBe('linha 1 linha 2 fim');
  });

  it('corta no limite com reticências', () => {
    const result = sanitizeParam('a'.repeat(20), 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('buildTemplatePayload', () => {
  it('usa o template, o idioma e os dois parâmetros na ordem', () => {
    const payload = buildTemplatePayload(
      { to: '5511999999999', summary: 'Resumo', list: 'Lista' },
      CONFIG,
    );
    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5511999999999',
      type: 'template',
      template: {
        name: 'alerta_validade_sgs',
        language: { code: 'pt_BR' },
      },
    });
    expect(payload.template.components[0].parameters).toEqual([
      { type: 'text', text: 'Resumo' },
      { type: 'text', text: 'Lista' },
    ]);
  });
});

describe('sendWhatsappTemplate', () => {
  it('faz o POST no endpoint da Meta com o token no cabeçalho', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(200, { messages: [{ id: 'wamid.X' }] }));

    const result = await sendWhatsappTemplate(
      { to: '5511999999999', summary: 'Resumo', list: 'Lista' },
      CONFIG,
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({ to: '5511999999999', ok: true, messageId: 'wamid.X' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-secreto');
  });

  it('devolve a mensagem de erro da Meta', async () => {
    const fetchMock = vi.fn(async () => fakeResponse(400, {
      error: { message: 'Template not found', error_user_msg: 'Modelo não encontrado' },
    }));

    await expect(sendWhatsappTemplate(
      { to: '5511999999999', summary: 'Resumo', list: 'Lista' },
      CONFIG,
      fetchMock as unknown as typeof fetch,
    )).rejects.toMatchObject({
      name: 'WhatsappError',
      message: 'Modelo não encontrado',
    });
  });

  it('converte falha de rede em WhatsappError', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('ECONNRESET'); });

    await expect(sendWhatsappTemplate(
      { to: '5511999999999', summary: 'Resumo', list: 'Lista' },
      CONFIG,
      fetchMock as unknown as typeof fetch,
    )).rejects.toBeInstanceOf(WhatsappError);
  });

  it('recusa envio sem credenciais', async () => {
    await expect(sendWhatsappTemplate(
      { to: '5511999999999', summary: 'Resumo', list: 'Lista' },
      { ...CONFIG, token: null },
    )).rejects.toMatchObject({ status: 503 });
  });
});

describe('sendWhatsappToRecipients', () => {
  it('continua para os demais quando um número falha', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string };
      if (body.to === '5511888888888') return fakeResponse(400, { error: { message: 'inválido' } });
      return fakeResponse(200, { messages: [{ id: 'ok' }] });
    });

    const result = await sendWhatsappToRecipients(
      ['5511999999999', '5511888888888'],
      { summary: 'Resumo', list: 'Lista' },
      CONFIG,
      fetchMock as unknown as typeof fetch,
    );

    expect(result.enviados).toBe(1);
    expect(result.falhas).toBe(1);
    expect(result.results[1]).toMatchObject({ to: '5511888888888', ok: false, error: 'inválido' });
  });
});

describe('slotFromSchedule', () => {
  it('converte o cron UTC para o slot de Brasília', () => {
    expect(slotFromSchedule('0 10 * * *', 12)).toBe('manha');
    expect(slotFromSchedule('0 16 * * *', 7)).toBe('tarde');
    expect(slotFromSchedule('30 9 * * *', 12)).toBe('manha');
  });

  it('cai na hora atual quando o cabeçalho não existe', () => {
    expect(slotFromSchedule(undefined, 7)).toBe('manha');
    expect(slotFromSchedule(undefined, 13)).toBe('tarde');
  });
});
