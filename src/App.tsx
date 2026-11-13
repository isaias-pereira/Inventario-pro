import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DataProvider } from "@/contexts/DataContext";
import { MetasProvider } from "@/contexts/MetasContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
// Guia de Hortifrui: rotas públicas (o cliente escaneia o QR na banca e não
// tem login). Ficam fora do `Index`, que é a parte autenticada do sistema.
import GuiaPublico from "./pages/GuiaPublico";
import GuiasIndice from "./pages/GuiasIndice";

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
                <Route path="/g/:slug" element={<GuiaPublico />} />
                <Route path="/" element={<Index />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </MetasProvider>
        </DataProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
