import { forwardRef, useCallback, useEffect, useImperativeHandle, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export type BundleQrScannerHandle = {
  primeCamera: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

type BundleQrScannerProps = {
  active: boolean;
  startToken: number;
  onScan: (code: string) => void;
  paused?: boolean;
};

const CAMERA_CONSTRAINTS: MediaStreamConstraints[] = [
  { video: { facingMode: { exact: "environment" } }, audio: false },
  { video: { facingMode: "environment" }, audio: false },
  { video: { facingMode: { ideal: "environment" } }, audio: false },
  { video: true, audio: false }
];

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

function scanBoxSize(viewfinderWidth: number, viewfinderHeight: number) {
  const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.84);
  return { width: edge, height: edge };
}

export const BundleQrScanner = forwardRef<BundleQrScannerHandle, BundleQrScannerProps>(function BundleQrScanner(
  { active, startToken, onScan, paused = false },
  ref
) {
  const reactId = useId().replace(/:/g, "");
  const elementId = `bundle-qr-camera-${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startingRef = useRef(false);
  const scanLockRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const [cameraLive, setCameraLive] = useState(false);

  onScanRef.current = onScan;

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
    if (!active || startingRef.current) return;
    if (scannerRef.current?.isScanning) {
      setCameraLive(true);
      return;
    }

    startingRef.current = true;
    clearRetry();

    try {
      const scanner = new Html5Qrcode(elementId, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 18,
          qrbox: scanBoxSize,
          aspectRatio: window.innerWidth < 768 ? 1 : 1.333,
          disableFlip: false,
          videoConstraints: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        },
        (decoded) => {
          const code = decoded.trim();
          if (!code || scanLockRef.current) return;
          scanLockRef.current = true;
          onScanRef.current(code);
          scanner.pause(true);
          window.setTimeout(() => {
            scanLockRef.current = false;
            if (scannerRef.current?.isScanning && !paused) {
              scanner.resume().catch(() => undefined);
            }
          }, 1000);
        },
        () => undefined
      );

      setCameraLive(true);
    } catch {
      await stopScanner();
      retryTimerRef.current = window.setTimeout(() => {
        startingRef.current = false;
        void startScanner();
      }, 900);
      return;
    } finally {
      startingRef.current = false;
    }
  }, [active, clearRetry, elementId, paused, stopScanner]);

  const primeAndStart = useCallback(async () => {
    await primeBundleCamera();
    await startScanner();
  }, [startScanner]);

  useImperativeHandle(ref, () => ({
    primeCamera: primeBundleCamera,
    start: primeAndStart,
    stop: stopScanner
  }), [primeAndStart, stopScanner]);

  useEffect(() => {
    if (!active) {
      void stopScanner();
    }
  }, [active, stopScanner]);

  useEffect(() => {
    if (!active) return;
    void primeAndStart();
  }, [active, startToken, primeAndStart]);

  useEffect(() => {
    if (!scannerRef.current?.isScanning) return;
    if (paused) scannerRef.current.pause(true);
    else scannerRef.current.resume().catch(() => undefined);
  }, [paused]);

  useEffect(() => () => {
    void stopScanner();
  }, [stopScanner]);

  return (
    <div
      className="bundle-qr-scanner"
      onClick={() => {
        if (!cameraLive) void primeAndStart();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !cameraLive) void primeAndStart();
      }}
      role="presentation"
    >
      <div id={elementId} className="bundle-qr-scanner__viewport" />
      {!cameraLive && <div className="bundle-qr-scanner__pulse" aria-hidden />}
      <div className="bundle-qr-scanner__hint">
        <p>{cameraLive ? "Point at the QR code" : "Opening camera..."}</p>
      </div>
    </div>
  );
});
