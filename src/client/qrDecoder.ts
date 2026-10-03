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

function decodeRegion(source: DecodeSource, canvas: HTMLCanvasElement, region: Region, scale: number, invert: boolean) {
  const width = Math.max(1, Math.round(region.width * scale));
  const height = Math.max(1, Math.round(region.height * scale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const result = jsQR(pixels.data, width, height, { inversionAttempts: invert ? "attemptBoth" : "dontInvert" });
  return result?.data?.trim() || null;
}

function scaleToFit(region: Region, scale: number, maxSide: number) {
  return Math.min(scale, maxSide / Math.max(region.width, region.height));
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

// Small or dense codes need the crop enlarged before jsQR can separate the modules, so the passes rotate
// between crops and zoom levels; one pass runs per frame to keep the preview smooth.
// `fraction` is the centered square crop as a share of the frame's short side; 0 means the whole frame.
const VIDEO_PASSES = [
  { fraction: 1, scale: 1 },
  { fraction: 1, scale: 1.5 },
  { fraction: 0, scale: 1 },
  { fraction: 0.6, scale: 2 }
];

/** Decodes one live camera frame at the camera's own resolution, not the smaller on-screen preview. */
export async function decodeVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, attempt: number) {
  const { width, height } = sourceSize(video);
  if (!width || !height) return null;
  const native = await decodeNative(video);
  if (native) return native;
  const pass = VIDEO_PASSES[attempt % VIDEO_PASSES.length];
  const region = pass.fraction === 0 ? { x: 0, y: 0, width, height } : centerRegion(width, height, pass.fraction);
  return decodeRegion(video, canvas, region, scaleToFit(region, pass.scale, 1280), attempt % 8 === 7);
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
    [centerRegion(width, height, 0.7), 1600],
    [full, 1000],
    [centerRegion(width, height, 0.45), 1400],
    [full, 2400],
    [centerRegion(width, height, 0.3), 1200],
    [full, 700]
  ];
  for (const [region, maxSide] of attempts) {
    const code = decodeRegion(image, canvas, region, maxSide / Math.max(region.width, region.height), true);
    if (code) return code;
  }
  return null;
}
