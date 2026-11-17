import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { MetasProvider } from "@/contexts/MetasContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
// Guia de Hortifrui: rotas públicas (o cliente escaneia o QR na banca e não
// tem login). Ficam fora do `Index`, que é a parte autenticada do sistema.
import GuiaPublico from "./pages/GuiaPublico";
import GuiasIndice from "./pages/GuiasIndice";
import CreditosFotos from "./pages/CreditosFotos";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <DataProvider>
          <MetasProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/g" element={<GuiasIndice />} />
                {/* Rota fixa antes de `/g/:slug` (o Router casa na ordem). */}
                <Route path="/g/creditos" element={<CreditosFotos />} />
                <Route path="/g/:slug" element={<GuiaPublico />} />
                <Route path="/" element={<Index />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            <SpeedInsights />
          </MetasProvider>
        </DataProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
