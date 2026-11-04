/**
 * Compartilhamento de arquivos com o sistema (folha de compartilhamento do
 * Android/desktop) via Web Share API.
 *
 * Importante: o Chromium (Chrome, Edge, Samsung Internet, Opera) só aceita
 * anexar arquivos com tipos da allowlist do próprio navegador
 * (third_party/blink/renderer/modules/webshare/FILE_TYPES.md):
 * PDF, imagens, áudio, vídeo e alguns formatos de texto.
 * `.ods` (OpenDocument) NÃO está na lista, então o navegador recusa o anexo
 * com `NotAllowedError`/`TypeError` e o compartilhamento não acontece.
 * Nesses casos o app envia o PDF, que é aceito em qualquer aparelho.
 */

export type SystemShareOutcome =
  /** A folha de compartilhamento abriu e o arquivo foi entregue. */
  | 'shared'
  /** O usuário fechou a folha de compartilhamento. */
  | 'cancelled'
  /** O navegador existe, mas recusou o arquivo (tipo não permitido). */
  | 'blocked'
  /** O navegador não tem Web Share API. */
  | 'unavailable';

export interface SystemShareOptions {
  title?: string;
  text?: string;
}

/** Extensões aceitas pelo Chromium na folha de compartilhamento. */
const CHROMIUM_SHAREABLE_EXTENSIONS = new Set([
  // Application
  'pdf',
  // Audio
  'flac', 'm4a', 'mp3', 'oga', 'ogg', 'opus', 'wav', 'weba',
  // Image
  'avif', 'bmp', 'gif', 'ico', 'jfif', 'jpeg', 'jpg', 'pjp', 'pjpeg', 'png',
  'svg', 'svgz', 'tif', 'tiff', 'webp', 'xbm',
  // Text
  'css', 'csv', 'ehtml', 'htm', 'html', 'shtm', 'shtml', 'text', 'txt',
  // Video
  'm4v', 'mp4', 'mpeg', 'mpg', 'ogm', 'ogv', 'webm',
]);

export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/** O navegador é derivado do Chromium (Chrome, Edge, Samsung Internet…)? */
export function isChromiumBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const brands = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand?: string }> } })
    .userAgentData?.brands;
  if (Array.isArray(brands) && brands.length > 0) {
    return brands.some((item) => /chromium|chrome|edge|edg|opr|samsung/i.test(String(item?.brand ?? '')));
  }
  const ua = navigator.userAgent || '';
  if (/Firefox/i.test(ua)) return false;
  return /Chrome|Chromium|Edg\//i.test(ua);
}

/**
 * O navegador vai recusar anexar este arquivo na folha de compartilhamento?
 * Só é previsível no Chromium, que tem a allowlist fixa.
 */
export function browserBlocksFileShare(fileName: string): boolean {
  if (!isChromiumBrowser()) return false;
  return !CHROMIUM_SHAREABLE_EXTENSIONS.has(fileExtension(fileName));
}

/** O aparelho tem Web Share API? */
export function canSystemShareFiles(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Cria um File a partir dos bytes (compatível com a folha do sistema). */
export function fileFromBytes(bytes: Uint8Array, fileName: string, mimeType: string): File {
  return new File([bytes.slice().buffer], fileName, { type: mimeType });
}

/**
 * Abre a folha de compartilhamento do sistema com o arquivo anexado.
 * Não baixa nada: quem decide o fallback é o chamador.
 */
export async function shareFileWithSystem(
  file: File,
  options: SystemShareOptions = {},
): Promise<SystemShareOutcome> {
  if (!canSystemShareFiles()) return 'unavailable';
  try {
    await navigator.share({
      files: [file],
      title: options.title,
      text: options.text,
    });
    return 'shared';
  } catch (error) {
    // Fechar a folha de compartilhamento não é erro.
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    // O navegador recusou o arquivo (tipo não permitido, permissão, etc.).
    return 'blocked';
  }
}
