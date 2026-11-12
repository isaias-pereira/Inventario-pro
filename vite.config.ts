import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // As funções da API não rodam no dev do Vite: em desenvolvimento o proxy
    // aponta para a API local (`vercel dev`), configurável via VITE_API_PROXY_TARGET.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        importScripts: ['notification-sw.js'],
      },
      manifest: {
        name: "SGS-PRO — Sistema de gerenciamento de Setor",
        short_name: "SGS-PRO",
        description: "Sistema de gerenciamento de Setor",
        lang: "pt-BR",
        theme_color: "#0284c7",
        background_color: "#e8eff5",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // O maior pedaço sob demanda é o xlsx-js-style (~870 kB minificado, 323 kB
    // gzip), que só baixa na Base de Dados (admin). O bundle inicial fica bem
    // abaixo de 500 kB graças às telas carregadas sob demanda.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Bibliotecas grandes viram pedaços próprios, baixados só pela tela
        // que as usa (as telas já são carregadas sob demanda em pages/Index).
        // jsPDF fica de fora daqui de propósito: um chunk manual faria o
        // entry importar helpers compartilhados e pré-carregar o PDF inteiro.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return "react";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("xlsx-js-style")) return "xlsx";
          if (id.includes("html5-qrcode")) return "scanner";
        },
      },
    },
  },
}));
