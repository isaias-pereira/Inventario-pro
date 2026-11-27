import { AlertTriangle, CheckCircle2, FileText, Info, Scale } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPercent, pontosDaFicha, type FichaDefeito, type FichaFlv, type ProdutoFlv } from '@/lib/flv';

interface FichaFlvDialogProps {
  ficha: FichaFlv | null;
  produto?: ProdutoFlv | { codigo: string; descricao: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function grupoVariant(grupo: FichaDefeito['grupo']) {
  if (grupo === 'PODRIDAO') return 'destructive' as const;
  if (grupo === 'GRAVE') return 'default' as const;
  return 'secondary' as const;
}

function grupoLabel(grupo: FichaDefeito['grupo']) {
  if (grupo === 'PODRIDAO') return 'Podridão';
  if (grupo === 'GRAVE') return 'Grave';
  return 'Leve';
}

const FichaFlvDialog = ({ ficha, produto, open, onOpenChange }: FichaFlvDialogProps) => {
  if (!ficha) return null;
  const pontos = pontosDaFicha(ficha);
  const codigoProduto = produto && 'codigo' in produto ? produto.codigo : '';
  const descricaoProduto = produto && 'descricao' in produto ? produto.descricao : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-6">
            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              {ficha.titulo}
              <span className="ml-2 align-middle"><Badge variant="outline">{ficha.codigo}</Badge></span>
            </span>
          </DialogTitle>
          <DialogDescription>
            Ficha técnica FLV — {ficha.grupo}
            {ficha.revisao && <> · revisão {ficha.revisao}</>}
            {ficha.data_revisao && <> · {ficha.data_revisao}</>}
            {' '}· página {ficha.pagina_pdf} do PDF
          </DialogDescription>
        </DialogHeader>

        {produto && (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Produto consultado: </span>
            <span className="font-semibold">{descricaoProduto || codigoProduto}</span>
            {codigoProduto && <span className="ml-2 text-muted-foreground">cód. {codigoProduto}</span>}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs">
          {ficha.codigos.map((item) => (
            <Badge key={`${item.tipo}-${item.codigo}`} variant="secondary">
              {item.tipo === 'ENTRADA' ? 'E' : item.tipo === 'BALANCA' ? 'B' : 'EAN'} {item.codigo}
            </Badge>
          ))}
        </div>

        {pontos.length > 0 && (
          <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 text-amber-600" aria-hidden="true" /> Pontos de atenção
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {pontos.map((ponto, index) => <li key={index}>{ponto}</li>)}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Scale className="h-4 w-4 text-primary" aria-hidden="true" /> Defeitos e tolerâncias (CAT I)
          </h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead>Defeito</TableHead>
                  <TableHead className="text-right">CAT I</TableHead>
                  <TableHead className="text-right">CAT II</TableHead>
                  <TableHead>Detalhamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ficha.defeitos.map((defeito) => (
                  <TableRow key={defeito.ordem}>
                    <TableCell><Badge variant={grupoVariant(defeito.grupo)}>{grupoLabel(defeito.grupo)}</Badge></TableCell>
                    <TableCell className="font-medium">{defeito.nome}</TableCell>
                    <TableCell className="text-right">{defeito.cat1 === null ? '—' : formatPercent(defeito.cat1)}</TableCell>
                    <TableCell className="text-right">{defeito.cat2 === null ? '—' : formatPercent(defeito.cat2)}</TableCell>
                    <TableCell className="text-muted-foreground">{defeito.detalhe || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            Acima do CAT I: podridão rejeita; grave vai para rebaixa; leve vira ressalva. CAT II ainda precisa de confirmação com a Qualidade.
          </p>
        </section>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
          Fonte: {ficha.fonte}. Documento controlado — uma nova revisão vira nova versão, nunca sobrescreve o histórico.
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default FichaFlvDialog;
