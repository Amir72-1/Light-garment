import crypto from "node:crypto";
import QRCode from "qrcode";
import type {
  BundleScanResult,
  ColorOption,
  FabricType,
  InventoryBundle,
  MoveBundleInput,
  OfflineSyncOperation,
  OfflineSyncResult,
  ProductCatalog,
  CreateColorInput,
  RegisterBundleInput,
  RegisterBundleVariantInput,
  SizeOption,
  SplitBundleInput,
  StockTransaction,
  StockTransactionType,
  StorageLocation,
  Warehouse
} from "../shared/bundleInventory.js";
import { assertMoveQuantity, buildReferenceNumber, encodeQrPayload, normalizeRegisterVariants, type QrBundlePayload } from "../shared/bundleInventory.js";

type AuditContext = { userId: string; ipAddress?: string };

const id = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

export class BundleInventoryDemo {
  private fabrics: FabricType[] = [
    { id: "fab_cotton", name: "Cotton" },
    { id: "fab_denim", name: "Denim" }
  ];
  private colors: ColorOption[] = [
    { id: "col_blue", name: "Blue", code: "BLU" },
    { id: "col_black", name: "Black", code: "BLK" },
    { id: "col_white", name: "White", code: "WHT" }
  ];
  private sizes: SizeOption[] = [
    { id: "size_s", code: "S", sortOrder: 1 },
    { id: "size_m", code: "M", sortOrder: 2 },
    { id: "size_l", code: "L", sortOrder: 3 },
    { id: "size_xl", code: "XL", sortOrder: 4 }
  ];
  private warehouses: Warehouse[] = [{ id: "wh_main", name: "Main Warehouse", code: "MAIN", address: "Addis Ababa" }];
  private locations: StorageLocation[] = [
    { id: "loc_a1", warehouseId: "wh_main", code: "A-01", name: "Shelf A-01" },
    { id: "loc_a2", warehouseId: "wh_main", code: "A-02", name: "Shelf A-02" }
  ];
  private catalogs: ProductCatalog[] = [];
  private bundles: InventoryBundle[] = [];
  private transactions: StockTransaction[] = [];
  private users = new Map<string, string>();

  setUserName(userId: string, name: string) {
    this.users.set(userId, name);
  }

  async listFabrics() { return this.fabrics; }
  async listColors() { return this.colors; }
  async listSizes() { return this.sizes; }
  async listWarehouses() { return this.warehouses; }
  async listLocations(warehouseId?: string) {
    return warehouseId ? this.locations.filter((item) => item.warehouseId === warehouseId) : this.locations;
  }
  async listCatalog() { return this.catalogs; }
  async listBundles() { return [...this.bundles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }

  async searchBundles(query: string) {
    const q = query.trim().toLowerCase();
    if (!q) return this.listBundles();
    return this.bundles.filter((bundle) =>
      [bundle.bundleNumber, bundle.qrCodeNumber, bundle.productName, bundle.color, bundle.colorCode, bundle.size, bundle.qrPayload]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(q))
    );
  }

  async scanBundle(code: string): Promise<BundleScanResult | null> {
    const bundle = this.bundles.find((item) =>
      item.qrPayload === code || item.qrCodeNumber === code || item.bundleNumber === code
    );
    if (!bundle) return null;
    return {
      bundle,
      productName: bundle.productName,
      style: bundle.style,
      color: bundle.color,
      size: bundle.size,
      bundleNumber: bundle.bundleNumber,
      remainingPieces: bundle.remainingPieces,
      warehouse: bundle.warehouseName,
      shelfLocation: bundle.storageLocationName,
      status: bundle.status
    };
  }

  private warehouseById(warehouseId: string) {
    const warehouse = this.warehouses.find((item) => item.id === warehouseId);
    if (!warehouse) throw new Error("Warehouse not found.");
    return warehouse;
  }

  private locationById(locationId?: string) {
    return locationId ? this.locations.find((item) => item.id === locationId) : undefined;
  }

  private ensureDemoColor(name: string, colorCode?: string) {
    const trimmedName = name.trim();
    const code = colorCode?.trim().toUpperCase() || trimmedName.slice(0, 3).toUpperCase();
    const existing = this.colors.find((item) => item.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      if (colorCode) existing.code = code;
      return existing;
    }
    const codeTaken = this.colors.find((item) => item.code === code);
    if (codeTaken) throw new Error(`Color code ${code} is already used by ${codeTaken.name}.`);
    const created = { id: id("col"), name: trimmedName, code };
    this.colors.push(created);
    return created;
  }

  async createColor(input: CreateColorInput) {
    return this.ensureDemoColor(input.name, input.code);
  }

