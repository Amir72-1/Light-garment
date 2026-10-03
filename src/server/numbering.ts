const PRODUCT_SKU_PREFIX = "LGM-SH-";
const BUNDLE_NUMBER_MARKER = "-BND-";

function highestSuffix(values: string[], marker: string) {
  return values.reduce((max, value) => {
    const index = value.lastIndexOf(marker);
    if (index < 0) return max;
    const number = Number(value.slice(index + marker.length));
    return Number.isInteger(number) && number > max ? number : max;
  }, 0);
}

// Sequences continue from the highest existing number so deleted records never cause a duplicate.
export function nextProductSku(existingSkus: string[]) {
  const highest = highestSuffix(existingSkus.filter((sku) => sku.startsWith(PRODUCT_SKU_PREFIX)), PRODUCT_SKU_PREFIX);
  return `${PRODUCT_SKU_PREFIX}${String(highest + 1).padStart(4, "0")}`;
}

export function nextBundleNumber(prefix: string, existingBundleNumbers: string[]) {
  return `${prefix}${BUNDLE_NUMBER_MARKER}${String(highestSuffix(existingBundleNumbers, BUNDLE_NUMBER_MARKER) + 1).padStart(5, "0")}`;
}
