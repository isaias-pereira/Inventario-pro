/**
 * Preparação da foto da etiqueta antes de enviar ao servidor.
 *
 * O corpo de uma Function da Vercel aceita 4,5 MB e o base64 cresce ~33%.
 * A imagem é redimensionada e convertida para JPEG no próprio celular: sobra
 * payload e a leitura da etiqueta continua boa (a fonte da validade é
 * pequena).
 */

/** Tamanho máximo do arquivo decodificado (deixa folga para o base64). */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Lado maior máximo da imagem enviada. */
export const MAX_IMAGE_DIMENSION = 1600;

export interface PreparedImage {
  /** Conteúdo em base64, sem o prefixo `data:`. */
  base64: string;
  /** MIME da imagem preparada (sempre JPEG). */
  mimeType: string;
  width: number;
  height: number;
  /** Tamanho estimado do arquivo decodificado, em bytes. */
  bytes: number;
}

/** Tamanho decodificado de uma string base64. */
export function estimateBase64Bytes(base64: string): number {
  if (!base64) return 0;
  const clean = base64.replace(/=+$/, '');
  return Math.floor((clean.length * 3) / 4);
}

/** Mantém a proporção e limita o lado maior. */
export function targetSize(width: number, height: number, max = MAX_IMAGE_DIMENSION): { width: number; height: number } {
  if (!width || !height) return { width: max, height: max };
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const factor = max / longest;
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    image.src = dataUrl;
  });
}

/**
 * Redimensiona, converte para JPEG e devolve o base64 pronto para o envio.
 *
 * Se a imagem convertida ainda estiver grande, a qualidade cai e o lado maior
 * diminui até caber no limite.
 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('Selecione uma imagem da etiqueta.');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('A imagem é grande demais. Tire outra foto.');
  }

  const dataUrl = await readAsDataUrl(file);
  const image = await loadImage(dataUrl);

  const { width, height } = targetSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const qualities = [0.85, 0.7, 0.55];
  let output = '';
  let usedWidth = width;
  let usedHeight = height;

  for (const quality of qualities) {
    const canvas = document.createElement('canvas');
    canvas.width = usedWidth;
    canvas.height = usedHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a imagem.');
    context.drawImage(image, 0, 0, usedWidth, usedHeight);
    output = canvas.toDataURL('image/jpeg', quality);
    const bytes = estimateBase64Bytes(output.split(',')[1] ?? '');
    if (bytes <= MAX_IMAGE_BYTES) {
      const base64 = output.split(',')[1] ?? '';
      return { base64, mimeType: 'image/jpeg', width: usedWidth, height: usedHeight, bytes };
    }
    usedWidth = Math.round(usedWidth * 0.8);
    usedHeight = Math.round(usedHeight * 0.8);
  }

  throw new Error('A imagem continua grande demais depois de comprimida. Tente uma foto mais próxima.');
}
