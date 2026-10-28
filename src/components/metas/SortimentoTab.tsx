import { useMetas } from '@/contexts/MetasContext';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

const SORTIMENTO_ITEMS = [
  { codigo: '794961', nome: 'Melancia Fat. KG' },
  { codigo: '891169', nome: 'Salada Frutas KG' },
  { codigo: '1347560', nome: 'Melão Espanhol KG Picado' },
  { codigo: '1391909', nome: 'Abacaxi KG Picado' },
  { codigo: '1396846', nome: 'VG Suco 300ML Melancia Nat.' },
  { codigo: '1972111', nome: '(VG) Suco Natural 1 Litro Melancia' },
  { codigo: '3022455', nome: 'Morango C/ Nutella KG' },
  { codigo: '3022463', nome: 'Uva C/ Nutella KG' },
  { codigo: '736163', nome: 'Coco Seco KG S. Agua' },
  { codigo: '740713', nome: 'Melão Espanhol Fat KG' },
  { codigo: '1326830', nome: 'Melancia Baby Fatiada KG' },
  { codigo: '1347519', nome: 'VG Mamao Formosa KG Picado' },
  { codigo: '1347551', nome: 'VG Manga Tomy KG Picado' },
  { codigo: '1392638', nome: 'VG Melancia KG Picada' },
];

const SortimentoTab = () => {
  const { vendaSortimentoItems } = useMetas();

  if (vendaSortimentoItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 p-6 sm:p-8 text-center">
        <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
        <p className="text-sm sm:text-base text-muted-foreground">
          Nenhum dado de venda/sortimento carregado. Acesse <strong>"Base de Dados"</strong> para importar a planilha de Venda (Sortimento).
        </p>
      </div>
    );
  }

  // Compute days with/without sales for each sortimento item
  const allDays = new Set(vendaSortimentoItems.map(v => v.dia));
  const totalDays = allDays.size;

  const sortimentoData = SORTIMENTO_ITEMS.map(item => {
    const diasComVenda = new Set(
      vendaSortimentoItems.filter(v => v.codigo === item.codigo).map(v => v.dia)
    ).size;
    const diasSemVenda = totalDays - diasComVenda;
    const percentual = totalDays > 0 ? (diasComVenda / totalDays * 100) : 0;
    return { ...item, diasComVenda, diasSemVenda, percentual };
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <p className="text-sm text-muted-foreground">Total de dias analisados: <strong className="text-foreground">{totalDays}</strong></p>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {sortimentoData.map(item => (
          <div key={item.codigo} className="rounded-lg border border-border bg-card p-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-medium text-foreground text-sm">{item.nome}</p>
                <p className="text-xs text-muted-foreground">Cód: {item.codigo}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{item.percentual.toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">
                  <span className="text-success">{item.diasComVenda}d</span> / <span className="text-destructive">{item.diasSemVenda}d</span>
                </p>
              </div>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${item.percentual}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="text-center">Dias com Venda</TableHead>
              <TableHead className="text-center">Dias sem Venda</TableHead>
              <TableHead className="text-center">Presença %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortimentoData.map(item => (
              <TableRow key={item.codigo}>
                <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                <TableCell>{item.nome}</TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {item.diasComVenda}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <XCircle className="h-3.5 w-3.5" />
                    {item.diasSemVenda}
                  </span>
                </TableCell>
                <TableCell className="text-center font-semibold">{item.percentual.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default SortimentoTab;
