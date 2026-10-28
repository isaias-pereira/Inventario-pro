import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ALERT_DAYS,
  buildNotificationBody,
  buildValidadeAlerts,
  getSentSlots,
  markSlotSent,
  nextSlotDate,
  readAlertDays,
  slotsDueToday,
  type ValidadeSourceItem,
} from '../lib/validade-notifications';

const isoDaysFrom = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
};

const item = (overrides: Partial<ValidadeSourceItem> = {}): ValidadeSourceItem => ({
  id: '1',
  descricao: 'IOGURTE NATURAL',
  validade: isoDaysFrom(new Date(2026, 9, 28), 1),
  quantidade: 3,
  status: true,
  ...overrides,
});

describe('alerta de validade', () => {
  const now = new Date(2026, 9, 28, 8, 0, 0);

  it('usa 4 dias como janela padrão', () => {
    expect(DEFAULT_ALERT_DAYS).toBe(4);
  });

  it('mantém itens até a janela e descarta os mais distantes', () => {
    const items = [
      item({ id: 'vencido', validade: isoDaysFrom(now, -1) }),
      item({ id: 'hoje', validade: isoDaysFrom(now, 0) }),
      item({ id: 'tres', validade: isoDaysFrom(now, 3) }),
      item({ id: 'quatro', validade: isoDaysFrom(now, 4) }),
      item({ id: 'cinco', validade: isoDaysFrom(now, 5) }),
      item({ id: 'inativo', validade: isoDaysFrom(now, 1), status: false }),
    ];

    const alerts = buildValidadeAlerts(items, 4, now);

    expect(alerts.map((a) => a.id)).toEqual(['vencido', 'hoje', 'tres', 'quatro']);
    expect(alerts[0].status).toBe('vencido');
    expect(alerts[1].status).toBe('hoje');
    expect(alerts[2].status).toBe('proximo');
  });

  it('resume o corpo da notificação', () => {
    const alerts = buildValidadeAlerts(
      [
        item({ id: 'a', validade: isoDaysFrom(now, -1) }),
        item({ id: 'b', validade: isoDaysFrom(now, 0) }),
        item({ id: 'c', validade: isoDaysFrom(now, 2) }),
        item({ id: 'd', validade: isoDaysFrom(now, 4) }),
      ],
      4,
      now,
    );

    expect(buildNotificationBody(alerts, 4)).toBe(
      '4 produto(s) em alerta de validade: 1 vencido(s), 1 vence(m) hoje, 2 em até 4 dia(s).',
    );
  });
});

describe('horários de notificação', () => {
  it('agenda o próximo horário válido', () => {
    const beforeSeven = new Date(2026, 9, 28, 6, 0, 0);
    expect(nextSlotDate(7, beforeSeven).getHours()).toBe(7);
    expect(nextSlotDate(7, beforeSeven).getDate()).toBe(28);

    const betweenSlots = new Date(2026, 9, 28, 8, 0, 0);
    expect(nextSlotDate(13, betweenSlots).getHours()).toBe(13);
    expect(nextSlotDate(13, betweenSlots).getDate()).toBe(28);

    const afterSlots = new Date(2026, 9, 28, 14, 0, 0);
    expect(nextSlotDate(7, afterSlots).getDate()).toBe(29);
  });

  it('lista apenas horários já alcançados no dia', () => {
    expect(slotsDueToday(new Date(2026, 9, 28, 6, 59, 0))).toEqual([]);
    expect(slotsDueToday(new Date(2026, 9, 28, 7, 0, 0))).toEqual([7]);
    expect(slotsDueToday(new Date(2026, 9, 28, 12, 0, 0))).toEqual([7]);
    expect(slotsDueToday(new Date(2026, 9, 28, 13, 0, 0))).toEqual([7, 13]);
    expect(slotsDueToday(new Date(2026, 9, 28, 20, 0, 0))).toEqual([7, 13]);
  });
});

describe('controle de envio por dia', () => {
  const day = new Date(2026, 9, 28, 10, 0, 0);

  beforeEach(() => {
    localStorage.clear();
  });

  it('não repete o mesmo horário no mesmo dia', () => {
    expect(getSentSlots(day)).toEqual([]);
    markSlotSent(7, day);
    markSlotSent(7, day);
    expect(getSentSlots(day)).toEqual([7]);

    markSlotSent(13, day);
    expect(getSentSlots(day)).toEqual([7, 13]);
  });

  it('zera o controle ao mudar de dia', () => {
    markSlotSent(7, day);
    const nextDay = new Date(2026, 9, 29, 8, 0, 0);
    expect(getSentSlots(nextDay)).toEqual([]);
  });

  it('lê a janela configurada com fallback de 4 dias', () => {
    expect(readAlertDays()).toBe(4);
    localStorage.setItem('validade_alert_days', '7');
    expect(readAlertDays()).toBe(7);
    localStorage.setItem('validade_alert_days', 'abc');
    expect(readAlertDays()).toBe(4);
  });
});
