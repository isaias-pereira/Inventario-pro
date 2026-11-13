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
  it('guarda a sessão pela validade do token (6 h) e não cria janela longa', async () => {
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
        <LoginButton />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBe('a.b.c'));
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('não envia a opção "lembrar-me" para o servidor', async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        token: 'a.b.c',
        expiresAt: Math.floor(Date.now() / 1000) + 6 * 3600,
        user: { username: 'isa', role: 'admin' },
      },
      error: null,
    });

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginButton />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(invoke).toHaveBeenCalled());
    const [, options] = invoke.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
    expect(options.body.remember).toBeUndefined();
    expect(options.body.username).toBe('isa');
  });
});
