import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Send,
  Smartphone,
} from 'lucide-react';
import { invokeFunction } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface WhatsappConfigInfo {
  enabled: boolean;
  recipients: string[];
  recipientsCount: number;
  template: string;
  language: string;
  apiVersion: string;
  alertDays: number;
  maxItems: number;
  schedule: string[];
  cronSecretConfigured: boolean;
}

interface WhatsappPreview {
  enabled: boolean;
  alertDays: number;
  total: number;
  vencidos: number;
  hoje: number;
  proximos: number;
  summary: string;
  list: string;
  truncated: number;
  recipients: string[];
}

interface WhatsappSendResult {
  ok: boolean;
  total: number;
  enviados: number;
  falhas: number;
  erro?: string | null;
  results: Array<{ to: string; ok: boolean; error?: string }>;
}

/**
 * Diálogo "Enviar alerta por WhatsApp" da Validade.
 *
 * Mostra o estado da integração com a Meta, os destinatários configurados e a
 * mensagem exata (resumo + lista) antes de enviar. O envio automático é feito
 * pelos crons do servidor; este botão serve para testar e para disparar fora
 * do horário.
 */
export function WhatsappValidadeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<WhatsappConfigInfo | null>(null);
  const [preview, setPreview] = useState<WhatsappPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<WhatsappSendResult | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;

    setLoading(true);
    setError(null);
    setResult(null);
    setConfig(null);
    setPreview(null);

    Promise.all([
      invokeFunction<WhatsappConfigInfo>('manage-validade', { body: { action: 'whatsapp_config' } }),
      invokeFunction<WhatsappPreview>('manage-validade', { body: { action: 'whatsapp_preview' } }),
    ])
      .then(([configResult, previewResult]) => {
        if (!active) return;
        if (configResult.error) {
          setError(configResult.error.message);
          return;
        }
        setConfig(configResult.data);
        if (previewResult.error) {
          setError(previewResult.error.message);
          return;
        }
        setPreview(previewResult.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    setResult(null);

    const { data, error: sendError } = await invokeFunction<WhatsappSendResult>(
      'manage-validade',
      { body: { action: 'whatsapp_send' } },
    );
    setSending(false);

    if (sendError) {
      setError(sendError.message);
      toast.error(sendError.message);
      return;
    }
    if (!data) {
      setError('O servidor não devolveu o resultado do envio');
      return;
    }

    setResult(data);
    if (data.enviados > 0 && data.falhas === 0) {
      toast.success(`Alerta enviado para ${data.enviados} número(s)`);
    } else if (data.enviados > 0) {
      toast.warning(`Enviado para ${data.enviados} número(s); ${data.falhas} falhou(aram)`);
    } else {
      toast.error(data.erro || 'Nenhuma mensagem foi enviada');
    }
  };

  const canSend = Boolean(config?.enabled) && Boolean(preview && preview.total > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!sending) onOpenChange(next); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100">
              <MessageCircle className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            </span>
            Alerta por WhatsApp
          </DialogTitle>
          <DialogDescription>
            Envio pela API oficial da Meta. O automático sai às 07h e às 13h (horário de
            Brasília); aqui você confere e dispara na hora.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-10">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            <span className="text-sm text-muted-foreground">Carregando...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {config && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      config.enabled
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-800',
                    )}
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        config.enabled ? 'bg-emerald-500' : 'bg-amber-500',
                      )}
                      aria-hidden="true"
                    />
                    {config.enabled ? 'Integração ativa' : 'Integração não configurada'}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Template {config.template} · {config.language} · {config.apiVersion}
                  </span>
                </div>

                {config.enabled ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {config.recipients.map((phone) => (
                      <span
                        key={phone}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600"
                      >
                        {phone}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    <p>Configure as variáveis de ambiente na Vercel:</p>
                    <ul className="ml-4 list-disc space-y-0.5 font-mono text-[11px] text-slate-500">
                      <li>WHATSAPP_TOKEN</li>
                      <li>WHATSAPP_PHONE_NUMBER_ID</li>
                      <li>WHATSAPP_RECIPIENTS</li>
                    </ul>
                    <p className="text-[11px] text-slate-500">
                      O passo a passo está em <span className="font-mono">docs/whatsapp.md</span>.
                    </p>
                  </div>
                )}

                <p className="mt-2 text-[11px] text-slate-500">
                  Automático: {config.schedule.join(' e ')} · alerta para produtos vencendo em até{' '}
                  {config.alertDays} dia(s)
                  {!config.cronSecretConfigured && ' · CRON_SECRET ainda não configurado'}
                </p>
              </div>
            )}

            {preview && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Prévia da mensagem
                  </p>
                  <span className="text-[11px] text-slate-400">
                    {preview.total} produto(s)
                  </span>
                </div>

                {preview.total === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    Nenhum produto vence nos próximos {preview.alertDays} dia(s). Nada será
                    enviado.
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-[#e5f6ec] p-3 shadow-sm">
                    <p className="text-sm font-semibold text-emerald-950">{preview.summary}</p>
                    <p className="mt-2 max-h-44 overflow-y-auto break-words text-xs leading-relaxed text-emerald-900">
                      {preview.list}
                    </p>
                    {preview.truncated > 0 && (
                      <p className="mt-1 text-[11px] italic text-emerald-700">
                        A mensagem mostra os primeiros itens; o restante aparece no SGS-PRO.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {result && (
              <div
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm',
                  result.enviados > 0
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-700',
                )}
              >
                <p className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {result.enviados} enviado(s)
                  {result.falhas > 0 && ` · ${result.falhas} falha(s)`}
                </p>
                {result.erro && <p className="mt-1 text-xs">{result.erro}</p>}
                {result.falhas > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {result.results
                      .filter((item) => !item.ok)
                      .map((item) => (
                        <li key={item.to}>
                          {item.to}: {item.error}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-end gap-2">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Fechar
          </Button>
          <Button
            className="flex-1 gap-2 bg-emerald-600 text-white hover:bg-emerald-700 sm:flex-none"
            onClick={() => void send()}
            disabled={!canSend || sending || loading}
            title={!config?.enabled ? 'Integração do WhatsApp não configurada' : undefined}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar agora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default WhatsappValidadeDialog;
