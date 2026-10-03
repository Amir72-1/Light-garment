import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { renderBundleQrImage } from "./bundleQrImage.js";

function decodeDataUrl(dataUrl: string) {
  const png = PNG.sync.read(Buffer.from(dataUrl.split(",")[1], "base64"));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data;
}

describe("bundle QR image", () => {
  it("encodes only the short QR code number so labels stay easy to scan", async () => {
    const image = await renderBundleQrImage("LGM-QR-MUS6Y6YIB03");
    expect(decodeDataUrl(image)).toBe("LGM-QR-MUS6Y6YIB03");
  });

  it("still decodes when printed very small", async () => {
    const image = await renderBundleQrImage("LGM-QR-MUS6Y6YIB03");
    const png = PNG.sync.read(Buffer.from(image.split(",")[1], "base64"));
    const size = 66;
    const small = new PNG({ width: size, height: size });
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const source = (Math.floor((y * png.height) / size) * png.width + Math.floor((x * png.width) / size)) * 4;
        const target = (y * size + x) * 4;
        small.data[target] = png.data[source];
        small.data[target + 1] = png.data[source + 1];
        small.data[target + 2] = png.data[source + 2];
        small.data[target + 3] = 255;
      }
    }
    expect(jsQR(new Uint8ClampedArray(small.data), size, size)?.data).toBe("LGM-QR-MUS6Y6YIB03");
  });
});
