import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, FileText, Loader2, Save, ScanBarcode } from 'lucide-react';
import { toast } from 'sonner';
import BarcodeScanner from '@/components/BarcodeScanner';
import FichaFlvDialog from '@/components/FichaFlvDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  buscarFicha,
  calcularIndicadores,
  formatPercent,
  listarRecebimentos,
  registrarRecebimento,
  type DecisaoRecebimento,
  type FichaFlv,
  type ProdutoFlv,
  type RecebimentoFlv,
} from '@/lib/flv';

const DECISAO_LABEL: Record<DecisaoRecebimento, string> = {
  aprovado: 'Aprovado',
  ressalva: 'Ressalva',
  rebaixa: 'Rebaixa',
  rejeitado: 'Rejeitado',
};

function decisaoVariant(decisao: DecisaoRecebimento) {
  if (decisao === 'rejeitado') return 'destructive' as const;
  if (decisao === 'rebaixa') return 'default' as const;
  if (decisao === 'ressalva') return 'secondary' as const;
  return 'outline' as const;
}

const RecebimentoFlvView = () => {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ficha, setFicha] = useState<FichaFlv | null>(null);
  const [produto, setProduto] = useState<ProdutoFlv | null>(null);
  const [fichaAberta, setFichaAberta] = useState(false);
  const [amostra, setAmostra] = useState('30');
  const [contagens, setContagens] = useState<Record<number, number>>({});
  const [decisao, setDecisao] = useState<DecisaoRecebimento | null>(null);
  const [observacao, setObservacao] = useState('');
  const [recebimentos, setRecebimentos] = useState<RecebimentoFlv[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);

  const carregarLista = async () => {
    setCarregandoLista(true);
    const { data, error } = await listarRecebimentos();
    if (error) toast.error(error.message);
    else setRecebimentos(data?.recebimentos ?? []);
    setCarregandoLista(false);
  };

  useEffect(() => {
    void carregarLista();
  }, []);

  const buscar = async (valor: string) => {
    const limpo = valor.trim().replace(/\D/g, '');
    if (!limpo) return;
    setBuscando(true);
    setFicha(null);
    setProduto(null);
    setContagens({});
    setDecisao(null);
    const { data, error } = await buscarFicha(limpo);
    setBuscando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFicha(data?.ficha ?? null);
    setProduto(data?.produto ?? null);
    if (!data?.ficha) {
      toast('Produto sem ficha técnica no MVP', {
        description: 'A ficha só está disponível para os produtos selecionados na primeira leva.',
      });
    }
  };

  const amostraNumero = Number(amostra);
  const indicadores = useMemo(
    () => (ficha ? calcularIndicadores(ficha, amostraNumero, contagens) : null),
    [ficha, amostraNumero, contagens],
  );

  const setContagem = (ordem: number, valor: string) => {
    const numero = Number(valor);
    setContagens((atual) => ({
      ...atual,
      [ordem]: Number.isInteger(numero) && numero >= 0 ? numero : 0,
    }));
  };

  const salvar = async () => {
    if (!ficha || !codigo.trim()) return;
    if (!Number.isInteger(amostraNumero) || amostraNumero <= 0 || amostraNumero > 10000) {
      toast.error('Informe o tamanho da amostra (1 a 10000).');
      return;
    }
    if (!decisao) {
      toast.error('Escolha a decisão do recebimento.');
      return;
    }
    setSalvando(true);
    const defects = ficha.defeitos.map((defeito) => ({
      ordem: defeito.ordem,
      quantidade: Number(contagens[defeito.ordem] ?? 0) || 0,
    }));
    const { data, error } = await registrarRecebimento({
      codigo: codigo.trim(),
      amostra: amostraNumero,
      decisao,
      defeitos: defects,
      observacao: observacao.trim() || undefined,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data?.ok) {
      toast.success('Recebimento registrado', {
        description: decisao === 'rebaixa'
          ? 'Abra a Rebaixa para montar a oferta com motivo Qualidade.'
          : `${DECISAO_LABEL[decisao]} — ${ficha.titulo}`,
      });
      setContagens({});
      setDecisao(null);
      setObservacao('');
      void carregarLista();
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] px-3 sm:px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-1 flex items-center gap-2 text-xl sm:text-2xl font-bold text-white">
          <ClipboardCheck className="h-6 w-6" aria-hidden="true" /> Recebimento FLV
        </h2>
        <p className="mb-4 sm:mb-6 text-sm text-white/70">
          Bipe o código do produto, confira a ficha técnica e registre a qualidade da amostra.
        </p>

        <div className="flex gap-2">
          <BarcodeScanner onDetected={(scanned) => { setCodigo(scanned); void buscar(scanned); }} />
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') void buscar(codigo); }}
            placeholder="Código / EAN / PLU"
            inputMode="numeric"
            className="text-base sm:text-lg"
            autoFocus
          />
          <Button onClick={() => void buscar(codigo)} disabled={!codigo.trim() || buscando} className="gap-1.5 bg-primary px-3 text-primary-foreground hover:bg-primary/90 sm:px-4">
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />}
            <span className="hidden sm:inline">Buscar</span>
          </Button>
        </div>

        {ficha && (
          <div className="mt-6 overflow-hidden rounded-2xl border-2 border-primary/20 bg-card shadow-lg">
            <div className="flex items-center justify-between gap-3 bg-primary px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold text-primary-foreground">{ficha.titulo}</p>
                <p className="truncate text-xs text-primary-foreground/80">
                  {produto?.descricao || produto?.codigo || codigo} · {ficha.grupo} · {ficha.codigo}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setFichaAberta(true)} className="gap-1.5 shrink-0">
                <FileText className="h-4 w-4" /> Ficha técnica
              </Button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground" htmlFor="amostra-flv">Amostra (un/kg)</label>
                  <Input
                    id="amostra-flv"
                    value={amostra}
                    onChange={(e) => setAmostra(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    placeholder="30"
                  />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">Decisão</span>
                  <div className="flex flex-wrap gap-2">
                    {(['aprovado', 'ressalva', 'rebaixa', 'rejeitado'] as DecisaoRecebimento[]).map((opcao) => (
                      <Button
                        key={opcao}
                        type="button"
                        size="sm"
                        variant={decisao === opcao ? 'default' : 'outline'}
                        onClick={() => setDecisao(opcao)}
                      >
                        {DECISAO_LABEL[opcao]}
                      </Button>
                    ))}
                  </div>
                  {indicadores && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Sugestão pelo CAT I: <Badge variant={decisaoVariant(indicadores.sugestao)}>{DECISAO_LABEL[indicadores.sugestao]}</Badge>
                      {indicadores.violacoes.length > 0 && (
                        <Button type="button" variant="link" className="ml-2 h-auto p-0 text-xs" onClick={() => setDecisao(indicadores.sugestao)}>
                          aplicar sugestão
                        </Button>
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Defeito</TableHead>
                      <TableHead className="text-right">CAT I</TableHead>
                      <TableHead className="w-[110px] text-right">Qtd. na amostra</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {indicadores?.itens.map((item) => (
                      <TableRow key={item.ordem}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={item.grupo === 'PODRIDAO' ? 'destructive' : item.grupo === 'GRAVE' ? 'default' : 'secondary'}>
                              {item.grupo === 'PODRIDAO' ? 'Podridão' : item.grupo === 'GRAVE' ? 'Grave' : 'Leve'}
                            </Badge>
                            <span className="font-medium">{item.nome}</span>
                          </div>
                          {item.detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{item.detalhe}</p>}
                        </TableCell>
                        <TableCell className="text-right">{item.cat1 === null ? '—' : formatPercent(item.cat1)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={String(contagens[item.ordem] ?? 0)}
                            onChange={(e) => setContagem(item.ordem, e.target.value)}
                            inputMode="numeric"
                            className="h-8 w-20 text-right"
                            aria-label={`Quantidade de ${item.nome} na amostra`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={item.dentro === null ? 'outline' : item.dentro ? 'secondary' : 'destructive'}>
                            {formatPercent(item.percentual)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground" htmlFor="obs-flv">Observação</label>
                <Input
                  id="obs-flv"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Lote, fornecedor, temperatura na chegada…"
                  maxLength={500}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={() => void salvar()} disabled={salvando || !decisao} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Registrar recebimento
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">Últimos recebimentos da loja</h3>
            {carregandoLista && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          {recebimentos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro ainda nesta loja.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Ficha</TableHead>
                    <TableHead className="text-right">Amostra</TableHead>
                    <TableHead>Decisão</TableHead>
                    <TableHead>Defeitos</TableHead>
                    <TableHead>Por</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recebimentos.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-xs">{new Date(item.created_at).toLocaleString('pt-BR')}</TableCell>
                      <TableCell>
                        <div className="max-w-[220px] truncate font-medium" title={item.descricao ?? ''}>{item.descricao ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">{item.produto_codigo ?? item.produto_ean ?? ''}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{item.ficha_codigo ?? '—'}</Badge></TableCell>
                      <TableCell className="text-right">{item.amostra}</TableCell>
                      <TableCell><Badge variant={decisaoVariant(item.decisao)}>{DECISAO_LABEL[item.decisao]}</Badge></TableCell>
                      <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                        {Array.isArray(item.defeitos) && item.defeitos.length > 0
                          ? item.defeitos.map((d) => `${d.quantidade}× ${d.nome} (${formatPercent(d.percentual)})`).join('; ')
                          : '—'}
                        {item.observacao && <div className="mt-0.5 italic">{item.observacao}</div>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{item.created_by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <FichaFlvDialog ficha={ficha} produto={produto} open={fichaAberta} onOpenChange={setFichaAberta} />
    </div>
  );
};

export default RecebimentoFlvView;
