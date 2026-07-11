import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AlertCircle, Camera, Loader2 } from "lucide-react";
import { Button } from "./components/ui";

const SCANNER_ELEMENT_ID = "bundle-qr-camera-view";

export type BundleQrScannerHandle = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type BundleQrScannerProps = {
  onScan: (code: string) => void;
  onError?: (message: string) => void;
  paused?: boolean;
};

function isMobileLikeDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
}

async function resolveCameraConfig() {
  if (!isMobileLikeDevice()) {
    return { facingMode: "environment" } as const;
  }

  try {
    const cameras = await Html5Qrcode.getCameras();
    const backCamera = cameras.find((camera) => /back|rear|environment/i.test(camera.label));
    if (backCamera) return backCamera.id;
  } catch {
    // Fall back to facingMode below.
  }

  return { facingMode: "environment" } as const;
}

function scanBoxSize(viewfinderWidth: number, viewfinderHeight: number) {
  const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.78);
  return { width: edge, height: edge };
}

export const BundleQrScanner = forwardRef<BundleQrScannerHandle, BundleQrScannerProps>(function BundleQrScanner(
  { onScan, onError, paused = false },
  ref
) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef("");
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  onScanRef.current = onScan;
  onErrorRef.current = onError;

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      // Ignore stop races while the camera is still opening.
    }
    scanner.clear();
    setStatus("idle");
  }, []);

  const startScanner = useCallback(async () => {
    if (startingRef.current || scannerRef.current?.isScanning) return;
    startingRef.current = true;
    setStatus("starting");
    setError(null);

    try {
      await stopScanner();
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = scanner;
      const cameraConfig = await resolveCameraConfig();

      await scanner.start(
        cameraConfig,
        {
          fps: 12,
          qrbox: scanBoxSize,
          aspectRatio: 1,
          disableFlip: false,
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        },
        (decoded) => {
          const trimmed = decoded.trim();
          if (!trimmed || scanLockRef.current || trimmed === lastScanRef.current) return;
          scanLockRef.current = true;
          lastScanRef.current = trimmed;
          onScanRef.current(trimmed);
          scanner.pause(true);
          window.setTimeout(() => {
            scanLockRef.current = false;
            if (scannerRef.current?.isScanning && !paused) {
              scanner.resume().catch(() => undefined);
            }
          }, 1500);
        },
        () => undefined
      );

      setStatus("scanning");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not access the camera.";
      setError(message);
      setStatus("error");
      onErrorRef.current?.(message);
      await stopScanner();
    } finally {
      startingRef.current = false;
    }
  }, [paused, stopScanner]);

  useImperativeHandle(ref, () => ({
    start: startScanner,
    stop: stopScanner
  }), [startScanner, stopScanner]);

  useEffect(() => {
    if (paused && scannerRef.current?.isScanning) {
      scannerRef.current.pause(true);
      return;
    }
    if (!paused && scannerRef.current?.isScanning) {
      scannerRef.current.resume().catch(() => undefined);
    }
  }, [paused]);

  useEffect(() => () => {
    void stopScanner();
  }, [stopScanner]);

  return (
    <div className="bundle-qr-scanner">
      <div id={SCANNER_ELEMENT_ID} className="bundle-qr-scanner__viewport" />

      {status === "idle" && (
        <div className="bundle-qr-scanner__overlay">
          <Button type="button" className="bundle-qr-scanner__start" onClick={() => void startScanner()}>
            <Camera className="h-5 w-5" />
            Tap to scan QR code
          </Button>
          <p className="mt-3 text-center text-sm text-slate-500">Point your phone camera at the bundle QR label.</p>
        </div>
      )}

      {status === "starting" && (
        <div className="bundle-qr-scanner__overlay bundle-qr-scanner__overlay--dim">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm font-medium text-slate-700">Opening camera...</p>
        </div>
      )}

      {status === "scanning" && (
        <div className="bundle-qr-scanner__hint">
          <p>Align the QR code inside the frame</p>
        </div>
      )}

      {status === "error" && (
        <div className="bundle-qr-scanner__overlay bundle-qr-scanner__overlay--dim">
          <AlertCircle className="h-8 w-8 text-rose-600" />
          <p className="mt-3 max-w-xs text-center text-sm text-rose-700">{error}</p>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => void startScanner()}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
});

export function shouldAutoStartBundleScanner() {
  return isMobileLikeDevice();
}
