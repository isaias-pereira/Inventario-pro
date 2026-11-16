import { useEffect, useMemo, useState } from 'react';
import { Copy, Printer, Search, QrCode, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { GUIAS, fotoPrincipal, urlGuia, type GuiaProduto } from '@/data/guias';
import { FotoProduto } from '@/components/guias/FotoProduto';
import { gerarQrDataUrl } from '@/lib/qr';

/**
 * Tela "Guias & QR Code" (admin e encarregado).
 *
 * O encarregado escolhe os produtos, imprime a folha de etiquetas e cola
 * o QR na banca. Cada QR abre a página pública `/g/<slug>` — o cliente não
 * precisa de login e o sistema não expõe nenhum dado interno.
 */
export default function GuiasAdminView() {
  const [busca, setBusca] = useState('');
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<string[]>([]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return GUIAS;
    return GUIAS.filter((guia) => guia.nome.toLowerCase().includes(termo));
  }, [busca]);

  // Gera o QR sob demanda (a biblioteca entra só aqui, por import dinâmico).
  useEffect(() => {
    let cancelado = false;
    const gerar = async () => {
      for (const guia of filtrados) {
        if (qrs[guia.slug]) continue;
        try {
          const data = await gerarQrDataUrl(urlGuia(guia.slug));
          if (!cancelado) {
            setQrs((atual) => ({ ...atual, [guia.slug]: data }));
          }
        } catch {
          // Falha no QR não pode derrubar a tela: o link continua utilizável.
        }
      }
    };
    void gerar();
    return () => {
      cancelado = true;
    };
  }, [filtrados, qrs]);

  const alternar = (slug: string) =>
    setSelecionados((atual) =>
      atual.includes(slug) ? atual.filter((s) => s !== slug) : [...atual, slug],
    );

  const copiar = async (guia: GuiaProduto) => {
    const link = urlGuia(guia.slug);
    try {
      await navigator.clipboard.writeText(link);
      toast.success(`Link do ${guia.nome} copiado.`);
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie o link manualmente.');
    }
  };

  const paraImprimir: GuiaProduto[] =
    selecionados.length > 0
      ? GUIAS.filter((guia) => selecionados.includes(guia.slug))
      : GUIAS;

  const imprimir = () => window.print();

  return (
    <div className="mx-auto w-full max-w-5xl px-3 pb-24 sm:px-4">
      <div className="no-print">
        <div className="mb-4 rounded-2xl border border-border bg-card/90 p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
          Guias & QR Code
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada QR abre a página pública do produto (sem login) na qual o cliente
          aprende a escolher no ponto certo. Marque os produtos e imprima a folha
          de etiquetas para colar nas bancas.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto..."
              aria-label="Buscar produto"
              className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              setSelecionados(
                selecionados.length === GUIAS.length ? [] : GUIAS.map((g) => g.slug),
              )
            }
            className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            {selecionados.length === GUIAS.length ? 'Limpar seleção' : 'Selecionar todos'}
          </button>
          <button
            type="button"
            onClick={imprimir}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir folha ({paraImprimir.length})
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Sem seleção, a folha sai com todos os {GUIAS.length} produtos.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtrados.map((guia) => {
          const marcado = selecionados.includes(guia.slug);
          return (
            <li
              key={guia.slug}
              className={`flex flex-col rounded-2xl border bg-card/90 p-3 shadow-sm transition ${
                marcado ? 'border-primary ring-1 ring-primary/30' : 'border-border'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
                  <FotoProduto
                    src={fotoPrincipal(guia)}
                    alt={guia.nome}
                    tipo={guia.tipo}
                    estagio={1}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{guia.nome}</p>
                  <p className="text-xs text-muted-foreground">{guia.familia}</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    /g/{guia.slug}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => alternar(guia.slug)}
                  aria-pressed={marcado}
                  aria-label={
                    marcado
                      ? `Remover ${guia.nome} da folha de impressão`
                      : `Incluir ${guia.nome} na folha de impressão`
                  }
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {marcado ? (
                    <CheckSquare className="h-5 w-5 text-primary" aria-hidden="true" />
                  ) : (
                    <Square className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1">
                  {qrs[guia.slug] ? (
                    <img
                      src={qrs[guia.slug]}
                      alt={`QR code do guia de ${guia.nome}`}
                      className="h-full w-full"
                    />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">gerando…</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => copiar(guia)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Copiar link
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelecionados([guia.slug]);
                      window.setTimeout(imprimir, 60);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md border border-input px-2 py-1.5 text-xs font-medium hover:bg-accent"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    Imprimir etiqueta
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {filtrados.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Nenhum produto encontrado para “{busca}”.
        </p>
      )}
      </div>

      {/* Folha de impressão (só no papel) */}
      <div className="hidden print:block">
        <style>{`@page { size: A4; margin: 8mm; }`}</style>
        <div className="grid grid-cols-2 gap-3">
          {paraImprimir.map((guia) => (
            <div
              key={guia.slug}
              className="flex items-center gap-2 rounded-lg border border-black/70 p-2"
            >
              <div className="h-[22mm] w-[22mm] shrink-0 overflow-hidden rounded border border-black/30">
                <FotoProduto
                  src={fotoPrincipal(guia)}
                  alt={guia.nome}
                  tipo={guia.tipo}
                  estagio={1}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight">{guia.nome}</p>
                <p className="text-[10px] leading-tight">{guia.resumo}</p>
                <p className="mt-1 text-[9px] uppercase tracking-wide">
                  Aponte a câmera · SGS-PRO
                </p>
              </div>
              <div className="h-[22mm] w-[22mm] shrink-0">
                {qrs[guia.slug] && (
                  <img src={qrs[guia.slug]} alt="" className="h-full w-full" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
