/**
 * Atualização do PWA.
 *
 * O `registerSW.js` gerado pelo vite-plugin-pwa só registra o service worker:
 * depois disso é o navegador que decide quando procurar uma versão nova (e ele
 * pode passar horas entregando o bundle antigo do cache). Sem isso a pessoa
 * continua vendo telas que já foram alteradas — foi o que aconteceu com o
 * filtro de seção removido do Inventário.
 *
 * Aqui a checagem é forçada ao abrir o app e quando a aba volta a ficar
 * visível; quando um service worker novo assume o controle, a página recarrega
 * uma única vez para carregar o bundle atual.
 */

/** Não consulta o servidor mais de uma vez a cada 5 minutos. */
const INTERVALO_CHECAGEM_MS = 5 * 60 * 1000;

export function startPwaUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof document === 'undefined') return;
  // Em iframe/pré-visualização o `main.tsx` desregistra o SW de propósito.
  try {
    if (window.self !== window.top) return;
  } catch {
    return;
  }

  // Só recarrega se a página já era controlada antes: na primeira instalação
  // o `clientsClaim` também dispara `controllerchange`, e recarregar ali seria
  // um reload desnecessário no primeiro acesso.
  const jaControlada = !!navigator.serviceWorker.controller;
  let recarregando = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaControlada || recarregando) return;
    recarregando = true;
    window.location.reload();
  });

  let ultimaChecagem = 0;
  const checarAtualizacao = () => {
    if (document.visibilityState !== 'visible') return;
    const agora = Date.now();
    if (agora - ultimaChecagem < INTERVALO_CHECAGEM_MS) return;
    ultimaChecagem = agora;
    navigator.serviceWorker
      .getRegistration()
      .then((registro) => registro?.update())
      .catch(() => {
        // Offline ou rede restrita: tenta de novo na próxima checagem.
      });
  };

  checarAtualizacao();
  document.addEventListener('visibilitychange', checarAtualizacao);
  window.setInterval(checarAtualizacao, INTERVALO_CHECAGEM_MS);
}
