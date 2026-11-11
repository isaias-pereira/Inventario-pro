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
});
