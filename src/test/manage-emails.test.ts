import { describe, expect, it } from 'vitest';
import {
  canManageEmails,
  canReadEmails,
  isUniqueViolation,
  normalizeEmail,
  normalizeId,
  normalizeMessage,
  normalizeName,
  normalizeSubject,
} from '../../api/manage-emails';
import { activeEmails, applyTemplate, defaultEmail, type EmailPadrao } from '../lib/emails';

function email(overrides: Partial<EmailPadrao> = {}): EmailPadrao {
  return {
    id: '1',
    nome: 'Comercial — Matriz',
    email: 'comercial.matriz@emper.com.br',
    padrao: false,
    ativo: true,
    created_by: 'admin',
    created_at: '2026-11-06T10:00:00.000Z',
    ...overrides,
  };
}

describe('permissões dos e-mails padrão', () => {
  it('libera a leitura para admin e encarregado', () => {
    expect(canReadEmails('admin')).toBe(true);
    expect(canReadEmails('encarregado')).toBe(true);
  });

  it('recusa os demais papéis', () => {
    expect(canReadEmails('enc_flv')).toBe(false);
    expect(canReadEmails('user')).toBe(false);
    expect(canReadEmails('promotor')).toBe(false);
    expect(canReadEmails('col_validade')).toBe(false);
    expect(canReadEmails(undefined)).toBe(false);
    expect(canReadEmails(null)).toBe(false);
  });

  it('restringe o cadastro ao admin', () => {
    expect(canManageEmails('admin')).toBe(true);
    expect(canManageEmails('encarregado')).toBe(false);
    expect(canManageEmails('enc_flv')).toBe(false);
    expect(canManageEmails(undefined)).toBe(false);
  });
});

describe('normalizeName', () => {
  it('ajusta espaços e devolve o nome', () => {
    expect(normalizeName('  Comercial   —  Matriz ')).toBe('Comercial — Matriz');
  });

  it('recusa nome vazio, longo ou de tipo errado', () => {
    expect(normalizeName('   ')).toBeNull();
    expect(normalizeName('a'.repeat(61))).toBeNull();
    expect(normalizeName('x'.repeat(60))).toHaveLength(60);
    expect(normalizeName(123)).toBeNull();
    expect(normalizeName(undefined)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('normaliza para minúsculas', () => {
    expect(normalizeEmail('  Comercial.Matriz@Empresa.COM.BR ')).toBe('comercial.matriz@empresa.com.br');
  });

  it('recusa e-mails inválidos', () => {
    expect(normalizeEmail('sem-arroba')).toBeNull();
    expect(normalizeEmail('sem@dominio')).toBeNull();
    expect(normalizeEmail('com espaco@empresa.com')).toBeNull();
    expect(normalizeEmail('dois@@empresa.com')).toBeNull();
    expect(normalizeEmail('um@empresa.com,outro@empresa.com')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(`${'a'.repeat(150)}@empresa.com`)).toBeNull();
  });
});

describe('normalizeSubject e normalizeMessage', () => {
  it('removem espaços das pontas', () => {
    expect(normalizeSubject('  Assunto  ')).toBe('Assunto');
    expect(normalizeMessage('  Mensagem  ')).toBe('Mensagem');
  });

  it('recusam textos vazios ou longos demais', () => {
    expect(normalizeSubject('   ')).toBeNull();
    expect(normalizeSubject('a'.repeat(201))).toBeNull();
    expect(normalizeMessage('')).toBeNull();
    expect(normalizeMessage('a'.repeat(2001))).toBeNull();
    expect(normalizeMessage(10)).toBeNull();
  });
});

describe('normalizeId', () => {
  it('aceita números e textos numéricos', () => {
    expect(normalizeId(12)).toBe(12);
    expect(normalizeId('12')).toBe(12);
    expect(normalizeId(' 7 ')).toBe(7);
  });

  it('recusa identificadores inválidos', () => {
    expect(normalizeId(0)).toBeNull();
    expect(normalizeId(-3)).toBeNull();
    expect(normalizeId(1.5)).toBeNull();
    expect(normalizeId('abc')).toBeNull();
    expect(normalizeId(undefined)).toBeNull();
  });
});

describe('isUniqueViolation', () => {
  it('reconhece o conflito de unicidade do Postgres', () => {
    expect(isUniqueViolation(Object.assign(new Error('conflito'), { code: '23505' }))).toBe(true);
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint'))).toBe(true);
  });

  it('ignora outros erros', () => {
    expect(isUniqueViolation(Object.assign(new Error('timeout'), { code: '57014' }))).toBe(false);
    expect(isUniqueViolation(new Error('syntax error'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe('applyTemplate', () => {
  const valores = { data: '05/11/2026', quantidade: 12, produtos: 'LEITE (4)' };

  it('troca as variáveis do assunto e da mensagem', () => {
    expect(applyTemplate('Rebaixa — {{data}}', valores)).toBe('Rebaixa — 05/11/2026');
    expect(applyTemplate('Segue {{quantidade}} produto(s)', valores)).toBe('Segue 12 produto(s)');
    expect(applyTemplate('Itens: {{produtos}}', valores)).toBe('Itens: LEITE (4)');
  });

  it('aceita as variáveis com espaços e troca todas as ocorrências', () => {
    expect(applyTemplate('{{ data }} e {{data}}', valores)).toBe('05/11/2026 e 05/11/2026');
    expect(applyTemplate('{{quantidade}} + {{ quantidade }}', valores)).toBe('12 + 12');
  });

  it('deixa o texto intacto quando não há variáveis', () => {
    expect(applyTemplate('Texto fixo', valores)).toBe('Texto fixo');
  });

  it('substitui {{produtos}} por vazio quando não há lista', () => {
    expect(applyTemplate('Itens: {{produtos}}', { data: '05/11/2026', quantidade: 0 })).toBe('Itens: ');
  });
});

describe('seleção dos e-mails padrão', () => {
  it('acha o e-mail padrão ativo', () => {
    const lista = [
      email({ id: '1' }),
      email({ id: '2', nome: 'Filial SP', email: 'sp@empresa.com.br', padrao: true }),
    ];
    expect(defaultEmail(lista)?.id).toBe('2');
  });

  it('ignora o padrão inativo', () => {
    const lista = [email({ id: '1', padrao: true, ativo: false })];
    expect(defaultEmail(lista)).toBeNull();
  });

  it('lista só os e-mails ativos', () => {
    const lista = [
      email({ id: '1' }),
      email({ id: '2', ativo: false }),
    ];
    expect(activeEmails(lista).map((item) => item.id)).toEqual(['1']);
  });
});
