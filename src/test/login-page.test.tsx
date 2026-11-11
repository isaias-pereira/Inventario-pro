/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../pages/LoginPage';
import { AuthProvider } from '../contexts/AuthContext';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, invokeFunction: invoke };
});

beforeEach(() => {
  cleanup();
  invoke.mockReset();
});

/** Renderiza a tela dentro do AuthProvider (a página usa `useAuth`). */
function renderLogin() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
}

/** Preenche usuário/senha e clica em Entrar. */
async function entrar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Digite seu usuário'), 'isa');
  await user.type(screen.getByPlaceholderText('Digite sua senha'), 'senha');
  await user.click(screen.getByRole('button', { name: /Entrar/ }));
}

describe('LoginPage — falhas', () => {
  it('mostra "usuário ou senha inválidos" quando a credencial está errada', async () => {
    invoke.mockResolvedValue({
      data: { success: false, error: 'Usuário ou senha inválidos' },
      error: null,
    });
    const user = userEvent.setup();
    renderLogin();

    await entrar(user);

    expect(await screen.findByText(/Usuário ou senha inválidos/)).toBeInTheDocument();
    expect(screen.queryByText(/hotspot/)).not.toBeInTheDocument();
  });

  it('mostra a orientação de rede quando o servidor não responde', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        name: 'FunctionsTimeoutError',
        message: 'O servidor do SGS-PRO não respondeu a tempo. A rede pode estar bloqueando o acesso.',
      },
    });
    const user = userEvent.setup();
    renderLogin();

    await entrar(user);

    expect(await screen.findByText(/não respondeu a tempo/)).toBeInTheDocument();
    expect(screen.getByText(/hotspot/)).toBeInTheDocument();
    expect(screen.getByText('inventario-pro-one.vercel.app')).toBeInTheDocument();
  });

  it('permite tentar de novo depois de uma falha de rede', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Não foi possível conectar ao servidor do SGS-PRO.' },
    });
    const user = userEvent.setup();
    renderLogin();

    await entrar(user);
    await screen.findByText(/Não foi possível conectar/);

    invoke.mockResolvedValue({
      data: { success: true, token: 'abc.def.ghi', user: { username: 'isa', role: 'admin' } },
      error: null,
    });
    await entrar(user);

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  });
});
