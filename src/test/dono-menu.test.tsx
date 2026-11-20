/**
 * Menu do dono do projeto.
 *
 * O dono (encarregado) vê Consulta e Metas na barra principal e Base de
 * Dados/Revisão de Seções no menu do usuário. O encarregado comum não vê nada
 * disso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const auth = vi.hoisted(() => ({
  atual: {} as Record<string, unknown>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => auth.atual,
}));

vi.mock('@/components/NotificationBell', () => ({ default: () => null }));

import Header from '@/components/Header';

function usuario(dono: boolean) {
  return {
    user: { username: dono ? 'Isaias' : 'Daycon', role: 'encarregado', loja: 103, dono },
    logout: vi.fn(),
    isAdmin: false,
    isDono: dono,
    userRole: 'encarregado',
    loja: 103,
    lojas: [],
    switchLoja: vi.fn(),
  };
}

async function abrirMenuDoUsuario() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /Menu do usuário/ }));
  return user;
}

beforeEach(() => {
  auth.atual = usuario(true) as unknown as Record<string, unknown>;
});

describe('Header — menu do dono do projeto', () => {
  it('mostra Consulta e Metas na barra principal', () => {
    render(<Header currentView="validade" onNavigate={() => {}} />);

    expect(screen.getByRole('button', { name: 'Consulta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Metas' })).toBeInTheDocument();
  });

  it('mostra Base de Dados e Revisão de Seções no menu do usuário', async () => {
    render(<Header currentView="validade" onNavigate={() => {}} />);
    await abrirMenuDoUsuario();

    expect(await screen.findByRole('menuitem', { name: /Base de Dados/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Revisão de Seções/ })).toBeInTheDocument();
  });

  it('não mostra as áreas extras para o encarregado comum', async () => {
    auth.atual = usuario(false) as unknown as Record<string, unknown>;
    render(<Header currentView="validade" onNavigate={() => {}} />);

    expect(screen.queryByRole('button', { name: 'Consulta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Metas' })).toBeNull();

    await abrirMenuDoUsuario();
    expect(await screen.findByRole('menuitem', { name: /Sair/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Base de Dados/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Revisão de Seções/ })).toBeNull();
  });
});
