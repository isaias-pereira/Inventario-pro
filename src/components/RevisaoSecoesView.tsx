import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { invokeFunction } from '@/lib/api';
import { carregarCategorias, type Categoria } from '@/lib/categorias';
import { aplicarSecao, revisarSecoes, type PropostaSecao, type RevisaoSecoes } from '@/lib/ai-categoria';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Tags } from 'lucide-react';

/** Quantas gravações rodam ao mesmo tempo (cada uma é uma chamada à Function). */
const CONCURRENCIA_GRAVACAO = 5;

/**
 * Revisão da seção dos produtos por IA.
 *
 * A IA propõe a seção dos produtos que estão em "Outros" (ou sem seção).
 * **Nada é gravado sem a aprovação da pessoa**: cada proposta pode ser
 * ajustada e marcada antes de aplicar. A gravação usa a action
 * `set_categoria`, que valida a seção na taxonomia.
 */
const RevisaoSecoesView = () => {
  const { getToken } = useAuth();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  /** Quantos produtos já foram gravados na aplicação atual. */
  const [progresso, setProgresso] = useState(0);
  const [revisao, setRevisao] = useState<RevisaoSecoes | null>(null);
  /** Código do produto -> a pessoa marcou para aplicar? */
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  /** Código do produto -> seção escolhida (padrão: a proposta da IA). */
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});

  useEffect(() => {
    let ativo = true;
    carregarCategorias()
      .then(lista => { if (ativo) setCategorias(lista); })
      .catch(() => { if (ativo) setCategorias([]); });
    const token = getToken();
    void invokeFunction('ai-assist', {
      body: { action: 'config' },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    })
      .then(({ data, error }) => {
        if (ativo && !error) setAiEnabled(Boolean(data?.enabled));
      })
      .catch(() => undefined);
    return () => { ativo = false; };
  }, [getToken]);

  const propostas = useMemo(() => revisao?.propostas ?? [], [revisao]);
  const marcadas = useMemo(
    () => propostas.filter((item) => selecionados[item.codigo]),
    [propostas, selecionados],
  );

  const pedirRevisao = useCallback(async () => {
    setCarregando(true);
    try {
      const token = getToken();
      const resultado = await revisarSecoes({ token });
      setRevisao(resultado);
      setSelecionados(Object.fromEntries(resultado.propostas.map((item) => [item.codigo, true])));
      setEscolhas(Object.fromEntries(resultado.propostas.map((item) => [item.codigo, item.secaoCodigo])));
      if (resultado.candidatos.length === 0) {
        toast.success('Nenhum produto precisa de revisão de seção.');
      } else if (resultado.propostas.length === 0) {
        toast.warning('A IA não propôs nenhuma seção para este lote. Tente novamente em outro lote.');
      }
    } catch (error) {
      const status = (error as { context?: { status?: number } })?.context?.status;
      toast.error(
        status === 504
          ? 'A IA demorou demais para revisar. Tente novamente em instantes.'
          : error instanceof Error ? error.message : 'Não foi possível revisar as seções com a IA.',
      );
    } finally {
      setCarregando(false);
    }
  }, [getToken]);

  const aplicar = async () => {
    if (marcadas.length === 0) {
      toast.error('Selecione ao menos um produto para aplicar.');
      return;
    }
    const token = getToken();
    setAplicando(true);
    setProgresso(0);
    let aplicadas = 0;
    const falhas: string[] = [];

    // Uma chamada por produto: em paralelo, mas com limite para não
    // sobrecarregar a Function nem o navegador.
    const fila = marcadas.filter((item) => Boolean(escolhas[item.codigo]));
    let indice = 0;
    const worker = async () => {
      while (indice < fila.length) {
        const item = fila[indice];
        indice += 1;
        const secaoCodigo = escolhas[item.codigo];
        if (!secaoCodigo) continue;
        try {
          await aplicarSecao(item.codigo, secaoCodigo, token);
          aplicadas += 1;
        } catch (error) {
          falhas.push(`${item.codigo}: ${error instanceof Error ? error.message : 'erro'}`);
        }
        setProgresso(indice);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA_GRAVACAO, fila.length) }, () => worker()));

    setAplicando(false);
    setProgresso(0);
    if (aplicadas > 0) toast.success(`${aplicadas} produto(s) reclassificado(s).`);
    if (falhas.length > 0) {
      toast.error(`${falhas.length} produto(s) não puderam ser gravados.`, { description: falhas.slice(0, 3).join(' · ') });
    }
    if (aplicadas > 0) {
      // Recarrega a revisão: os itens corrigidos saem da lista de candidatos.
      await pedirRevisao();
    }
  };

  const nomeSecao = (codigo: string | undefined) =>
    categorias.find((item) => item.codigo === codigo)?.secao ?? codigo ?? '—';

  return (
    <div className="mx-auto max-w-3xl px-3 sm:px-4 py-6 sm:py-10">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Revisão de Seções
          </CardTitle>
          <CardDescription>
            A IA propõe a seção dos produtos que estão em “Outros” ou sem seção. Você confere,
            ajusta o que quiser e só então a classificação é gravada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!aiEnabled && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              A IA não está configurada neste ambiente. A classificação continua sendo feita
              manualmente no cadastro de produto.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void pedirRevisao()} disabled={carregando || aplicando || !aiEnabled} className="gap-2">
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {carregando ? 'Revisando...' : 'Revisar com IA'}
            </Button>
            {revisao && (
              <span className="text-xs text-muted-foreground">
                {revisao.candidatos.length} produto(s) no lote · {propostas.length} proposta(s)
              </span>
            )}
          </div>

          {revisao && revisao.avisos.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Observações da IA
              </p>
              <ul className="list-inside list-disc space-y-0.5">
                {revisao.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
              </ul>
            </div>
          )}

          {revisao && (
            <div className="space-y-2">
              {propostas.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Nenhuma proposta neste lote. Rode a revisão novamente para outro conjunto de produtos.
                </p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {propostas.map((item: PropostaSecao) => (
                      <li key={item.codigo} className="rounded-lg border border-border bg-background p-3">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={selecionados[item.codigo] === true}
                            onCheckedChange={(value) =>
                              setSelecionados(prev => ({ ...prev, [item.codigo]: value === true }))}
                            aria-label={`Aplicar seção de ${item.descricao}`}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div>
                              <p className="truncate text-sm font-medium text-foreground">{item.descricao}</p>
                              <p className="text-xs text-muted-foreground">
                                Código {item.codigo} · atual: {item.secaoAtual ?? 'sem seção'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Select
                                value={escolhas[item.codigo] ?? item.secaoCodigo}
                                onValueChange={(value) => setEscolhas(prev => ({ ...prev, [item.codigo]: value }))}
                              >
                                <SelectTrigger
                                  aria-label={`Seção de ${item.descricao}`}
                                  className="h-8 w-full text-xs sm:w-64"
                                >
                                  <SelectValue placeholder="Escolha a seção" />
                                </SelectTrigger>
                                <SelectContent>
                                  {categorias.map((categoria) => (
                                    <SelectItem key={categoria.codigo} value={categoria.codigo}>
                                      {categoria.secao}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-[11px] text-muted-foreground">
                                confiança {Math.round(item.confianca * 100)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">
                      {aplicando
                        ? `Gravando… ${progresso} de ${marcadas.length}`
                        : `${marcadas.length} de ${propostas.length} selecionado(s)`}
                    </p>
                    <Button onClick={() => void aplicar()} disabled={aplicando || marcadas.length === 0} className="gap-2">
                      {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {aplicando ? 'Gravando…' : `Aplicar ${marcadas.length} alteração(ões)`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {revisao && revisao.candidatos.length > 0 && propostas.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Os produtos deste lote continuam sem nova proposta — a seção atual deles é
              “{nomeSecao(revisao.candidatos[0]?.secaoAtual ?? undefined)}” ou nenhuma.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RevisaoSecoesView;
