/**
 * TEMPORÁRIO — diagnóstico de conectividade SMTP. Remover após o teste.
 *
 * Verifica se a Function consegue abrir conexão TLS com o servidor SMTP
 * configurado e se o login é aceito. Não envia nenhum e-mail.
 */

import { createTransport } from 'nodemailer';

const host = process.env.SMTP_HOST ?? '';
const port = Number(process.env.SMTP_PORT ?? 465);
const pass = process.env.SMTP_PASS ?? '';

/** Usuários tentados: o informado e a forma completa. */
const users = [process.env.SMTP_USER ?? '', 'isaiassilva@comper.com.br']
  .filter(Boolean)
  .filter((value, index, list) => list.indexOf(value) === index);

async function check(user: string) {
  const transporter = createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  await transporter.verify();
}

const handler = async (req: { method?: string }, res: {
  status(code: number): unknown;
  setHeader(name: string, value: string): void;
  end(payload?: unknown): void;
}) => {
  const results: Record<string, string> = {};
  for (const user of users) {
    try {
      await check(user);
      results[user] = 'OK';
    } catch (error) {
      results[user] = error instanceof Error ? error.message.slice(0, 200) : 'erro';
    }
  }
  res.status(200);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ host, port, results }));
};

export default handler;
