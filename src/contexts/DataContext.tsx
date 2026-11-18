import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { invokeFunction, parseJwtPayload } from '@/lib/api';
import { toQuantity } from '@/lib/packaging';
import { loteAbertoDaResposta } from '@/lib/inventory';

export interface Product {
  codigo: string;
  descricao: string;
  estoque: number;
  preco: number;
  /** Seção (categoria) do produto no catálogo. */
  categoria_codigo?: string | null;
  secao?: string | null;
}

export interface InventoryItem {
  id?: string;
  ean: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  created_by?: string;
  /** Seção (categoria) do produto no catálogo. */
  categoria_codigo?: string | null;
  secao?: string | null;
}

interface LoteInfo {
  numero: number;
  nome?: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  finalized_at: string | null;
}

interface DataContextType {
  products: Product[];
  setProducts: (products: Product[]) => void;
  saveProducts: (products: Product[]) => Promise<void>;
  findByCode: (code: string) => Product | undefined;
  hasData: boolean;
  inventoryItems: InventoryItem[];
  setInventoryItems: (items: InventoryItem[]) => void;
  addOrUpdateInventoryItem: (item: Omit<InventoryItem, 'quantidade'>, quantidade: number, username?: string) => Promise<void>;
  updateInventoryItemQuantidade: (codigo: string, quantidade: number) => Promise<void>;
  removeInventoryItem: (codigo: string) => Promise<void>;
  clearAllInventory: () => Promise<void>;
  hasInventory: boolean;
  loading: boolean;
  fetchInventory: () => Promise<void>;
  currentLote: number | null;
  currentLoteNome: string | null;
  renameLote: (nome: string) => Promise<{ ok: boolean; error?: string }>;
  viewingLote: LoteInfo | null;
  listLotes: () => Promise<LoteInfo[]>;
  viewLote: (numero: number) => Promise<void>;
  exitViewLote: () => Promise<void>;
  finalizeLote: () => Promise<{ ok: boolean; error?: string }>;
  suspendLote: () => Promise<{ ok: boolean; error?: string }>;
  resumeLote: (numero: number) => Promise<{ ok: boolean; error?: string }>;
}

const DataContext = createContext<DataContextType | null>(null);

/** Item do inventário como vem do backend (com a seção do catálogo). */
interface InventoryItemRow {
  id?: string;
  ean: string;
  codigo: string;
  descricao: string;
  quantidade: number | string;
  created_by?: string | null;
  categoria_codigo?: string | null;
  secao?: string | null;
}

/** Item do inventário com a seção do catálogo (vem no join do backend). */
function mapInventoryItem(d: InventoryItemRow): InventoryItem {
  return {
    id: d.id, ean: d.ean, codigo: d.codigo, descricao: d.descricao,
    quantidade: toQuantity(d.quantidade), created_by: d.created_by || undefined,
    categoria_codigo: d.categoria_codigo ?? null, secao: d.secao ?? null,
  };
}

/** Intervalo de sincronização do inventário compartilhado (sem realtime). */
const INVENTORY_POLL_MS = 15_000;

function clearSession() {
  localStorage.removeItem('estoque_pro_user');
  window.location.reload();
}

/**
 * O inventário é operado por admin e encarregado. O `user`, o `promotor` e o
 * `col_validade` não têm acesso — nem devem disparar o polling (o endpoint
 * responde 403 e o DataContext limparia a sessão).
 */
