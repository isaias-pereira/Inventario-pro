import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
}

const READER_ID = 'barcode-reader';

const BarcodeScanner = ({ onDetected }: BarcodeScannerProps) => {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stopScanner = async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        if ((s as any).isScanning) await s.stop();
        await s.clear();
      } catch {}
    }
  };

  const handleClose = async () => {
    await stopScanner();
    setOpen(false);
    setError('');
  };

  // iOS Safari requires getUserMedia / scanner.start to be invoked
  // synchronously from the user gesture. The reader <div> is always
  // mounted so we don't have to wait for a dialog transition.
  const handleOpen = async () => {
    setError('');
    setOpen(true);

    // Wait one frame so the reader div is visible (Html5Qrcode needs
    // a sized container), then start in the same gesture context.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const scanner = new Html5Qrcode(READER_ID, { verbose: false } as any);
    scannerRef.current = scanner;

    const onSuccess = (decodedText: string) => {
      const numericCode = decodedText.replace(/\D/g, '');
      if (!numericCode) return;
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1200;
        gain.gain.value = 0.3;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch {}
      try { if (navigator.vibrate) navigator.vibrate(200); } catch {}
      onDetectedRef.current(numericCode);
      handleClose();
    };

    const config = {
      fps: 10,
      qrbox: { width: 260, height: 140 },
      aspectRatio: 1.3,
      videoConstraints: {
        facingMode: { ideal: 'environment' },
      },
    } as any;

    try {
      // Pass facingMode as string — iOS Safari handles this better than
      // { exact: 'environment' } and avoids OverconstrainedError.
      await scanner.start({ facingMode: 'environment' }, config, onSuccess, () => {});
    } catch (err1: any) {
      console.warn('start(environment) failed, retrying with camera list:', err1);
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('Nenhuma câmera disponível');
        }
        const rear = cameras.find((c) => /back|rear|environment|traseira|trás/i.test(c.label));
        const target = rear?.id || cameras[cameras.length - 1].id;
        await scanner.start(target, config, onSuccess, () => {});
      } catch (err2: any) {
        console.error('Scanner error:', err2);
        const name = err2?.name || err1?.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setError('Permissão da câmera negada. Vá em Ajustes > Safari > Câmera e permita o acesso.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setError('Câmera traseira não encontrada neste dispositivo.');
        } else if (name === 'NotReadableError') {
          setError('A câmera está em uso por outro aplicativo. Feche-o e tente novamente.');
        } else {
          setError('Não foi possível iniciar a câmera: ' + (err2?.message || err1?.message || 'erro desconhecido'));
        }
        await stopScanner();
      }
    }

    // iOS requires playsinline on the video element to render inline
    // (otherwise it tries to enter fullscreen and may fail in a PWA).
    setTimeout(() => {
      const v = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement | null;
      if (v) {
        v.setAttribute('playsinline', 'true');
        v.setAttribute('webkit-playsinline', 'true');
        v.muted = true;
        v.play().catch(() => {});
      }
    }, 100);
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <>
      <Button
        onClick={handleOpen}
        variant="outline"
        size="icon"
        className="shrink-0"
        title="Escanear código de barras"
      >
        <Camera className="h-5 w-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <Camera className="h-5 w-5 text-primary" />
                Escanear Código
              </h3>
              <button
                onClick={handleClose}
                className="rounded-full p-1 hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              id={READER_ID}
              className="w-full overflow-hidden rounded-lg bg-black min-h-[260px]"
            />

            {error && (
              <p className="mt-3 text-sm text-destructive text-center">{error}</p>
            )}

            <p className="mt-2 text-xs text-muted-foreground text-center">
              Aponte a câmera para o código de barras
            </p>

            <Button variant="outline" onClick={handleClose} className="mt-3 w-full gap-2">
              <X className="h-4 w-4" />
              Fechar
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default BarcodeScanner;
