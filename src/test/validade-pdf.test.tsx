import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ValidadeView from '../components/ValidadeView';

const { invoke, save } = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' }, getToken: () => 'token', isAdmin: true }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('jspdf', () => ({
  jsPDF: vi.fn(function jsPDF() {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setFillColor: vi.fn(),
      rect: vi.fn(),
      setTextColor: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      text: vi.fn(),
      splitTextToSize: (value: string) => [value],
      addPage: vi.fn(),
      setPage: vi.fn(),
      getNumberOfPages: () => 1,
      save,
    };
  }),
}));

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  save.mockReset();
  window.localStorage.setItem('estoque_pro_token', 'token');
  invoke.mockResolvedValue({
    data: {
      items: [
        {
          id: '1',
          ean: 7891234,
          codigo: 100,
          descricao: 'BANANA PRATA',
          validade: new Date(Date.now() + 5 * 86400000).toISOString(),
          status: true,
          created_by: 'admin',
          quantidade: 3,
        },
      ],
    },
  });
});

it('downloads the expiry list as a PDF', async () => {
  const user = userEvent.setup();
  render(<ValidadeView />);

  await screen.findByText('BANANA PRATA');
  await user.click(screen.getByRole('button', { name: 'Baixar lista de validade em PDF' }));

  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(save.mock.calls[0][0]).toMatch(/^validade-\d{4}-\d{2}-\d{2}\.pdf$/);
});