async function podeUsarInventario(): Promise<boolean> {
  try {
    const { data, error } = await invokeFunction<{ user: { role: string } | null }>('auth', {
      body: { action: 'me' },
    });
    if (error || !data?.user) return false;
    return data.user.role === 'admin' || data.user.role === 'encarregado';
  } catch {
    return false;
  }
}

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItemsState] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [currentLote, setCurrentLote] = useState<number | null>(null);
  const [currentLoteNome, setCurrentLoteNome] = useState<string | null>(null);
  const [viewingLote, setViewingLote] = useState<LoteInfo | null>(null);
  const viewingRef = useRef<LoteInfo | null>(null);
  viewingRef.current = viewingLote;

  // Load consulta products from DB on init
  const fetchConsultaProducts = useCallback(async () => {
    try {
      const { data, error } = await invokeFunction('manage-consulta', { body: { action: 'list' } });
      if (!error && data?.items?.length > 0) {
        type ConsultaItem = {
          codigo?: string | number;
          descricao?: string;
          estoque?: number | string;
          preco?: number | string;
          categoria_codigo?: number | null;
          secao?: string | null;
        };
        setProducts(data.items.map((p: ConsultaItem) => ({
          codigo: p.codigo,
          descricao: p.descricao,
          estoque: Number(p.estoque) || 0,
          preco: Number(p.preco) || 0,
          categoria_codigo: p.categoria_codigo ?? null,
          secao: p.secao ?? null,
        })));
      }
    } catch (e) {
      console.error('Error fetching consulta products:', e);
    }
    setProductsLoading(false);
  }, []);

  const saveProducts = useCallback(async (items: Product[]) => {
    setProducts(items);
    try {
      await invokeFunction('manage-consulta', { body: { action: 'replace', products: items } });
    } catch (e) {
      console.error('Error saving consulta products:', e);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    if (!await podeUsarInventario()) {
      setLoading(false);
      return;
    }

    // if viewing a finalized lote, fetch that one (read-only) instead
    const viewing = viewingRef.current;
    try {
      if (viewing) {
        const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'get_lote', lote_numero: viewing.numero } });
        if (!error && data?.items) {
          setInventoryItemsState(data.items.map(mapInventoryItem));
        }
      } else {
        const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'list' } });
        if (!error && data?.items) {
          setInventoryItemsState(data.items.map(mapInventoryItem));
          // O inventário é por usuário: sem lote aberto, `lote_numero` vem nulo
          // e o cabeçalho precisa voltar a "sem lote" (não pode manter o antigo).
          const lote = loteAbertoDaResposta(data);
          setCurrentLote(lote.numero);
          setCurrentLoteNome(lote.nome);
        }
      }
    } catch (e) {
      console.error('Error fetching inventory:', e);
    }
    setLoading(false);
  }, []);

  const listLotes = useCallback(async (): Promise<LoteInfo[]> => {
    const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'list_lotes' } });
    if (error || !data?.lotes) return [];
    return data.lotes as LoteInfo[];
  }, []);

  const viewLote = useCallback(async (numero: number) => {
    const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'get_lote', lote_numero: numero } });
    if (error || !data) return;
    setViewingLote(data.lote || { numero, status: 'finalizado', created_by: null, created_at: '', finalized_at: null });
    setInventoryItemsState((data.items || []).map(mapInventoryItem));
  }, []);

  const exitViewLote = useCallback(async () => {
    setViewingLote(null);
    viewingRef.current = null;
    await fetchInventoryInternal();
  }, []);

  const finalizeLote = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'finalize' } });
    if (error) return { ok: false, error: 'Erro ao finalizar lote' };
    if (data?.error) return { ok: false, error: data.error };
    await fetchInventoryInternal();
    return { ok: true };
  }, []);

  const suspendLote = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'suspend' } });
    if (error) return { ok: false, error: 'Erro ao suspender lote' };
    if (data?.error) return { ok: false, error: data.error };
    setInventoryItemsState([]);
    setCurrentLote(null);
    setCurrentLoteNome(null);
    await fetchInventoryInternal();
    return { ok: true };
  }, []);

  const renameLote = useCallback(async (nome: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'rename', nome } });
    if (error) return { ok: false, error: 'Erro ao nomear lote' };
    if (data?.error) return { ok: false, error: data.error };
    setCurrentLoteNome(data?.nome ?? nome);
    return { ok: true };
  }, []);

  const resumeLote = useCallback(async (numero: number): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeFunction('manage-inventory', { body: { action: 'resume', lote_numero: numero } });
    if (error) return { ok: false, error: 'Erro ao retomar lote' };
    if (data?.error) return { ok: false, error: data.error };
    setViewingLote(null);
    viewingRef.current = null;
    await fetchInventoryInternal();
    return { ok: true };
  }, []);

  // Internal fetch wrapper to avoid TDZ
  async function fetchInventoryInternal() {
    const viewing = viewingRef.current;
    if (viewing) {
      const { data } = await invokeFunction('manage-inventory', { body: { action: 'get_lote', lote_numero: viewing.numero } });
      if (data?.items) setInventoryItemsState(data.items.map(mapInventoryItem));
    } else {
      const { data } = await invokeFunction('manage-inventory', { body: { action: 'list' } });
      if (data?.items) {
        setInventoryItemsState(data.items.map(mapInventoryItem));
        // O inventário é por usuário: sem lote aberto, `lote_numero` vem nulo.
        const lote = loteAbertoDaResposta(data);
        setCurrentLote(lote.numero);
        setCurrentLoteNome(lote.nome);
      }
    }
  }

  useEffect(() => {
    fetchConsultaProducts();
  }, [fetchConsultaProducts]);

  // Sem canais em tempo real (o backend agora são funções serverless):
  // o inventário compartilhado é sincronizado por polling e quando a aba
  // volta a ficar visível.
  useEffect(() => {
    if (!podeUsarInventario()) {
      setInventoryItemsState([]);
      setLoading(false);
      return;
    }

    fetchInventory();

    const interval = window.setInterval(fetchInventory, INVENTORY_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) fetchInventory();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchInventory]);

  const setInventoryItems = useCallback((items: InventoryItem[]) => {
    setInventoryItemsState(items);
  }, []);

  const findByCode = useCallback(
    (code: string) => products.find((p) => p.codigo === code),
    [products]
  );

  const addOrUpdateInventoryItem = useCallback(
    async (item: Omit<InventoryItem, 'quantidade'>, quantidade: number) => {
      const { error } = await invokeFunction('manage-inventory', {
        body: {
          action: 'add',
          item: { ean: item.ean, codigo: item.codigo, descricao: item.descricao },
          quantidade,
        },
      });
      if (!error) await fetchInventory();
    },
    [fetchInventory]
  );

  const updateInventoryItemQuantidade = useCallback(
    async (codigo: string, quantidade: number) => {
      const { error } = await invokeFunction('manage-inventory', {
        body: { action: 'update', codigo, quantidade },
      });
      if (!error) await fetchInventory();
    },
    [fetchInventory]
  );

  const removeInventoryItem = useCallback(
    async (codigo: string) => {
      const { error } = await invokeFunction('manage-inventory', {
        body: { action: 'remove', codigo },
      });
      if (!error) await fetchInventory();
    },
    [fetchInventory]
  );

  const clearAllInventory = useCallback(async () => {
    const { error } = await invokeFunction('manage-inventory', {
      body: { action: 'clear' },
    });
    if (!error) await fetchInventory();
  }, [fetchInventory]);

  return (
    <DataContext.Provider
      value={{
        products,
        setProducts,
        saveProducts,
        findByCode,
        hasData: products.length > 0,
        inventoryItems,
        setInventoryItems,
        addOrUpdateInventoryItem,
        updateInventoryItemQuantidade,
        removeInventoryItem,
        clearAllInventory,
        hasInventory: inventoryItems.length > 0,
        loading: loading || productsLoading,
        fetchInventory,
        currentLote,
        currentLoteNome,
        renameLote,
        viewingLote,
        listLotes,
        viewLote,
        exitViewLote,
        finalizeLote,
        suspendLote,
        resumeLote,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
};
