import { useState, useEffect } from 'react';
import { useMetas } from '@/contexts/MetasContext';
import { useAuth } from '@/contexts/AuthContext';
import { AlertCircle, TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Cell, LabelList } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ChartFilter = 'geral' | 'queda' | 'acima';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MetaTab = () => {
  const { metaItems, vendaItems, selectedMonth, selectedYear, setSelectedMonth, loadMonthData, isLoading } = useMetas();
  const { getToken } = useAuth();
  const [chartFilter, setChartFilter] = useState<ChartFilter>('geral');

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  useEffect(() => {
    const token = getToken();
    if (token) {
      loadMonthData(token, selectedYear, selectedMonth);
    }
  }, [selectedMonth, selectedYear, getToken, loadMonthData]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 p-6 sm:p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Carregando dados do mês...</p>
      </div>
    );
  }

  if (metaItems.length === 0 && vendaItems.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[160px] h-8 text-xs sm:text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((nome, i) => {
                const mes = i + 1;
                const isFuture = selectedYear === currentYear && mes > currentMonth;
                return (
                  <SelectItem key={mes} value={String(mes)} disabled={isFuture}>
                    {nome}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/50 p-6 sm:p-8 text-center">
          <AlertCircle className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground" />
          <p className="text-sm sm:text-base text-muted-foreground">
            Nenhum dado de metas carregado para {MESES[selectedMonth - 1]}. Acesse <strong>"Base de Dados"</strong> para importar as planilhas de Meta e Venda.
          </p>
        </div>
      </div>
    );
  }

  const diasRealizados = vendaItems.length;
  const diasPrevistos = metaItems.length;

  const metaRealizadaDias = metaItems.filter(m => vendaItems.some(v => v.dia === m.dia));
  const totalMetaRealizada = metaRealizadaDias.reduce((s, i) => s + i.meta, 0);
  const totalMeta = metaItems.reduce((s, i) => s + i.meta, 0);
  const totalVenda = vendaItems.reduce((s, i) => s + i.venda, 0);

  const percentDiff = totalMetaRealizada > 0 ? ((totalVenda - totalMetaRealizada) / totalMetaRealizada * 100) : 0;
  const projecaoMes = totalMeta * (1 + percentDiff / 100);

  const ultimoDiaRealizado = vendaItems.length > 0 ? Math.max(...vendaItems.map(v => v.dia)) : 0;
  const metaDoDia = metaItems.find(m => m.dia === ultimoDiaRealizado)?.meta || 0;
  const vendaDoDia = vendaItems.find(v => v.dia === ultimoDiaRealizado)?.venda || 0;
  const diaSuperouMeta = vendaDoDia > metaDoDia;
  const diaIgualMeta = vendaDoDia === metaDoDia;

  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const dataFormatada = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const metaDoSistema = metaItems.find(m => m.dia === diaHoje)?.meta || 0;

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const allDays = new Set([...metaItems.map(m => m.dia), ...vendaItems.map(v => v.dia)]);
  const allChartData = Array.from(allDays)
    .filter(dia => dia <= ultimoDiaRealizado)
    .sort((a, b) => a - b)
    .map(dia => {
      const meta = metaItems.find(m => m.dia === dia)?.meta || 0;
      const venda = vendaItems.find(v => v.dia === dia)?.venda || 0;
      const date = new Date(selectedYear, selectedMonth - 1, dia);
      const diaSemana = diasSemana[date.getDay()];
      const diffPercent = meta > 0 ? ((venda - meta) / meta * 100) : 0;
      const base = Math.min(venda, meta);
      const gap = venda < meta ? meta - venda : 0;
      const excess = venda > meta ? venda - meta : 0;
      return { dia: `${dia}`, label: `${dia}\n${diaSemana}`, meta, venda, diffPercent, base, gap, excess };
    });

  const chartData = allChartData.filter(d => {
    if (chartFilter === 'queda') return d.venda < d.meta;
    if (chartFilter === 'acima') return d.venda >= d.meta;
    return true;
  });

  const filterLabel = chartFilter === 'queda' ? 'Dias Abaixo da Meta' : chartFilter === 'acima' ? 'Dias Acima/Igual à Meta' : 'Meta × Venda por Dia';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Fixed month selector */}
      <div className="flex items-center gap-2">
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[160px] h-8 text-xs sm:text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESES.map((nome, i) => {
              const mes = i + 1;
              const isFuture = selectedYear === currentYear && mes > currentMonth;
              return (
                <SelectItem key={mes} value={String(mes)} disabled={isFuture}>
                  {nome}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Day indicator with visual status */}
      <div className={`col-span-2 rounded-xl border p-3 sm:p-4 flex items-center justify-between bg-white ${
        diaIgualMeta ? 'border-muted-foreground/30' : diaSuperouMeta ? 'border-emerald-500/30' : 'border-destructive/30'
      }`}>
        <div className="flex items-center gap-2">
          {diaIgualMeta ? <Minus className="h-5 w-5 text-muted-foreground" /> : diaSuperouMeta ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
          <div>
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Meta do Dia {ultimoDiaRealizado}</p>
            <p className="mt-1 text-base sm:text-xl font-bold text-primary">
              {metaDoDia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </div>
        <div className="text-right flex items-center gap-2">
          <div>
            <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Venda do Dia {ultimoDiaRealizado}</p>
            <p className={`mt-1 text-base sm:text-xl font-bold ${diaIgualMeta ? 'text-muted-foreground' : diaSuperouMeta ? 'text-emerald-500' : 'text-destructive'}`}>
              {vendaDoDia.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
          {diaIgualMeta ? <Minus className="h-5 w-5 text-muted-foreground" /> : diaSuperouMeta ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-xl border border-border bg-card p-3 sm:p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Realizado</p>
              <p className="mt-1 text-base sm:text-xl font-bold text-foreground">
                {totalVenda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Meta até o Período</p>
              <p className="mt-1 text-base sm:text-xl font-bold text-foreground">
                {totalMetaRealizada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[10px] text-muted-foreground">{diasRealizados} dias realizados</p>
            <p className={`text-[10px] font-semibold ${totalMetaRealizada > 0 ? (totalVenda / totalMetaRealizada * 100 >= 100 ? 'text-emerald-500' : 'text-destructive') : 'text-muted-foreground'}`}>
              {totalMetaRealizada > 0 ? `${(totalVenda / totalMetaRealizada * 100).toFixed(1)}%` : '0%'}
            </p>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${totalMetaRealizada > 0 && totalVenda / totalMetaRealizada >= 1 ? 'bg-emerald-500' : 'bg-destructive'}`}
              style={{ width: `${Math.min(totalMetaRealizada > 0 ? (totalVenda / totalMetaRealizada * 100) : 0, 100)}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Meta — {dataFormatada}</p>
          <p className="mt-1 text-base sm:text-xl font-bold text-foreground">
            {metaDoSistema.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">Dias {diasRealizados}/{diasPrevistos}</p>
          <p className={`mt-1 text-base sm:text-xl font-bold ${percentDiff >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
            {percentDiff >= 0 ? '+' : ''}{percentDiff.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground">Projeção: {projecaoMes.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
      </div>

      {/* Chart */}
      {allChartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 sm:mb-4">
            <h3 className="text-sm sm:text-base font-semibold text-foreground">{filterLabel}</h3>
            <div className="flex items-center gap-2">
              <Select value={chartFilter} onValueChange={(v) => setChartFilter(v as ChartFilter)}>
                <SelectTrigger className="w-[140px] h-8 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="geral">Geral</SelectItem>
                  <SelectItem value="queda">Queda</SelectItem>
                  <SelectItem value="acima">Acima</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
              Nenhum dia encontrado para o filtro selecionado.
            </div>
          ) : (
            <div className="w-full overflow-y-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <div style={{ height: Math.max(chartData.length * 32, 300) }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 60, left: 5, bottom: 5 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <YAxis
                      dataKey="label"
                      type="category"
                      tick={({ x, y, payload }) => {
                        const lines = (payload.value as string).split('\n');
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text x={-4} y={0} dy={-4} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={11} fontWeight={600}>{lines[0]}</text>
                            <text x={-4} y={0} dy={10} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={9} fontWeight={400}>{lines[1]}</text>
                          </g>
                        );
                      }}
                      width={40}
                      interval={0}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 9 }}
                      stroke="hsl(var(--muted-foreground))"
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: 12,
                        padding: '8px 12px',
                      }}
                      labelFormatter={(label) => `Dia ${(label as string).split('\n')[0]}`}
                      formatter={(value: number, name: string) => [value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), name]}
                      cursor={{ fill: 'hsl(var(--muted) / 0.3)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} iconType="square" iconSize={10} />
                    <Bar dataKey="base" name="Realizado" fill="hsl(142, 71%, 45%)" radius={[0, 0, 0, 0]} barSize={18} stackId="stack" />
                    <Bar dataKey="gap" name="Abaixo da Meta" fill="hsl(0, 72%, 51%)" radius={[0, 0, 0, 0]} barSize={18} stackId="stack" />
                    <Bar dataKey="excess" name="Acima da Meta" fill="hsl(142, 71%, 45%)" radius={[0, 4, 4, 0]} barSize={18} stackId="stack" legendType="none">
                      <LabelList
                        dataKey="diffPercent"
                        position="right"
                        content={({ x, y, width, value, height }: any) => {
                          const numValue = Number(value);
                          const color = numValue < 0 ? 'hsl(0, 72%, 51%)' : 'hsl(217, 71%, 53%)';
                          const label = `${numValue >= 0 ? '+' : ''}${numValue.toFixed(1)}%`;
                          return (
                            <text x={(x || 0) + (width || 0) + 6} y={(y || 0) + (height || 0) / 2} dy={4} fill={color} fontSize={10} fontWeight={600}>
                              {label}
                            </text>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MetaTab;
