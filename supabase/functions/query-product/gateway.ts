const GATEWAY_URL = 'https://connector-gateway.lovable.dev/neon';
export type Statement = { query: string; params?: unknown[] };
type Result = { rows: Record<string, unknown>[]; rowCount: number | null };
export type BatchResult = { results: Result[] };
function gatewayHeaders() {
  const key = Deno.env.get('LOVABLE_API_KEY');
  const connection = Deno.env.get('NEON_API_KEY');
  if (!key || !connection) throw new Error('Missing connector credentials');
  return { Authorization: `Bearer ${key}`, 'X-Connection-Api-Key': connection, 'Content-Type': 'application/json' };
}
export async function query<T = Result>(statement: string | Statement[], params: unknown[] = [], write = false): Promise<T> {
  const headers = gatewayHeaders();
  let response: Response;
  try { response = await fetch(`${GATEWAY_URL}/sql`, {
    method: 'POST', headers,
    body: JSON.stringify(typeof statement === 'string' ? { query: statement, params } : { queries: statement }),
    ...(write ? {} : { signal: AbortSignal.timeout(30000) }),
  }); } catch {
    throw Object.assign(new Error(write ? 'A alteração pode ter sido salva. Consulte antes de tentar novamente.' : 'O banco está temporariamente indisponível.'), { status: 503 });
  }
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch {
    throw Object.assign(new Error(write ? 'A alteração pode ter sido salva. Consulte antes de tentar novamente.' : 'Resposta inválida do banco de dados.'), { status: 503 });
  }
  if (!response.ok) {
    console.error('Neon request failed', response.status, data.code);
    const code = data.code;
    let message = 'Não foi possível consultar o banco de dados.';
    let status = 503;
    if (code === '22012') { message = 'O produto foi alterado ou um código/EAN já pertence a outro produto. Consulte novamente.'; status = 409; }
    else if (String(code).startsWith('23') || code === '40001') { message = 'Código ou EAN em conflito. Consulte o produto novamente.'; status = 409; }
    else if (String(code).startsWith('22')) { message = 'Valores inválidos para o cadastro.'; status = 400; }
    else if (code === '28P01' || code === '28000' || /^(password authentication failed|Control plane request failed: endpoint cannot be found)/.test(data.message || '')) { message = 'A conexão do banco precisa ser atualizada pelo responsável pelo aplicativo.'; }
    else if (/^(The endpoint has been disabled|Control plane request failed: endpoint is)/.test(data.message || '')) { message = 'O banco está indisponível. Verifique o serviço Neon.'; }
    else if (write && response.status === 502) { message = 'A alteração pode ter sido salva. Consulte antes de tentar novamente.'; }
    else if (response.status === 429) { message = 'Banco ocupado. Tente novamente em instantes.'; status = 429; }
    throw Object.assign(new Error(message), { status });
  }
  return data as T;
}
