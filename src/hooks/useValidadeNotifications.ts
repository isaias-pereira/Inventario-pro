import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ── Browser Push Notifications ──

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
    toast.success('Notificações push ativadas!');
    return true;
  }
  toast.error('Permissão de notificação negada.');
  return false;
}

export function getPushPermissionStatus(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function sendBrowserNotification(alerts: ValidadeAlert[]) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (alerts.length === 0) return;

  const vencidos = alerts.filter(i => i.status === 'vencido').length;
  const hoje = alerts.filter(i => i.status === 'hoje').length;
  const proximo = alerts.filter(i => i.status === 'proximo').length;

  const parts: string[] = [];
  if (vencidos > 0) parts.push(`${vencidos} vencido(s)`);
  if (hoje > 0) parts.push(`${hoje} vence(m) hoje`);
  if (proximo > 0) parts.push(`${proximo} vence(m) em breve`);

  const body = parts.join(', ');

  try {
    new Notification('⚠️ Alerta de Validade - Estoque Pro', {
      body,
      icon: '/placeholder.svg',
      tag: 'validade-alert',
      requireInteraction: true,
    });
  } catch (e) {
    console.error('Error sending browser notification:', e);
  }
}

function sendDailyMobileNotification(alerts: ValidadeAlert[]) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (alerts.length === 0) return;

  const hoje = alerts.filter(i => i.status === 'hoje').length;
  const vencidos = alerts.filter(i => i.status === 'vencido').length;
  const proximo = alerts.filter(i => i.status === 'proximo').length;
  const total = alerts.length;

  let body = `Existem ${total} produto(s) em alerta de validade.`;
  const details: string[] = [];
  if (vencidos > 0) details.push(`${vencidos} vencido(s)`);
  if (hoje > 0) details.push(`${hoje} vencendo hoje`);
  if (proximo > 0) details.push(`${proximo} vencendo em breve`);
  if (details.length > 0) body = details.join(', ') + '.';

  try {
    new Notification('📦 Alerta Diário - Estoque Pro (7h)', {
      body,
      icon: '/placeholder.svg',
      tag: 'validade-daily-7am',
      requireInteraction: true,
    });
  } catch (e) {
    console.error('Error sending daily notification:', e);
  }
}

interface ValidadeAlert {
  id: string;
  descricao: string;
  validade: string;
  quantidade: number;
  daysUntil: number;
  status: 'vencido' | 'hoje' | 'proximo';
}

function getToken(): string | null {
  try { return localStorage.getItem('estoque_pro_token'); } catch { return null; }
}

function getWebhookUrl(): string | null {
  try { return localStorage.getItem('zapier_webhook_url'); } catch { return null; }
}

export function setWebhookUrl(url: string) {
  try { localStorage.setItem('zapier_webhook_url', url); } catch { /* noop */ }
}

export function removeWebhookUrl() {
  try { localStorage.removeItem('zapier_webhook_url'); } catch { /* noop */ }
}

