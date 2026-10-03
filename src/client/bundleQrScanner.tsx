import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

export type BundleQrScannerHandle = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type BundleQrScannerProps = {
  visible: boolean;
  onScan: (code: string) => void;
  paused?: boolean;
};

const CAMERA_CONSTRAINTS: MediaStreamConstraints[] = [
  { video: { facingMode: { ideal: "environment" } }, audio: false },
  { video: { facingMode: "environment" }, audio: false },
  { video: true, audio: false }
];

const SAME_CODE_COOLDOWN_MS = 5000;

export async function primeBundleCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return;
  for (const constraints of CAMERA_CONSTRAINTS) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((track) => track.stop());
      return;
    } catch {
      continue;
    }
  }
}

async function resolveBackCameraId() {
  try {
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) return { facingMode: "environment" as const };
    const backCamera = cameras.find((camera) => /back|rear|environment|wide/i.test(camera.label));
    if (backCamera) return backCamera.id;
    return cameras[cameras.length - 1]?.id ?? { facingMode: "environment" as const };
  } catch {
    return { facingMode: "environment" as const };
  }
}

export const BundleQrScanner = forwardRef<BundleQrScannerHandle, BundleQrScannerProps>(function BundleQrScanner(
  { visible, onScan, paused = false },
  ref
) {
  const reactId = useId().replace(/:/g, "");
  const elementId = `bundle-qr-camera-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef("");
  const lastScanAtRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [cameraLive, setCameraLive] = useState(false);

  onScanRef.current = onScan;
  pausedRef.current = paused;

  const clearRetry = useCallback(() => {
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(async () => {
    clearRetry();
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setCameraLive(false);
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      // Ignore stop races while the camera is still opening.
    }
    try {
      scanner.clear();
    } catch {
      // Ignore clear races after unmount.
    }
  }, [clearRetry]);

  const startScanner = useCallback(async () => {
    if (!visible || startingRef.current) return;
    if (scannerRef.current?.isScanning) {
      setCameraLive(true);
      return;
    }

    startingRef.current = true;
    clearRetry();
    setCameraLive(false);

    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const scanner = new Html5Qrcode(elementId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      });
      scannerRef.current = scanner;
      const cameraConfig = await resolveBackCameraId();

      // No qrbox: the whole frame is scanned, so html5-qrcode draws no shaded frame over the video.
      await scanner.start(
        cameraConfig,
        {
          fps: 12,
          disableFlip: false,
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { min: 640, ideal: 1280 },
            height: { min: 480, ideal: 720 }
          }
        },
        (decoded) => {
          const code = decoded.trim();
          if (!code || pausedRef.current || scanLockRef.current) return;
          if (code === lastScanRef.current && Date.now() - lastScanAtRef.current < SAME_CODE_COOLDOWN_MS) return;
          scanLockRef.current = true;
          lastScanRef.current = code;
          lastScanAtRef.current = Date.now();
          onScanRef.current(code);
          window.setTimeout(() => {
            scanLockRef.current = false;
          }, 1200);
        },
        () => undefined
      );

      setCameraLive(true);
    } catch {
      await stopScanner();
      retryTimerRef.current = window.setTimeout(() => {
        startingRef.current = false;
        void startScanner();
      }, 1200);
      return;
    } finally {
      startingRef.current = false;
    }
  }, [clearRetry, elementId, stopScanner, visible]);

  useImperativeHandle(ref, () => ({
    start: startScanner,
    stop: stopScanner
  }), [startScanner, stopScanner]);

  useEffect(() => {
    if (!visible) {
      void stopScanner();
    }
  }, [visible, stopScanner]);

  useEffect(() => () => {
    void stopScanner();
  }, [stopScanner]);

  if (!visible) return null;

  return (
    <div className="bundle-qr-scanner">
      <div id={elementId} className="bundle-qr-scanner__viewport" />
      {!cameraLive && <div className="bundle-qr-scanner__pulse" aria-hidden />}
      <div className="bundle-qr-scanner__hint">
        <p>{cameraLive ? "Point at the QR code" : "Opening camera..."}</p>
      </div>
    </div>
  );
});
