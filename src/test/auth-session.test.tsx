/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, invokeFunction: invoke };
});

const USER_KEY = 'estoque_pro_user';

/** Botão que chama `login` com as credenciais escolhidas. */
function LoginButton() {
  const { login } = useAuth();
  return (
    <button type="button" onClick={() => void login('isa', 'senha123')}>
      Entrar
    </button>
  );
}

beforeEach(() => {
  cleanup();
  invoke.mockReset();
  localStorage.clear();
});

describe('sessão do SGS-PRO', () => {
  it('guarda o usuário no localStorage (sem token, que está no cookie HttpOnly)', async () => {
    const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
    // Mock auth-me call (on mount), login call, and optional list_lojas call
    invoke
      .mockResolvedValueOnce({ // auth-me
        data: { user: null },
        error: null,
      })
      .mockResolvedValueOnce({ // login
        data: {
          success: true,
          expiresAt: exp,
          user: { username: 'isa', role: 'admin' },
        },
        error: null,
      })
      .mockResolvedValue({ // list_lojas (optional, for admin)
        data: { lojas: [] },
        error: null,
      });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginButton />
      </AuthProvider>,
    );
    // Wait for AuthProvider to hydrate (button becomes clickable)
    const button = await screen.findByRole('button', { name: 'Entrar' });
    await user.click(button);

    await waitFor(() => {
      const stored = localStorage.getItem(USER_KEY);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.username).toBe('isa');
      expect(parsed.role).toBe('admin');
    });
  });

  it('não envia a opção "lembrar-me" para o servidor', async () => {
    invoke
      .mockResolvedValueOnce({ // auth-me
        data: { user: null },
        error: null,
      })
      .mockResolvedValueOnce({ // login
        data: {
          success: true,
          expiresAt: Math.floor(Date.now() / 1000) + 6 * 3600,
          user: { username: 'isa', role: 'admin' },
        },
        error: null,
      })
      .mockResolvedValue({ // list_lojas (optional, for admin)
        data: { lojas: [] },
        error: null,
      });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginButton />
      </AuthProvider>,
    );
    const button = await screen.findByRole('button', { name: 'Entrar' });
    await user.click(button);

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    // First call is auth-me, second is login
    const [, options] = invoke.mock.calls[1] as unknown as [string, { body: Record<string, unknown> }];
    expect(options.body.remember).toBeUndefined();
    expect(options.body.username).toBe('isa');
  });
});