function getDailyNotifKey(): string {
  const now = new Date();
  return `daily_notif_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function wasDailyNotifSentToday(): boolean {
  try { return localStorage.getItem(getDailyNotifKey()) === 'sent'; } catch { return false; }
}

function markDailyNotifSent() {
  try {
    // Clean old keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('daily_notif_') && key !== getDailyNotifKey()) {
        localStorage.removeItem(key);
      }
    }
    localStorage.setItem(getDailyNotifKey(), 'sent');
  } catch { /* noop */ }
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

function checkAndScheduleDaily(fetchAndNotify: () => void) {
  const now = new Date();
  const target = new Date();
  target.setHours(7, 0, 0, 0);

  // If it's past 7:00 today and not sent yet, fire immediately
  if (now >= target && !wasDailyNotifSentToday()) {
    fetchAndNotify();
  }

  // Schedule next 7:00 AM check
  let next7am = new Date();
  next7am.setHours(7, 0, 0, 0);
  if (now >= next7am) {
    next7am.setDate(next7am.getDate() + 1);
  }
  const msUntil7am = next7am.getTime() - now.getTime();

  const timeoutId = setTimeout(() => {
    fetchAndNotify();
    // Then set interval for every 24h
    setInterval(fetchAndNotify, 24 * 60 * 60 * 1000);
  }, msUntil7am);

  return timeoutId;
}

export function useValidadeNotifications() {
  const [alerts, setAlerts] = useState<ValidadeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const toastShown = useRef(false);
  const webhookSent = useRef(false);
  const pushSent = useRef(false);

  const getAlertDays = () => {
    try { const v = localStorage.getItem('validade_alert_days'); return v ? parseInt(v, 10) : 2; } catch { return 2; }
  };

  const fetchAlerts = useCallback(async () => {
    const token = getToken();
    if (!token) { setLoading(false); return; }

    try {
      const { data, error } = await supabase.functions.invoke('manage-validade', {
        body: { action: 'list' },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error || !data?.items) { setLoading(false); return; }

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const urgentItems: ValidadeAlert[] = [];

      for (const item of data.items) {
        if (!item.status) continue;
        const valDate = new Date(item.validade);
        valDate.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((valDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays <= getAlertDays()) {
          urgentItems.push({
            id: item.id,
            descricao: item.descricao,
            validade: item.validade,
            quantidade: item.quantidade,
            daysUntil: diffDays,
            status: diffDays < 0 ? 'vencido' : diffDays === 0 ? 'hoje' : 'proximo',
          });
        }
      }

      urgentItems.sort((a, b) => a.daysUntil - b.daysUntil);
      setAlerts(urgentItems);

      // Show toast on first load
      if (!toastShown.current && urgentItems.length > 0) {
        toastShown.current = true;
        const vencidos = urgentItems.filter(i => i.status === 'vencido').length;
        const hoje = urgentItems.filter(i => i.status === 'hoje').length;
        const proximo = urgentItems.filter(i => i.status === 'proximo').length;

        const parts: string[] = [];
        if (vencidos > 0) parts.push(`${vencidos} vencido(s)`);
        if (hoje > 0) parts.push(`${hoje} vence(m) hoje`);
        if (proximo > 0) parts.push(`${proximo} vence(m) em breve`);

        toast.warning(`⚠️ Alerta de Validade: ${parts.join(', ')}`, {
          duration: 8000,
        });
      }

      // Send Zapier webhook on first load
      if (!webhookSent.current && urgentItems.length > 0) {
        webhookSent.current = true;
        sendZapierWebhook(urgentItems);
      }

      // Send browser push notification on first load
      if (!pushSent.current && urgentItems.length > 0) {
        pushSent.current = true;
        sendBrowserNotification(urgentItems);
      }
    } catch (e) {
      console.error('Error fetching validade alerts:', e);
    }
    setLoading(false);
  }, []);

  // Daily 7:00 AM notification
  const fetchAndSendDaily = useCallback(async () => {
    if (wasDailyNotifSentToday()) return;
    const token = getToken();
    if (!token) return;

    try {
      const { data, error } = await supabase.functions.invoke('manage-validade', {
        body: { action: 'list' },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (error || !data?.items) return;

      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const urgentItems: ValidadeAlert[] = [];

      for (const item of data.items) {
        if (!item.status) continue;
        const valDate = new Date(item.validade);
        valDate.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((valDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= getAlertDays()) {
          urgentItems.push({
            id: item.id,
            descricao: item.descricao,
            validade: item.validade,
            quantidade: item.quantidade,
            daysUntil: diffDays,
            status: diffDays < 0 ? 'vencido' : diffDays === 0 ? 'hoje' : 'proximo',
          });
        }
      }

      if (urgentItems.length > 0) {
        markDailyNotifSent();
        sendDailyMobileNotification(urgentItems);
        sendZapierWebhook(urgentItems);
      }
    } catch (e) {
      console.error('Error in daily 7am notification:', e);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const timeoutId = checkAndScheduleDaily(fetchAndSendDaily);
    return () => clearTimeout(timeoutId);
  }, [fetchAlerts, fetchAndSendDaily]);

  return { alerts, loading, alertCount: alerts.length, refetch: fetchAlerts };
}
