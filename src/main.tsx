import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startAnalytics } from "./lib/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

// Unregister service workers in preview/iframe contexts to avoid caching issues
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

// Web Analytics da Vercel (page views + eventos customizados).
startAnalytics();

// Vercel Speed Insights
injectSpeedInsights();

createRoot(document.getElementById("root")!).render(<App />);
