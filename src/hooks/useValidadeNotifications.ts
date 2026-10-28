import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  buildNotificationBody,
  buildValidadeAlerts,
  getSentSlots,
  markSlotSent,
  nextSlotDate,
  notificationTag,
  readAlertDays,
  slotsDueToday,
  NOTIFICATION_HOURS,
  type ValidadeAlert,
} from '@/lib/validade-notifications';

// ── Permissão de notificações ──

export async function requestPushPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    toast.error('Seu navegador não suporta notificações push.');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    toast.error('Notificações foram bloqueadas. Habilite nas configurações do navegador.');
    return false;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    toast.success('Notificações ativadas! Avisos às 07h e 13h.');
    return true;
  }
  toast.error('Permissão de notificação negada.');
  return false;
}

export function getPushPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

async function showValidadeNotification(alerts: ValidadeAlert[], hour: number, alertDays: number) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;

  const title = `⚠️ ${alerts.length} produto(s) vencendo - Estoque Pro`;
  const options: NotificationOptions = {
    body: buildNotificationBody(alerts, alertDays),
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: notificationTag(hour),
    data: { url: '/' },
  };

  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification(title, options);
    else new Notification(title, options);
    return true;
  } catch (e) {
    console.error('Error sending validade notification:', e);
    return false;
  }
}

// ── Webhook (WhatsApp via Zapier) ──

function getWebhookUrl(): string | null {
  try { return localStorage.getItem('zapier_webhook_url'); } catch { return null; }
}

export function setWebhookUrl(url: string) {
  try { localStorage.setItem('zapier_webhook_url', url); } catch { /* noop */ }
}

export function removeWebhookUrl() {
  try { localStorage.removeItem('zapier_webhook_url'); } catch { /* noop */ }
}

async function sendZapierWebhook(alerts: ValidadeAlert[]) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl || alerts.length === 0) return;

  const vencidos = alerts.filter(i => i.status === 'vencido');
  const hoje = alerts.filter(i => i.status === 'hoje');
  const proximo = alerts.filter(i => i.status === 'proximo');

  let message = '⚠️ *Alerta de Validade - Estoque Pro*\n\n';

  if (vencidos.length > 0) {
    message += '🔴 *VENCIDOS:*\n';
    vencidos.forEach(a => { message += `  • ${a.descricao} (Qtd: ${a.quantidade}) - ${new Date(a.validade).toLocaleDateString('pt-BR')}\n`; });
    message += '\n';
  }
  if (hoje.length > 0) {
    message += '🟠 *VENCEM HOJE:*\n';
    hoje.forEach(a => { message += `  • ${a.descricao} (Qtd: ${a.quantidade})\n`; });
    message += '\n';
  }
  if (proximo.length > 0) {
    message += '🟡 *VENCEM EM BREVE:*\n';
    proximo.forEach(a => { message += `  • ${a.descricao} (Qtd: ${a.quantidade}) - ${new Date(a.validade).toLocaleDateString('pt-BR')}\n`; });
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'no-cors',
      body: JSON.stringify({
        message,
        total_alerts: alerts.length,
        vencidos: vencidos.length,
        hoje: hoje.length,
        proximo: proximo.length,
        items: alerts.map(a => ({
          descricao: a.descricao,
          validade: a.validade,
          quantidade: a.quantidade,
          status: a.status,
        })),
        timestamp: new Date().toISOString(),
      }),
    });
    console.log('Zapier webhook sent successfully');
  } catch (e) {
    console.error('Error sending Zapier webhook:', e);
  }
}

// ── Token ──

function getToken(): string | null {
  try { return localStorage.getItem('estoque_pro_token'); } catch { return null; }
}

export function useValidadeNotifications() {
  const [alerts, setAlerts] = useState<ValidadeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const toastShown = useRef(false);
  const webhookSent = useRef(false);
  const notifying = useRef(false);

  const fetchAlerts = useCallback(async (): Promise<ValidadeAlert[] | null> => {
    const token = getToken();
    if (!token) { setLoading(false); return null; }

    try {
      const { data, error } = await supabase.functions.invoke('manage-validade', {
        body: { action: 'list_all' },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error || !Array.isArray(data?.items)) return null;

      const alertDays = readAlertDays();
      const urgentItems = buildValidadeAlerts(data.items, alertDays);
      setAlerts(urgentItems);

      if (!toastShown.current && urgentItems.length > 0) {
        toastShown.current = true;
        const vencidos = urgentItems.filter(i => i.status === 'vencido').length;
        const hoje = urgentItems.filter(i => i.status === 'hoje').length;
        const proximo = urgentItems.filter(i => i.status === 'proximo').length;

        const parts: string[] = [];
        if (vencidos > 0) parts.push(`${vencidos} vencido(s)`);
        if (hoje > 0) parts.push(`${hoje} vence(m) hoje`);
        if (proximo > 0) parts.push(`${proximo} vence(m) em até ${alertDays} dia(s)`);

        toast.warning(`⚠️ Alerta de Validade: ${parts.join(', ')}`, { duration: 8000 });
      }

      if (!webhookSent.current && urgentItems.length > 0) {
        webhookSent.current = true;
        void sendZapierWebhook(urgentItems);
      }

      return urgentItems;
    } catch (e) {
      console.error('Error fetching validade alerts:', e);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Dispara a notificação de um horário (07h/13h) e marca como enviada no dia.
  const notifySlot = useCallback(async (hour: number) => {
    if (notifying.current) return;
    if (getSentSlots().includes(hour)) return;

    notifying.current = true;
    try {
      const urgentItems = await fetchAlerts();
      // Falha de rede/token: não marca como enviado para tentar novamente depois.
      if (urgentItems === null) return;

      if (urgentItems.length > 0) {
        await showValidadeNotification(urgentItems, hour, readAlertDays());
      }
      markSlotSent(hour);
    } finally {
      notifying.current = false;
    }
  }, [fetchAlerts]);

  // Agenda o próximo horário (07h ou 13h) e reagenda após disparar.
  useEffect(() => {
    let timeoutId: number | undefined;
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) return;
      const now = new Date();
      const next = NOTIFICATION_HOURS
        .map((hour) => nextSlotDate(hour, now))
        .sort((a, b) => a.getTime() - b.getTime())[0];

      const delay = Math.max(1000, next.getTime() - now.getTime());
      timeoutId = window.setTimeout(() => {
        void notifySlot(next.getHours()).finally(scheduleNext);
      }, delay);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [notifySlot]);

  // Recupera horários perdidos (aba em background, dispositivo dormindo, app reaberto).
  useEffect(() => {
    const checkMissedSlots = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      const sent = getSentSlots();
      const pending = slotsDueToday().filter((hour) => !sent.includes(hour));
      if (pending.length === 0) return;

      const latest = Math.max(...pending);
      pending.filter((hour) => hour !== latest).forEach((hour) => markSlotSent(hour));
      void notifySlot(latest);
    };

    checkMissedSlots();
    document.addEventListener('visibilitychange', checkMissedSlots);
    window.addEventListener('focus', checkMissedSlots);
    return () => {
      document.removeEventListener('visibilitychange', checkMissedSlots);
      window.removeEventListener('focus', checkMissedSlots);
    };
  }, [notifySlot]);

  useEffect(() => {
    void fetchAlerts();
  }, [fetchAlerts]);

  return { alerts, loading, alertCount: alerts.length, refetch: fetchAlerts };
}
