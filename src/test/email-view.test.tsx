/**
 * @vitest-environment jsdom
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailView from '../components/EmailView';

const { fetchEmails, addEmail, updateEmail, removeEmail, setDefaultEmail, saveEmailDefaults, useAuth } =
  vi.hoisted(() => ({
    fetchEmails: vi.fn(),
    addEmail: vi.fn(),
    updateEmail: vi.fn(),
    removeEmail: vi.fn(),
    setDefaultEmail: vi.fn(),
    saveEmailDefaults: vi.fn(),
    useAuth: vi.fn(() => ({
      user: { role: 'admin' as string },
      getToken: () => 'token',
      isAdmin: true,
      userRole: 'admin' as string,
    })),
  }));

vi.mock('@/lib/emails', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/emails')>();
  return {
    ...actual,
    fetchEmails,
    addEmail,
    updateEmail,
    removeEmail,
    setDefaultEmail,
    saveEmailDefaults,
  };
});
vi.mock('@/contexts/AuthContext', () => ({ useAuth }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const lista = [
  {
    id: '1',
    nome: 'Comercial — Matriz',
    email: 'comercial.matriz@empresa.com.br',
    padrao: true,
    ativo: true,
    created_by: 'admin',
    created_at: '2026-11-06T10:00:00.000Z',
  },
  {
    id: '2',
    nome: 'Comercial — Filial SP',
    email: 'comercial.sp@empresa.com.br',
    padrao: false,
    ativo: true,
    created_by: 'admin',
    created_at: '2026-11-06T11:00:00.000Z',
  },
];

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fetchEmails.mockResolvedValue({
    emails: lista,
    defaults: {
      assunto: 'Solicitação de rebaixa — {{data}}',
      mensagem: 'Segue {{quantidade}} produto(s)',
    },
  });
  useAuth.mockReturnValue({
    user: { role: 'admin' },
    getToken: () => 'token',
    isAdmin: true,
    userRole: 'admin',
  });
});

describe('tela de e-mail padrão', () => {
  it('lista os e-mails cadastrados e o padrão de assunto/mensagem', async () => {
    render(<EmailView />);

    expect(await screen.findByText('Comercial — Matriz')).toBeTruthy();
    expect(screen.getByText('comercial.sp@empresa.com.br')).toBeTruthy();
    expect(screen.getByText('Solicitação de rebaixa — {{data}}')).toBeTruthy();
    expect(screen.getByText('Segue {{quantidade}} produto(s)')).toBeTruthy();
  });

  it('cadastra um e-mail novo pelo diálogo', async () => {
    const user = userEvent.setup();
    render(<EmailView />);
    await screen.findByText('Comercial — Matriz');

    await user.click(screen.getByRole('button', { name: /Adicionar e-mail/ }));
    await user.type(screen.getByLabelText('Identificação'), 'Gerência de loja');
    await user.type(screen.getByLabelText('E-mail'), 'gerencia@empresa.com.br');
    await user.click(screen.getByRole('button', { name: 'Salvar e-mail' }));

    await waitFor(() => expect(addEmail).toHaveBeenCalledWith({
      nome: 'Gerência de loja',
      email: 'gerencia@empresa.com.br',
      padrao: false,
    }));
  });

  it('marca um cadastro como e-mail padrão', async () => {
    const user = userEvent.setup();
    render(<EmailView />);
    await screen.findByText('Comercial — Filial SP');

    await user.click(screen.getByRole('button', { name: /Usar como padrão/ }));

    await waitFor(() => expect(setDefaultEmail).toHaveBeenCalledWith('2'));
  });

  it('esconde o cadastro para quem não é admin', async () => {
    useAuth.mockReturnValue({
      user: { role: 'encarregado' },
      getToken: () => 'token',
      isAdmin: false,
      userRole: 'encarregado',
    });
    render(<EmailView />);

    expect(await screen.findByText('Comercial — Matriz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Adicionar e-mail/ })).toBeNull();
    expect(screen.getByText(/Você pode consultar os e-mails padrão/)).toBeTruthy();
  });

  it('avisa quando a lista está vazia', async () => {
    fetchEmails.mockResolvedValue({
      emails: [],
      defaults: { assunto: 'Assunto', mensagem: 'Mensagem' },
    });
    render(<EmailView />);

    expect(await screen.findByText('Nenhum e-mail cadastrado')).toBeTruthy();
  });
});
