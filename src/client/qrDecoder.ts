import jsQR from "jsqr";

type NativeBarcodeDetector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>> };
type DecodeSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

let nativeDetectorPromise: Promise<NativeBarcodeDetector | null> | null = null;

function getNativeDetector() {
  nativeDetectorPromise ??= (async () => {
    const Detector = (globalThis as { BarcodeDetector?: { new (options: { formats: string[] }): NativeBarcodeDetector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
    if (!Detector) return null;
    try {
      const formats = await Detector.getSupportedFormats?.();
      if (formats && !formats.includes("qr_code")) return null;
      return new Detector({ formats: ["qr_code"] });
    } catch {
      return null;
    }
  })();
  return nativeDetectorPromise;
}

function sourceSize(source: DecodeSource) {
  if (source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  return { width: source.width, height: source.height };
}

type Region = { x: number; y: number; width: number; height: number };

function decodeRegion(source: DecodeSource, canvas: HTMLCanvasElement, region: Region, maxSide: number, invert: boolean) {
  const scale = Math.min(1, maxSide / Math.max(region.width, region.height));
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = scale < 1;
  context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const result = jsQR(pixels.data, width, height, { inversionAttempts: invert ? "attemptBoth" : "dontInvert" });
  return result?.data?.trim() || null;
}

function centerRegion(width: number, height: number, fraction: number): Region {
  const side = Math.round(Math.min(width, height) * fraction);
  return { x: Math.round((width - side) / 2), y: Math.round((height - side) / 2), width: side, height: side };
}

async function decodeNative(source: DecodeSource) {
  const detector = await getNativeDetector();
  if (!detector) return null;
  try {
    const results = await detector.detect(source);
    return results.find((item) => item.rawValue?.trim())?.rawValue?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Decodes one live camera frame at the camera's own resolution (not the smaller on-screen preview).
 * `attempt` alternates between the whole frame and a center crop so each frame stays cheap.
 */
export async function decodeVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, attempt: number) {
  const { width, height } = sourceSize(video);
  if (!width || !height) return null;
  const native = await decodeNative(video);
  if (native) return native;
  const region = attempt % 2 === 0 ? { x: 0, y: 0, width, height } : centerRegion(width, height, 0.6);
  return decodeRegion(video, canvas, region, 1280, attempt % 4 === 3);
}

async function loadImage(file: Blob) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall back to an <img> element for formats createImageBitmap rejects.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Decodes a QR code from a photo or screenshot, trying several sizes and crops. */
export async function decodeImageFile(file: Blob) {
  const image = await loadImage(file);
  const { width, height } = sourceSize(image);
  if (!width || !height) return null;
  const native = await decodeNative(image);
  if (native) return native;
  const canvas = document.createElement("canvas");
  const full = { x: 0, y: 0, width, height };
  const attempts: Array<[Region, number]> = [
    [full, 1600],
    [full, 1000],
    [centerRegion(width, height, 0.7), 1600],
    [full, 2400],
    [centerRegion(width, height, 0.45), 1200],
    [full, 700]
  ];
  for (const [region, maxSide] of attempts) {
    const code = decodeRegion(image, canvas, region, maxSide, true);
    if (code) return code;
  }
  return null;
}
