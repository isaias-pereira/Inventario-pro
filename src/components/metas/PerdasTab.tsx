import { useMetas } from '@/contexts/MetasContext';
import { AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

const PerdasTab = () => {
  const { perdaItems } = useMetas();

  if (perdaItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 p-6 sm:p-8 text-center">
        <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
        <p className="text-sm sm:text-base text-muted-foreground">
          Nenhum dado de perdas carregado. Acesse <strong>"Base de Dados"</strong> para importar a planilha de Perdas.
        </p>
      </div>
    );
  }

  // Sort by quantidade desc, take top 15
  const sorted = [...perdaItems].sort((a, b) => b.quantidade - a.quantidade);
  const top = sorted.slice(0, 15);
  const maxQtd = top[0]?.quantidade || 1;

  const chartData = top.map(item => ({
    name: item.produto.length > 10 ? item.produto.substring(0, 10) + '…' : item.produto,
    fullName: item.produto,
    codigo: item.codigo,
    quantidade: item.quantidade,
  }));

  const getBarColor = (qtd: number) => {
    const ratio = qtd / maxQtd;
    if (ratio >= 0.7) return 'hsl(0, 72%, 50%)';
    if (ratio >= 0.4) return 'hsl(38, 92%, 50%)';
    return 'hsl(217, 71%, 53%)';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <p className="text-sm text-muted-foreground">
          Total de itens perdidos: <strong className="text-foreground">{perdaItems.reduce((s, i) => s + i.quantidade, 0)}</strong> 
          {' '}em <strong className="text-foreground">{perdaItems.length}</strong> produto(s)
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 sm:p-6">
        <h3 className="mb-3 sm:mb-4 text-sm sm:text-base font-semibold text-foreground">Top Perdas (mais alarmantes)</h3>
        <div className="overflow-x-auto">
          <div style={{ minWidth: Math.max(chartData.length * 55, 300), height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 25, right: 5, left: 5, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                  formatter={(value: number, _name: string, props: any) => [
                    `${value} un.`,
                    props.payload.fullName,
                  ]}
                />
                <Bar dataKey="quantidade" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={getBarColor(entry.quantidade)} />
                  ))}
                  <LabelList dataKey="quantidade" position="top" style={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--foreground))' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerdasTab;
