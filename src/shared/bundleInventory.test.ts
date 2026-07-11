import { describe, expect, it } from "vitest";
import { assertMoveQuantity, decodeQrPayload, encodeQrPayload } from "./bundleInventory.js";

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

  it("rejects moving more pieces than available", () => {
    expect(() => assertMoveQuantity(10, 11)).toThrow(/Only 10 available/);
  });
});
