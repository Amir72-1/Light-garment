export type BundleStatus = "Active" | "Depleted" | "Split" | "Archived";

export type StockTransactionType =
  | "Receiving"
  | "Transfer"
  | "Sale"
  | "Return"
  | "Production consumption"
  | "Adjustment"
  | "Cycle count"
  | "Split";

export interface QrBundlePayload {
  v: 1 | 2;
  bundleId: string;
  bundleNumber: string;
  qrCodeNumber: string;
  productCatalogId: string;
  color: string;
  colorCode?: string;
  size: string;
  quantity: number;
  warehouseCode: string;
  items?: Array<{ color: string; colorCode?: string; size: string; quantity: number }>;
}

export interface BundleItem {
  id: string;
  bundleId: string;
  variantId?: string;
  color: string;
  colorCode?: string;
  size: string;
  quantity: number;
  remaining: number;
}

export interface FabricType {
  id: string;
  name: string;
}

export interface ColorOption {
  id: string;
  name: string;
  code?: string;
  hexCode?: string;
}

export interface SizeOption {
  id: string;
  code: string;
  sortOrder: number;
}

export interface ProductCatalog {
  id: string;
  name: string;
  style: string;
  fabricId?: string;
  fabricName?: string;
  skuPrefix?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productCatalogId: string;
  colorId: string;
  colorName: string;
  sizeId: string;
  sizeCode: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  images: string[];
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address?: string;
}

export interface StorageLocation {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
}

export interface InventoryBundle {
  id: string;
  bundleNumber: string;
  qrCodeNumber: string;
  qrPayload: string;
  qrImageUrl?: string;
  productCatalogId: string;
  variantId?: string;
  productName: string;
  style: string;
  fabric?: string;
  color: string;
  colorCode?: string;
  size: string;
  isMixed?: boolean;
  items?: BundleItem[];
  piecesPerBundle: number;
  remainingPieces: number;
  unitCost: number;
  sellingPrice: number;
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  storageLocationId?: string;
  storageLocationName?: string;
  storageLocationCode?: string;
  status: BundleStatus;
  parentBundleId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface BundleScanResult {
  bundle: InventoryBundle;
  productName: string;
  style: string;
  color: string;
  colorCode?: string;
  size: string;
  isMixed?: boolean;
  items?: BundleItem[];
  bundleNumber: string;
  remainingPieces: number;
  warehouse: string;
  shelfLocation?: string;
  status: BundleStatus;
}

export interface StockTransaction {
  id: string;
  bundleId: string;
  bundleNumber: string;
  productName: string;
  type: StockTransactionType;
  quantity: number;
  fromWarehouseName?: string;
  toWarehouseName?: string;
  fromLocationName?: string;
  toLocationName?: string;
  userId: string;
  userName: string;
  reason?: string;
  referenceNumber: string;
  sourceBundleId?: string;
  destinationBundleId?: string;
  note?: string;
  createdAt: string;
}

export interface RegisterBundleMixedItemInput {
  color: string;
  colorId?: string;
  colorCode?: string;
  size: string;
  sizeId?: string;
  pieces: number;
}

export interface RegisterBundleVariantInput {
  color: string;
  colorId?: string;
  colorCode?: string;
  size: string;
  sizeId?: string;
  bundleQuantity: number;
  piecesPerBundle: number;
}

export interface RegisterBundleInput {
  productName: string;
  style: string;
  fabric?: string;
  fabricId?: string;
  color?: string;
  colorId?: string;
  colorCode?: string;
  size?: string;
  sizeId?: string;
  bundleQuantity?: number;
  piecesPerBundle?: number;
  variants?: RegisterBundleVariantInput[];
  mixedItems?: RegisterBundleMixedItemInput[];
  registrationMode?: "separate" | "mixed";
  unitCost: number;
  sellingPrice: number;
  warehouseId: string;
  storageLocationId?: string;
  images?: string[];
  skuPrefix?: string;
}

export interface CreateColorInput {
  name: string;
  code: string;
  hexCode?: string;
}

export interface MoveBundleInput {
  bundleId: string;
  quantity: number;
  itemColor?: string;
  itemSize?: string;
  toWarehouseId?: string;
  toLocationId?: string;
  type: StockTransactionType;
  reason?: string;
  note?: string;
  expectedVersion?: number;
}

export interface SplitBundleInput {
  bundleId: string;
  quantity: number;
  toWarehouseId?: string;
  toLocationId?: string;
  reason?: string;
  note?: string;
  expectedVersion?: number;
}

export interface OfflineSyncOperation {
  clientId: string;
  type: "register_bundle" | "move_inventory" | "split_bundle" | "stock_adjustment";
  payload: RegisterBundleInput | MoveBundleInput | SplitBundleInput;
  clientTimestamp: string;
}

export interface OfflineSyncResult {
  clientId: string;
  success: boolean;
  error?: string;
  data?: unknown;
}

export function isOutflowTransaction(type: StockTransactionType) {
  return type === "Sale" || type === "Production consumption" || type === "Adjustment";
}

export function requiresDestination(type: StockTransactionType) {
  return type === "Transfer" || type === "Split" || type === "Return";
}

export function normalizeRegisterVariants(input: RegisterBundleInput): RegisterBundleVariantInput[] {
  if (input.variants?.length) return input.variants;
  if (!input.color || !input.size || !input.bundleQuantity || !input.piecesPerBundle) {
    throw new Error("At least one color and size variant is required.");
  }
  return [{
    color: input.color,
    colorId: input.colorId,
    colorCode: input.colorCode,
    size: input.size,
    sizeId: input.sizeId,
    bundleQuantity: input.bundleQuantity,
    piecesPerBundle: input.piecesPerBundle
  }];
}

export function isMixedRegistration(input: RegisterBundleInput) {
  return input.registrationMode === "mixed" || Boolean(input.mixedItems?.length);
}

export function normalizeMixedItems(input: RegisterBundleInput): RegisterBundleMixedItemInput[] {
  if (input.mixedItems?.length) return input.mixedItems;
  throw new Error("At least one color/size line is required for a mixed assortment bundle.");
}

export function mixedBundleLineKey(color: string, size: string) {
  return `${color.trim().toLowerCase()}::${size.trim().toUpperCase()}`;
}

export function formatMixedBundleSummary(items?: BundleItem[]) {
  if (!items?.length) return "Mixed assortment";
  return items.map((item) => `${item.color} ${item.size} (${item.remaining})`).join(" · ");
}

export function encodeQrPayload(payload: QrBundlePayload) {
  return JSON.stringify(payload);
}

export function decodeQrPayload(raw: string): QrBundlePayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as QrBundlePayload;
    if (parsed?.v === 1 && parsed.bundleId && parsed.qrCodeNumber) return parsed;
    if (parsed?.v === 2 && parsed.bundleId && parsed.qrCodeNumber) return parsed;
  } catch {
    // fall through
  }
  return null;
}

export function buildReferenceNumber(prefix = "STK") {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${random}`;
}

export function assertMoveQuantity(available: number, requested: number) {
  if (requested <= 0) throw new Error("Quantity must be greater than zero.");
  if (requested > available) throw new Error(`Cannot move ${requested} pieces. Only ${available} available.`);
}
