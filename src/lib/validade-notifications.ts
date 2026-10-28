export const DEFAULT_ALERT_DAYS = 4;
export const NOTIFICATION_HOURS: number[] = [7, 13];

export type ValidadeAlertStatus = 'vencido' | 'hoje' | 'proximo';

export interface ValidadeSourceItem {
  id: string;
  descricao: string;
  validade: string;
  quantidade: number;
  status: boolean;
}

export interface ValidadeAlert {
  id: string;
  descricao: string;
  validade: string;
  quantidade: number;
  daysUntil: number;
  status: ValidadeAlertStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SENT_SLOTS_PREFIX = 'validade_notif_sent_';

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysUntil(validade: string, now = new Date()): number {
  return Math.round((startOfDay(new Date(validade)).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

export function buildValidadeAlerts(
  items: ValidadeSourceItem[],
  alertDays: number,
  now = new Date(),
): ValidadeAlert[] {
  return items
    .filter((item) => item.status)
    .map((item) => {
      const days = daysUntil(item.validade, now);
      return {
        id: String(item.id),
        descricao: item.descricao,
        validade: item.validade,
        quantidade: item.quantidade,
        daysUntil: days,
        status: (days < 0 ? 'vencido' : days === 0 ? 'hoje' : 'proximo') as ValidadeAlertStatus,
      };
    })
    .filter((alert) => Number.isFinite(alert.daysUntil) && alert.daysUntil <= alertDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function buildNotificationBody(alerts: ValidadeAlert[], alertDays: number): string {
  const vencidos = alerts.filter((a) => a.status === 'vencido').length;
  const hoje = alerts.filter((a) => a.status === 'hoje').length;
  const proximos = alerts.filter((a) => a.status === 'proximo').length;

  const parts: string[] = [];
  if (vencidos > 0) parts.push(`${vencidos} vencido(s)`);
  if (hoje > 0) parts.push(`${hoje} vence(m) hoje`);
  if (proximos > 0) parts.push(`${proximos} em até ${alertDays} dia(s)`);

  return `${alerts.length} produto(s) em alerta de validade: ${parts.join(', ')}.`;
}

export function dateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function notificationTag(hour: number, date = new Date()): string {
  return `validade-${dateKey(date)}-${hour}h`;
}

export function readAlertDays(): number {
  try {
    const raw = localStorage.getItem('validade_alert_days');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 90 ? parsed : DEFAULT_ALERT_DAYS;
  } catch {
    return DEFAULT_ALERT_DAYS;
  }
}

export function getSentSlots(date = new Date()): number[] {
  try {
    const raw = localStorage.getItem(SENT_SLOTS_PREFIX + dateKey(date));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((hour): hour is number => typeof hour === 'number') : [];
  } catch {
    return [];
  }
}

export function markSlotSent(hour: number, date = new Date()): void {
  try {
    const slots = new Set(getSentSlots(date));
    slots.add(hour);
    localStorage.setItem(SENT_SLOTS_PREFIX + dateKey(date), JSON.stringify([...slots].sort((a, b) => a - b)));

    const todayKey = SENT_SLOTS_PREFIX + dateKey(date);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(SENT_SLOTS_PREFIX) && key !== todayKey) localStorage.removeItem(key);
    }
  } catch {
    /* storage indisponível: a notificação apenas pode repetir */
  }
}

export function nextSlotDate(hour: number, now = new Date()): Date {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export function slotsDueToday(now = new Date()): number[] {
  return NOTIFICATION_HOURS.filter((hour) => {
    const slot = new Date(now);
    slot.setHours(hour, 0, 0, 0);
    return slot.getTime() <= now.getTime();
  });
}
