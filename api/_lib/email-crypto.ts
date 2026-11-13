/**
 * Criptografia da senha do e-mail de envio.
 *
 * A senha da caixa do encarregado fica no banco (só o servidor lê), mas não
 * em texto puro: ela é gravada com AES-256-GCM, usando uma chave derivada do
 * segredo do servidor (`EMAIL_ENC_SECRET` ou, na falta, `JWT_SECRET`).
 *
 * O formato guardado é `iv.tag.dados` (base64). O IV é sorteado a cada
 * gravação, então a mesma senha nunca produz o mesmo texto guardado.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

export type CryptoEnv = Record<string, string | undefined>;

/**
 * Chave de 256 bits derivada do segredo do servidor.
 *
 * Trocar o segredo invalida as senhas já guardadas: nesse caso o envio volta
 * para a configuração padrão do servidor (sem conta do usuário).
 */
function deriveKey(env: CryptoEnv): Buffer {
  const secret = String(env.EMAIL_ENC_SECRET ?? env.JWT_SECRET ?? '').trim();
  if (!secret) {
    throw new Error('Nenhuma chave de criptografia configurada (EMAIL_ENC_SECRET ou JWT_SECRET)');
  }
  return createHash('sha256').update(`email-envio:${secret}`).digest();
}

/** Criptografa uma senha para gravação no banco. */
export function encryptSecret(plain: string, env: CryptoEnv = process.env): string {
  const value = String(plain ?? '');
  if (!value) throw new Error('Senha vazia');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, deriveKey(env), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

/** Decriptografa a senha guardada no banco. */
export function decryptSecret(payload: string, env: CryptoEnv = process.env): string {
  const parts = String(payload ?? '').split('.');
  if (parts.length !== 3) throw new Error('Senha criptografada em formato desconhecido');
  const [iv, tag, data] = parts;
  const decipher = createDecipheriv(ALGO, deriveKey(env), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
