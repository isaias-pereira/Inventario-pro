import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from '@/components/Header';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'isaia', role: 'admin', loja: 103 },
    logout: vi.fn(),
    isAdmin: true,
    userRole: 'admin',
    loja: 103,
    lojas: [{ codigo: 103, nome: 'Loja 103', ativo: true }],
    switchLoja: vi.fn(),
  }),
}));

vi.mock('@/components/NotificationBell', () => ({ default: () => null }));

describe('Header', () => {
  it('shows the logged-in username next to the app name', () => {
    render(<Header currentView="inventario" onNavigate={() => {}} />);

    expect(screen.getByText('SGS-PRO')).toBeInTheDocument();
    expect(screen.getByText('isaia')).toBeInTheDocument();
  });

  it('shows the current store next to the username', () => {
    render(<Header currentView="inventario" onNavigate={() => {}} />);

    expect(screen.getByTitle('Loja 103')).toBeInTheDocument();
  });

  it('mostra o selo da loja no celular (sem esconder por breakpoint)', () => {
    render(<Header currentView="inventario" onNavigate={() => {}} />);

    const selo = screen.getByTitle('Loja 103');
    // Regressão: o selo já foi `hidden ... sm:inline-flex` e sumia no mobile.
    expect(selo.classList.contains('hidden')).toBe(false);
    expect(selo.classList.contains('inline-flex')).toBe(true);
    expect(selo.textContent).toContain('103');
  });

  it('no celular o header mostra o número da loja e esconde o nome do usuário', () => {
    render(<Header currentView="inventario" onNavigate={() => {}} />);

    const selo = screen.getByTitle('Loja 103');
    expect(selo.textContent).toContain('Loja 103');
    // O nome do usuário sai do header no celular para o selo caber.
    const usuario = screen.getByText('isaia');
    expect(usuario.classList.contains('hidden')).toBe(true);
    expect(usuario.classList.contains('sm:block')).toBe(true);
  });
});
