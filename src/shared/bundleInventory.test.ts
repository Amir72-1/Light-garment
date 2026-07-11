import { describe, expect, it } from "vitest";
import { assertMoveQuantity, decodeQrPayload, encodeQrPayload, normalizeRegisterVariants } from "./bundleInventory.js";

describe("bundle inventory helpers", () => {
  it("encodes and decodes QR payloads", () => {
    const payload = {
      v: 1 as const,
      bundleId: "bundle-1",
      bundleNumber: "LGM-BND-0001",
      qrCodeNumber: "LGM-QR-0001",
      productCatalogId: "prod-1",
      color: "Blue",
      size: "L",
      quantity: 25,
      warehouseCode: "MAIN"
    };
    const encoded = encodeQrPayload(payload);
    expect(decodeQrPayload(encoded)).toEqual(payload);
  });

  it("normalizes single and multi-variant registration input", () => {
    expect(normalizeRegisterVariants({
      productName: "Shirt",
      style: "Classic",
      color: "Blue",
      size: "L",
      bundleQuantity: 2,
      piecesPerBundle: 25,
      unitCost: 10,
      sellingPrice: 20,
      warehouseId: "wh"
    })).toHaveLength(1);

    expect(normalizeRegisterVariants({
      productName: "Shirt",
      style: "Classic",
      variants: [
        { color: "Blue", colorCode: "BLU", size: "L", bundleQuantity: 1, piecesPerBundle: 25 },
        { color: "Red", colorCode: "RED", size: "M", bundleQuantity: 2, piecesPerBundle: 20 }
      ],
      unitCost: 10,
      sellingPrice: 20,
      warehouseId: "wh"
    })).toHaveLength(2);
  });
});
