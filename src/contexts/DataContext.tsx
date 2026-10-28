import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { invokeFunction, parseJwtPayload } from '@/lib/api';

export interface Product {
  codigo: string;
  descricao: string;
  estoque: number;
  preco: number;
}

export interface InventoryItem {
  id?: string;
  ean: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  created_by?: string;
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

/** Intervalo de sincronização do inventário compartilhado (sem realtime). */
const INVENTORY_POLL_MS = 15_000;

function getToken(): string | null {
  try {
    return localStorage.getItem('estoque_pro_token');
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('estoque_pro_token');
  localStorage.removeItem('estoque_pro_session');
  window.location.reload();
}

async function invokeWithToken(functionName: string, body: Record<string, unknown>) {
  const token = getToken();

  // If no token at all, force re-login
  if (!token) {
    clearSession();
    return { data: null, error: new Error('No token') };
  }

  // Check token expiry client-side before calling
  try {
    const payload = parseJwtPayload(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      clearSession();
      return { data: null, error: new Error('Token expired') };
    }
  } catch {
    clearSession();
    return { data: null, error: new Error('Invalid token') };
  }

  const result = await invokeFunction(functionName, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  // Also handle server-side 401/403
  if (result.error) {
    const ctx = (result.error as any)?.context;
    if (ctx?.status === 401 || ctx?.status === 403) {
      clearSession();
    }
  }

  return result;
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
    const token = getToken();
    if (!token) {
      setProductsLoading(false);
      return;
    }
    try {
      const { data, error } = await invokeWithToken('manage-consulta', { action: 'list' });
      if (!error && data?.items?.length > 0) {
        setProducts(data.items.map((p: any) => ({
          codigo: p.codigo,
          descricao: p.descricao,
          estoque: Number(p.estoque) || 0,
          preco: Number(p.preco) || 0,
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
      await invokeWithToken('manage-consulta', {
        action: 'replace',
        products: items,
      });
    } catch (e) {
      console.error('Error saving consulta products:', e);
    }
  }, []);

  const fetchInventory = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // if viewing a finalized lote, fetch that one (read-only) instead
    const viewing = viewingRef.current;
    try {
      if (viewing) {
        const { data, error } = await invokeWithToken('manage-inventory', { action: 'get_lote', lote_numero: viewing.numero });
        if (!error && data?.items) {
          setInventoryItemsState(data.items.map((d: any) => ({
            id: d.id, ean: d.ean, codigo: d.codigo, descricao: d.descricao,
            quantidade: d.quantidade, created_by: d.created_by || undefined,
          })));
        }
      } else {
        const { data, error } = await invokeWithToken('manage-inventory', { action: 'list' });
        if (!error && data?.items) {
          setInventoryItemsState(data.items.map((d: any) => ({
            id: d.id, ean: d.ean, codigo: d.codigo, descricao: d.descricao,
            quantidade: d.quantidade, created_by: d.created_by || undefined,
          })));
          if (typeof data.lote_numero === 'number') setCurrentLote(data.lote_numero);
          setCurrentLoteNome(data.lote_nome ?? null);
        }
      }
    } catch (e) {
      console.error('Error fetching inventory:', e);
    }
    setLoading(false);
  }, []);

  const listLotes = useCallback(async (): Promise<LoteInfo[]> => {
    const { data, error } = await invokeWithToken('manage-inventory', { action: 'list_lotes' });
    if (error || !data?.lotes) return [];
    return data.lotes as LoteInfo[];
  }, []);

  const viewLote = useCallback(async (numero: number) => {
    const { data, error } = await invokeWithToken('manage-inventory', { action: 'get_lote', lote_numero: numero });
    if (error || !data) return;
    setViewingLote(data.lote || { numero, status: 'finalizado', created_by: null, created_at: '', finalized_at: null });
    setInventoryItemsState((data.items || []).map((d: any) => ({
      id: d.id, ean: d.ean, codigo: d.codigo, descricao: d.descricao,
      quantidade: d.quantidade, created_by: d.created_by || undefined,
    })));
  }, []);

  const exitViewLote = useCallback(async () => {
    setViewingLote(null);
    viewingRef.current = null;
    await fetchInventoryInternal();
  }, []);

  const finalizeLote = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeWithToken('manage-inventory', { action: 'finalize' });
    if (error) return { ok: false, error: 'Erro ao finalizar lote' };
    if (data?.error) return { ok: false, error: data.error };
    await fetchInventoryInternal();
    return { ok: true };
  }, []);

  const suspendLote = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeWithToken('manage-inventory', { action: 'suspend' });
    if (error) return { ok: false, error: 'Erro ao suspender lote' };
    if (data?.error) return { ok: false, error: data.error };
    setInventoryItemsState([]);
    setCurrentLote(null);
    setCurrentLoteNome(null);
    await fetchInventoryInternal();
    return { ok: true };
  }, []);

  const renameLote = useCallback(async (nome: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeWithToken('manage-inventory', { action: 'rename', nome });
    if (error) return { ok: false, error: 'Erro ao nomear lote' };
    if (data?.error) return { ok: false, error: data.error };
    setCurrentLoteNome(data?.nome ?? nome);
    return { ok: true };
  }, []);

  const resumeLote = useCallback(async (numero: number): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await invokeWithToken('manage-inventory', { action: 'resume', lote_numero: numero });
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
      const { data } = await invokeWithToken('manage-inventory', { action: 'get_lote', lote_numero: viewing.numero });
      if (data?.items) setInventoryItemsState(data.items.map((d: any) => ({
        id: d.id, ean: d.ean, codigo: d.codigo, descricao: d.descricao,
        quantidade: d.quantidade, created_by: d.created_by || undefined,
      })));
    } else {
      const { data } = await invokeWithToken('manage-inventory', { action: 'list' });
      if (data?.items) {
        setInventoryItemsState(data.items.map((d: any) => ({
          id: d.id, ean: d.ean, codigo: d.codigo, descricao: d.descricao,
          quantidade: d.quantidade, created_by: d.created_by || undefined,
        })));
        if (typeof data.lote_numero === 'number') setCurrentLote(data.lote_numero);
        setCurrentLoteNome(data.lote_nome ?? null);
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
      const { error } = await invokeWithToken('manage-inventory', {
        action: 'add',
        item: { ean: item.ean, codigo: item.codigo, descricao: item.descricao },
        quantidade,
      });
      if (!error) await fetchInventory();
    },
    [fetchInventory]
  );

  const updateInventoryItemQuantidade = useCallback(
    async (codigo: string, quantidade: number) => {
      const { error } = await invokeWithToken('manage-inventory', {
        action: 'update',
        codigo,
        quantidade,
      });
      if (!error) await fetchInventory();
    },
    [fetchInventory]
  );

  const removeInventoryItem = useCallback(
    async (codigo: string) => {
      const { error } = await invokeWithToken('manage-inventory', {
        action: 'remove',
        codigo,
      });
      if (!error) await fetchInventory();
    },
    [fetchInventory]
  );

  const clearAllInventory = useCallback(async () => {
    const { error } = await invokeWithToken('manage-inventory', {
      action: 'clear',
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
