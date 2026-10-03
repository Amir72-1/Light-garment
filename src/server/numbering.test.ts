import { describe, expect, it } from "vitest";
import { nextBundleNumber, nextProductSku } from "./numbering.js";

describe("record numbering", () => {
  it("continues product SKUs after the highest existing number", () => {
    expect(nextProductSku([])).toBe("LGM-SH-0001");
    expect(nextProductSku(["LGM-SH-0002", "LGM-SH-0004", "CUSTOM-9"])).toBe("LGM-SH-0005");
  });

  it("continues bundle numbers after the highest number across prefixes", () => {
    expect(nextBundleNumber("LGM", [])).toBe("LGM-BND-00001");
    expect(nextBundleNumber("POLO", ["LGM-BND-00002", "SHIRT-BND-00007"])).toBe("POLO-BND-00008");
  });
});
