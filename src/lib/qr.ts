/**
 * Geração do QR code (biblioteca carregada sob demanda).
 *
 * A tela de "Guias & QR" só é aberta por admin/encarregado, então o
 * `import()` dinâmico mantém a biblioteca fora do bundle inicial do app —
 * o cliente que escaneia o QR não paga esse download.
 */

/** Gera o QR (data URL PNG) de uma URL. */
export async function gerarQrDataUrl(url: string, tamanho = 512): Promise<string> {
  const QRCode = (await import('qrcode')).default;
  return QRCode.toDataURL(url, {
    width: tamanho,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1E2A20', light: '#FFFFFF' },
  });
}
