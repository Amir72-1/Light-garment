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
  v: 1;
  bundleId: string;
  bundleNumber: string;
  qrCodeNumber: string;
  productCatalogId: string;
  color: string;
  size: string;
  quantity: number;
  warehouseCode: string;
}

export interface FabricType {
  id: string;
  name: string;
}

export interface ColorOption {
  id: string;
  name: string;
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
  size: string;
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
  size: string;
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

export interface RegisterBundleInput {
  productName: string;
  style: string;
  fabric?: string;
  fabricId?: string;
  color: string;
  colorId?: string;
  size: string;
  sizeId?: string;
  bundleQuantity: number;
  piecesPerBundle: number;
  unitCost: number;
  sellingPrice: number;
  warehouseId: string;
  storageLocationId?: string;
  images?: string[];
  skuPrefix?: string;
}

export interface MoveBundleInput {
  bundleId: string;
  quantity: number;
  toWarehouseId: string;
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

export function encodeQrPayload(payload: QrBundlePayload) {
  return JSON.stringify(payload);
}

export function decodeQrPayload(raw: string): QrBundlePayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as QrBundlePayload;
    if (parsed?.v === 1 && parsed.bundleId && parsed.qrCodeNumber) return parsed;
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
