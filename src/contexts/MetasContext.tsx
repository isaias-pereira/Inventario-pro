import React, { createContext, useContext, useState, useCallback } from 'react';
import { invokeFunction } from '@/lib/api';

export interface MetaItem {
  dia: number;
  meta: number;
}

export interface VendaItem {
  dia: number;
  venda: number;
}

export interface VendaSortimentoItem {
  dia: number;
  codigo: string;
}

export interface PerdaItem {
  codigo: string;
  produto: string;
  quantidade: number;
}

interface MetasContextType {
  metaItems: MetaItem[];
  setMetaItems: (items: MetaItem[]) => void;
  vendaItems: VendaItem[];
  setVendaItems: (items: VendaItem[]) => void;
  vendaSortimentoItems: VendaSortimentoItem[];
  setVendaSortimentoItems: (items: VendaSortimentoItem[]) => void;
  perdaItems: PerdaItem[];
  setPerdaItems: (items: PerdaItem[]) => void;
  selectedMonth: number;
  selectedYear: number;
  setSelectedMonth: (m: number) => void;
  setSelectedYear: (y: number) => void;
  loadMonthData: (token: string, ano: number, mes: number) => Promise<void>;
  saveMetaToDB: (token: string, ano: number, mes: number, items: MetaItem[]) => Promise<void>;
  saveRealizadoToDB: (token: string, ano: number, mes: number, items: VendaItem[]) => Promise<void>;
  isLoading: boolean;
}

const MetasContext = createContext<MetasContextType | null>(null);

export const MetasProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const now = new Date();
  const [metaItems, setMetaItems] = useState<MetaItem[]>([]);
  const [vendaItems, setVendaItems] = useState<VendaItem[]>([]);
  const [vendaSortimentoItems, setVendaSortimentoItems] = useState<VendaSortimentoItem[]>([]);
  const [perdaItems, setPerdaItems] = useState<PerdaItem[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [isLoading, setIsLoading] = useState(false);

  const loadMonthData = useCallback(async (token: string, ano: number, mes: number) => {
    setIsLoading(true);
    try {
      const res = await invokeFunction('manage-metas', {
        body: { action: 'get', ano, mes },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
      const rows = res.data?.data || [];
      const metas: MetaItem[] = [];
      const vendas: VendaItem[] = [];
      for (const r of rows) {
        if (r.meta != null && r.meta > 0) metas.push({ dia: r.dia, meta: Number(r.meta) });
        if (r.realizado != null) vendas.push({ dia: r.dia, venda: Number(r.realizado) });
      }
      setMetaItems(metas);
      setVendaItems(vendas);
    } catch (err) {
      console.error('Erro ao carregar dados do mês:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveMetaToDB = useCallback(async (token: string, ano: number, mes: number, items: MetaItem[]) => {
    try {
      const res = await invokeFunction('manage-metas', {
        body: { action: 'save_meta', ano, mes, items },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
    } catch (err) {
      console.error('Erro ao salvar meta:', err);
      throw err;
    }
  }, []);

  const saveRealizadoToDB = useCallback(async (token: string, ano: number, mes: number, items: VendaItem[]) => {
    try {
      const res = await invokeFunction('manage-metas', {
        body: { action: 'save_realizado', ano, mes, realizadoItems: items },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.error) throw res.error;
    } catch (err) {
      console.error('Erro ao salvar realizado:', err);
      throw err;
    }
  }, []);

  return (
    <MetasContext.Provider value={{
      metaItems, setMetaItems,
      vendaItems, setVendaItems,
      vendaSortimentoItems, setVendaSortimentoItems,
      perdaItems, setPerdaItems,
      selectedMonth, selectedYear,
      setSelectedMonth, setSelectedYear,
      loadMonthData, saveMetaToDB, saveRealizadoToDB,
      isLoading,
    }}>
      {children}
    </MetasContext.Provider>
  );
};

export const useMetas = () => {
  const ctx = useContext(MetasContext);
  if (!ctx) throw new Error('useMetas must be used within MetasProvider');
  return ctx;
};
