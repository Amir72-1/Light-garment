import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { decodeVideoFrame } from "./qrDecoder";

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
  { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
  { video: { facingMode: { ideal: "environment" } }, audio: false },
  { video: true, audio: false }
];

const SAME_CODE_COOLDOWN_MS = 5000;
const FRAME_INTERVAL_MS = 90;

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

async function openCameraStream() {
  let lastError: unknown = new Error("Camera is not available in this browser.");
  if (!navigator.mediaDevices?.getUserMedia) throw lastError;
  for (const constraints of CAMERA_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (error instanceof DOMException && error.name === "NotAllowedError") break;
    }
  }
  throw lastError;
}

async function enableContinuousFocus(track: MediaStreamTrack) {
  const capabilities = (track.getCapabilities?.() ?? {}) as { focusMode?: string[] };
  if (!capabilities.focusMode?.includes("continuous")) return;
  try {
    await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] });
  } catch {
    // Some devices list continuous focus but reject it; the default focus still works.
  }
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "Camera access is blocked. Allow the camera for this site, or use Scan from photo.";
  if (error instanceof DOMException && error.name === "NotFoundError") return "No camera was found. Use Scan from photo instead.";
  return "Could not open the camera. Retrying...";
}

export const BundleQrScanner = forwardRef<BundleQrScannerHandle, BundleQrScannerProps>(function BundleQrScanner(
  { visible, onScan, paused = false },
  ref
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const runIdRef = useRef(0);
  const scanLockRef = useRef(false);
  const lastScanRef = useRef("");
  const lastScanAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  const [cameraLive, setCameraLive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detected, setDetected] = useState(false);

  onScanRef.current = onScan;
  pausedRef.current = paused;

  const clearTimers = useCallback(() => {
    if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
    if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current);
    loopTimerRef.current = null;
    retryTimerRef.current = null;
  }, []);

  const stopScanner = useCallback(async () => {
    runIdRef.current += 1;
    clearTimers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraLive(false);
  }, [clearTimers]);

  const handleDecoded = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code || pausedRef.current || scanLockRef.current) return;
    if (code === lastScanRef.current && Date.now() - lastScanAtRef.current < SAME_CODE_COOLDOWN_MS) return;
    scanLockRef.current = true;
    lastScanRef.current = code;
    lastScanAtRef.current = Date.now();
    navigator.vibrate?.(60);
    setDetected(true);
    onScanRef.current(code);
    window.setTimeout(() => {
      scanLockRef.current = false;
      setDetected(false);
    }, 1200);
  }, []);

  const startScanner = useCallback(async () => {
    if (!visible) return;
    if (streamRef.current?.active) {
      setCameraLive(true);
      return;
    }
    await stopScanner();
    const runId = runIdRef.current;
    setCameraError(null);

    try {
      const stream = await openCameraStream();
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const [track] = stream.getVideoTracks();
      if (track) void enableContinuousFocus(track);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setCameraLive(true);

      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      let attempt = 0;
      const tick = async () => {
        if (runId !== runIdRef.current) return;
        if (!pausedRef.current && !scanLockRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const code = await decodeVideoFrame(video, canvas, attempt).catch(() => null);
          attempt += 1;
          if (code && runId === runIdRef.current) handleDecoded(code);
        }
        if (runId === runIdRef.current) loopTimerRef.current = window.setTimeout(() => void tick(), FRAME_INTERVAL_MS);
      };
      void tick();
    } catch (error) {
      if (runId !== runIdRef.current) return;
      setCameraError(cameraErrorMessage(error));
      const blocked = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "NotFoundError");
      if (!blocked) retryTimerRef.current = window.setTimeout(() => void startScanner(), 1500);
    }
  }, [handleDecoded, stopScanner, visible]);

  useImperativeHandle(ref, () => ({
    start: startScanner,
    stop: stopScanner
  }), [startScanner, stopScanner]);

  useEffect(() => {
    if (!visible) void stopScanner();
  }, [visible, stopScanner]);

  useEffect(() => () => {
    void stopScanner();
  }, [stopScanner]);

  if (!visible) return null;

  return (
    <div className={`bundle-qr-scanner${cameraLive ? " bundle-qr-scanner--live" : ""}${detected ? " bundle-qr-scanner--detected" : ""}`}>
      <video ref={videoRef} className="bundle-qr-scanner__video" playsInline muted autoPlay />
      {!cameraLive && <div className="bundle-qr-scanner__pulse" aria-hidden />}
      <div className="bundle-qr-scanner__hint">
        <p>{cameraError ?? (detected ? "QR code found" : cameraLive ? "Point at the QR code" : "Opening camera...")}</p>
      </div>
    </div>
  );
});
