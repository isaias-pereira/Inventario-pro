import { describe, expect, it } from 'vitest';
import {
  buildSignatureHtml,
  buildSignatureText,
  escapeHtml,
  signatureData,
  signatureEnabled,
} from '../../api/_lib/email-signature';

/**
 * A assinatura entra no fim de todo e-mail de rebaixa: nome, cargo, contato,
 * marca da empresa e marca parceira.
 */
describe('assinatura do e-mail', () => {
  it('usa os dados padrão do SGS-PRO', () => {
    const data = signatureData({});

    expect(data.nome).toBe('Isaias Pereira da Silva');
    expect(data.cargo).toBe('Encarregado(A)');
    expect(data.cargo2).toBe('F.L.V.');
    expect(data.telefone1).toBe('(65) 2128-2558');
    expect(data.telefone2).toBe('(65) 99336-7428');
    expect(data.empresa).toBe('COMPER');
    // A marca parceira não é inventada: só entra quando configurada.
    expect(data.parceiro).toBe('');
  });

  it('aceita sobrescrita por variável de ambiente', () => {
    const data = signatureData({
      EMAIL_SIGNATURE_NAME: 'Maria Souza',
      EMAIL_SIGNATURE_ROLE: 'Gerente',
      EMAIL_SIGNATURE_PHONE1: '(65) 3000-0000',
      EMAIL_SIGNATURE_COMPANY: 'OUTRA',
    });

    expect(data.nome).toBe('Maria Souza');
    expect(data.cargo).toBe('Gerente');
    expect(data.telefone1).toBe('(65) 3000-0000');
    expect(data.empresa).toBe('OUTRA');
  });

  it('monta o HTML com nome, contato e marcas', () => {
    const html = buildSignatureHtml({ email: 'isaiassilva@comper.com.br' }, {});

    expect(html).toContain('Isaias Pereira da Silva');
    expect(html).toContain('isaiassilva@comper.com.br');
    expect(html).toContain('(65) 2128-2558');
    expect(html).toContain('(65) 99336-7428');
    expect(html).toContain('COMPER');
    expect(html).toContain('Empresa Certificada');
  });

  it('não inventa marca parceira: a faixa só entra quando configurada', () => {
    const semParceiro = buildSignatureHtml({ email: 'isaiassilva@comper.com.br' }, {});
    expect(semParceiro).not.toContain('OFER TOPERA');

    const comParceiro = buildSignatureHtml({ email: 'isaiassilva@comper.com.br' }, {
      EMAIL_SIGNATURE_PARTNER: 'OFER TOPERA',
    });
    // A marca fica empilhada (uma linha por palavra), como na arte.
    expect(comParceiro).toContain('OFER');
    expect(comParceiro).toContain('TOPERA');
  });

  it('usa a arte original como imagem quando a URL está configurada', () => {
    const html = buildSignatureHtml({ email: 'isaiassilva@comper.com.br' }, {
      EMAIL_SIGNATURE_IMAGE_URL: 'https://exemplo.com/assinatura.png',
    });

    expect(html).toContain('<img src="https://exemplo.com/assinatura.png"');
    // A arte já tem tudo: não repete o bloco de contato em HTML.
    expect(html).not.toContain('Encarregado(A)');
  });

  it('usa a imagem da logo quando a URL está configurada', () => {
    const html = buildSignatureHtml({}, {
      EMAIL_SIGNATURE_LOGO_URL: 'https://exemplo.com/logo.png',
      EMAIL_SIGNATURE_PARTNER_LOGO_URL: 'https://exemplo.com/parceiro.png',
    });

    expect(html).toContain('<img src="https://exemplo.com/logo.png"');
    expect(html).toContain('<img src="https://exemplo.com/parceiro.png"');
  });

  it('monta também a versão em texto puro', () => {
    const texto = buildSignatureText({ email: 'isaiassilva@comper.com.br' }, {});

    expect(texto).toContain('Isaias Pereira da Silva');
    expect(texto).toContain('isaiassilva@comper.com.br');
    expect(texto.split('\n').length).toBeGreaterThan(3);
  });

  it('escapa HTML no texto inserido', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&#60;b&#62;a &#38; b&#60;/b&#62;');
  });

  it('pode ser desligada por variável de ambiente', () => {
    expect(signatureEnabled({})).toBe(true);
    expect(signatureEnabled({ EMAIL_SIGNATURE_ENABLED: 'true' })).toBe(true);
    expect(signatureEnabled({ EMAIL_SIGNATURE_ENABLED: 'false' })).toBe(false);
  });
});