  async registerBundles(input: RegisterBundleInput, ctx: AuditContext): Promise<InventoryBundle[]> {
    const variants = normalizeRegisterVariants(input);
    const warehouse = this.warehouseById(input.warehouseId);
    const location = this.locationById(input.storageLocationId);
    let catalog = this.catalogs.find((item) => item.name === input.productName && item.style === input.style);
    if (!catalog) {
      catalog = {
        id: id("cat"),
        name: input.productName,
        style: input.style,
        fabricName: input.fabric,
        skuPrefix: "LGM",
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.catalogs.unshift(catalog);
    }
    const created: InventoryBundle[] = [];
    for (const variantInput of variants) {
      const color = this.ensureDemoColor(variantInput.color, variantInput.colorCode);
      for (let index = 0; index < variantInput.bundleQuantity; index += 1) {
        const bundleId = id("bnd");
        const bundleNumber = `LGM-BND-${String(this.bundles.length + 1).padStart(5, "0")}`;
        const qrCodeNumber = `LGM-QR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const payload: QrBundlePayload = {
          v: 1,
          bundleId,
          bundleNumber,
          qrCodeNumber,
          productCatalogId: catalog.id,
          color: color.name,
          colorCode: color.code,
          size: variantInput.size,
          quantity: variantInput.piecesPerBundle,
          warehouseCode: warehouse.code
        };
        const qrPayload = encodeQrPayload(payload);
        const qrImageUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 256 });
        const bundle: InventoryBundle = {
          id: bundleId,
          bundleNumber,
          qrCodeNumber,
          qrPayload,
          qrImageUrl,
          productCatalogId: catalog.id,
          productName: input.productName,
          style: input.style,
          fabric: input.fabric,
          color: color.name,
          colorCode: color.code,
          size: variantInput.size,
          piecesPerBundle: variantInput.piecesPerBundle,
          remainingPieces: variantInput.piecesPerBundle,
          unitCost: input.unitCost,
          sellingPrice: input.sellingPrice,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          warehouseCode: warehouse.code,
          storageLocationId: location?.id,
          storageLocationName: location?.name,
          storageLocationCode: location?.code,
          status: "Active",
          version: 1,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        this.bundles.unshift(bundle);
        this.transactions.unshift({
          id: id("txn"),
          bundleId: bundle.id,
          bundleNumber: bundle.bundleNumber,
          productName: bundle.productName,
          type: "Receiving",
          quantity: variantInput.piecesPerBundle,
          toWarehouseName: warehouse.name,
          toLocationName: location?.name,
          userId: ctx.userId,
          userName: this.users.get(ctx.userId) ?? "Demo user",
          reason: "Bundle registration",
          referenceNumber: buildReferenceNumber("RCV"),
          createdAt: nowIso()
        });
        created.push(bundle);
      }
    }
    return created;
  }

  async deleteBundle(bundleId: string) {
    const index = this.bundles.findIndex((item) => item.id === bundleId);
    if (index < 0) throw new Error("Bundle not found.");
    const activeChildren = this.bundles.filter((item) => item.parentBundleId === bundleId && item.remainingPieces > 0);
    if (activeChildren.length > 0) throw new Error("Cannot delete bundle while active child bundles still hold inventory.");
    this.bundles.splice(index, 1);
  }

  private async refreshBundleQr(bundle: InventoryBundle, warehouseCode = bundle.warehouseCode) {
    const payload: QrBundlePayload = {
      v: 1,
      bundleId: bundle.id,
      bundleNumber: bundle.bundleNumber,
      qrCodeNumber: bundle.qrCodeNumber,
      productCatalogId: bundle.productCatalogId,
      color: bundle.color,
      colorCode: bundle.colorCode,
      size: bundle.size,
      quantity: bundle.remainingPieces,
      warehouseCode
    };
    bundle.qrPayload = encodeQrPayload(payload);
    bundle.qrImageUrl = await QRCode.toDataURL(bundle.qrPayload, { margin: 1, width: 256 });
  }

  async moveBundlePieces(input: MoveBundleInput, ctx: AuditContext) {
    const source = this.bundles.find((item) => item.id === input.bundleId);
    if (!source) throw new Error("Bundle not found.");
    if (input.expectedVersion && source.version !== input.expectedVersion) {
      throw new Error("Bundle was updated elsewhere. Refresh and try again.");
    }
    assertMoveQuantity(source.remainingPieces, input.quantity);
    const toWarehouse = this.warehouseById(input.toWarehouseId);
    const toLocation = this.locationById(input.toLocationId);
    if (source.warehouseId === input.toWarehouseId && (source.storageLocationId ?? null) === (input.toLocationId ?? null)) {
      throw new Error("Destination must differ from the current location.");
    }

    source.remainingPieces -= input.quantity;
    source.status = source.remainingPieces === 0 ? "Depleted" : source.status;
    source.version += 1;
    source.updatedAt = nowIso();
    await this.refreshBundleQr(source);

    let destination: InventoryBundle | undefined;
    if (input.quantity < source.remainingPieces + input.quantity || input.type === "Transfer" || input.type === "Split") {
      const bundleId = id("bnd");
      const bundleNumber = `LGM-BND-${String(this.bundles.length + 1).padStart(5, "0")}`;
      const qrCodeNumber = `LGM-QR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const payload: QrBundlePayload = {
        v: 1,
        bundleId,
        bundleNumber,
        qrCodeNumber,
        productCatalogId: source.productCatalogId,
        color: source.color,
        colorCode: source.colorCode,
        size: source.size,
        quantity: input.quantity,
        warehouseCode: toWarehouse.code
      };
      destination = {
        ...source,
        id: bundleId,
        bundleNumber,
        qrCodeNumber,
        qrPayload: encodeQrPayload(payload),
        qrImageUrl: await QRCode.toDataURL(encodeQrPayload(payload), { margin: 1, width: 256 }),
        piecesPerBundle: input.quantity,
        remainingPieces: input.quantity,
        warehouseId: toWarehouse.id,
        warehouseName: toWarehouse.name,
        warehouseCode: toWarehouse.code,
        storageLocationId: toLocation?.id,
        storageLocationName: toLocation?.name,
        storageLocationCode: toLocation?.code,
        parentBundleId: source.id,
        status: "Active",
        version: 1,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.bundles.unshift(destination);
    }

    const transaction: StockTransaction = {
      id: id("txn"),
      bundleId: source.id,
      bundleNumber: source.bundleNumber,
      productName: source.productName,
      type: input.type,
      quantity: input.quantity,
      fromWarehouseName: source.warehouseName,
      toWarehouseName: toWarehouse.name,
      toLocationName: toLocation?.name,
      userId: ctx.userId,
      userName: this.users.get(ctx.userId) ?? "Demo user",
      reason: input.reason,
      referenceNumber: buildReferenceNumber("TRF"),
      sourceBundleId: source.id,
      destinationBundleId: destination?.id,
      note: input.note,
      createdAt: nowIso()
    };
    this.transactions.unshift(transaction);
    return { source, destination, transaction };
  }

  async splitBundle(input: SplitBundleInput, ctx: AuditContext) {
    const source = this.bundles.find((item) => item.id === input.bundleId);
    if (!source) throw new Error("Bundle not found.");
    return this.moveBundlePieces({
      bundleId: input.bundleId,
      quantity: input.quantity,
      toWarehouseId: input.toWarehouseId || source.warehouseId,
      toLocationId: input.toLocationId,
      type: "Split",
      reason: input.reason ?? "Bundle split",
      note: input.note,
      expectedVersion: input.expectedVersion
    }, ctx);
  }

  async listTransactions(bundleId?: string) {
    return (bundleId ? this.transactions.filter((item) => item.bundleId === bundleId) : this.transactions)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async reprintQr(bundleId: string) {
    const bundle = this.bundles.find((item) => item.id === bundleId);
    if (!bundle) throw new Error("Bundle not found.");
    await this.refreshBundleQr(bundle);
    return bundle;
  }

  async syncOfflineOperations(operations: OfflineSyncOperation[], ctx: AuditContext): Promise<OfflineSyncResult[]> {
    const results: OfflineSyncResult[] = [];
    for (const operation of operations) {
      try {
        if (operation.type === "register_bundle") {
          results.push({ clientId: operation.clientId, success: true, data: await this.registerBundles(operation.payload as RegisterBundleInput, ctx) });
        } else if (operation.type === "move_inventory") {
          results.push({ clientId: operation.clientId, success: true, data: await this.moveBundlePieces(operation.payload as MoveBundleInput, ctx) });
        } else if (operation.type === "split_bundle") {
          results.push({ clientId: operation.clientId, success: true, data: await this.splitBundle(operation.payload as SplitBundleInput, ctx) });
        } else {
          results.push({ clientId: operation.clientId, success: false, error: "Unsupported offline operation." });
        }
      } catch (error) {
        results.push({ clientId: operation.clientId, success: false, error: error instanceof Error ? error.message : "Sync failed" });
      }
    }
    return results;
  }

  async ensureDefaults() {}
}
