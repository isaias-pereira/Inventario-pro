/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WhatsappValidadeDialog from '@/components/WhatsappValidadeDialog';

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/api', () => ({ invokeFunction: invoke }));
vi.mock('sonner', () => ({ toast }));

const CONFIG = {
  enabled: true,
  recipients: ['5511*****9999'],
  recipientsCount: 1,
  template: 'alerta_validade_sgs',
  language: 'pt_BR',
  apiVersion: 'v23.0',
  alertDays: 4,
  maxItems: 30,
  schedule: ['07:00', '13:00'],
  cronSecretConfigured: true,
};

const PREVIEW = {
  enabled: true,
  alertDays: 4,
  total: 2,
  vencidos: 1,
  hoje: 1,
  proximos: 0,
  summary: '1 vencido · 1 vence hoje — 2 produtos no total.',
  list: 'ARROZ 5KG — 3 un — vencido (09/11/2026) • LEITE 1L — 2 un — vence hoje (10/11/2026)',
  truncated: 0,
  recipients: ['5511*****9999'],
};

/** Responde as ações do endpoint conforme a ação pedida. */
function mockInvoke(overrides: {
  config?: unknown;
  preview?: unknown;
  send?: unknown;
} = {}) {
  invoke.mockImplementation(async (_name: string, options: { body: { action: string } }) => {
    switch (options.body.action) {
      case 'whatsapp_config':
        return { data: overrides.config ?? CONFIG, error: null };
      case 'whatsapp_preview':
        return { data: overrides.preview ?? PREVIEW, error: null };
      case 'whatsapp_send':
        return {
          data: overrides.send ?? {
            ok: true,
            total: 2,
            enviados: 1,
            falhas: 0,
            results: [{ to: '5511*****9999', ok: true }],
          },
          error: null,
        };
      default:
        return { data: null, error: null };
    }
  });
}

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  Object.values(toast).forEach((fn) => fn.mockReset());
  mockInvoke();
});

describe('WhatsappValidadeDialog', () => {
  it('mostra o estado da integração e a prévia da mensagem', async () => {
    render(<WhatsappValidadeDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText('Integração ativa')).toBeInTheDocument();
    expect(screen.getByText('5511*****9999')).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.summary)).toBeInTheDocument();
    expect(screen.getByText(PREVIEW.list)).toBeInTheDocument();
    expect(screen.getByText(/07:00 e 13:00/)).toBeInTheDocument();
  });

  it('envia e mostra o resultado', async () => {
    const user = userEvent.setup();
    render(<WhatsappValidadeDialog open onOpenChange={() => {}} />);

    const button = await screen.findByRole('button', { name: /Enviar agora/ });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByText(/1 enviado\(s\)/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Alerta enviado para 1 número(s)');
    expect(invoke).toHaveBeenCalledWith('manage-validade', { body: { action: 'whatsapp_send' } });
  });

  it('desabilita o envio e explica a configuração quando a integração está inativa', async () => {
    mockInvoke({
      config: { ...CONFIG, enabled: false, recipients: [], recipientsCount: 0 },
      preview: { ...PREVIEW, enabled: false, total: 0, summary: '', list: '' },
    });
    render(<WhatsappValidadeDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText('Integração não configurada')).toBeInTheDocument();
    expect(screen.getByText('WHATSAPP_TOKEN')).toBeInTheDocument();
    expect(screen.getByText('WHATSAPP_PHONE_NUMBER_ID')).toBeInTheDocument();
    expect(screen.getByText('WHATSAPP_RECIPIENTS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar agora/ })).toBeDisabled();
  });

  it('mostra o erro quando o envio falha', async () => {
    const user = userEvent.setup();
    mockInvoke({
      send: {
        ok: false,
        total: 2,
        enviados: 0,
        falhas: 1,
        erro: 'Template not found',
        results: [{ to: '5511*****9999', ok: false, error: 'Template not found' }],
      },
    });
    render(<WhatsappValidadeDialog open onOpenChange={() => {}} />);

    const button = await screen.findByRole('button', { name: /Enviar agora/ });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByText('Template not found')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Template not found');
  });
});
