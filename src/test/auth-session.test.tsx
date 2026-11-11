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

const TOKEN_KEY = 'estoque_pro_token';
const SESSION_KEY = 'estoque_pro_session';

/** Botão que chama `login` com os parâmetros escolhidos. */
function LoginButton({ remember }: { remember: boolean }) {
  const { login } = useAuth();
  return (
    <button type="button" onClick={() => void login('isa', 'senha123', remember)}>
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
  it('guarda a sessão por 7 dias quando "Lembrar-me" está marcado', async () => {
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
    invoke.mockResolvedValue({
      data: {
        success: true,
        token: 'a.b.c',
        expiresAt: exp,
        user: { username: 'isa', role: 'admin' },
      },
      error: null,
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginButton remember />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('a.b.c'));
    const sessao = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}') as { expiresAt: number };
    const dias = (sessao.expiresAt - Date.now()) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThan(7.1);
  });

  it('não guarda sessão longa sem "Lembrar-me"', async () => {
    const exp = Math.floor(Date.now() / 1000) + 6 * 3600;
    invoke.mockResolvedValue({
      data: {
        success: true,
        token: 'a.b.c',
        expiresAt: exp,
        user: { username: 'isa', role: 'admin' },
      },
      error: null,
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginButton remember={false} />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('a.b.c'));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('envia a opção "lembrar-me" para o servidor', async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        token: 'a.b.c',
        expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
        user: { username: 'isa', role: 'admin' },
      },
      error: null,
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginButton remember />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const [, options] = invoke.mock.calls[0] as unknown as [string, { body: { remember: boolean } }];
    expect(options.body.remember).toBe(true);
  });
});
