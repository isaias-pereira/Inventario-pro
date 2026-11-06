import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from '@/components/Header';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'isaia' },
    logout: vi.fn(),
    isAdmin: true,
    userRole: 'admin',
  }),
}));

vi.mock('@/components/NotificationBell', () => ({ default: () => null }));

describe('Header', () => {
  it('shows the logged-in username next to the app name', () => {
    render(<Header currentView="inventario" onNavigate={() => {}} />);

    expect(screen.getByText('SGS-PRO')).toBeInTheDocument();
    expect(screen.getByText('isaia')).toBeInTheDocument();
  });
});
