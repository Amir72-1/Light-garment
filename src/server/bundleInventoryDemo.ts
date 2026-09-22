import crypto from "node:crypto";
import QRCode from "qrcode";
import type {
  BundleItem,
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
  RegisterBundleMixedItemInput,
  RegisterBundleVariantInput,
  SizeOption,
  SplitBundleInput,
  StockTransaction,
  StockTransactionType,
  StorageLocation,
  Warehouse
} from "../shared/bundleInventory.js";
import {
  assertMoveQuantity,
  buildReferenceNumber,
  encodeQrPayload,
  isMixedRegistration,
  isOutflowTransaction,
  mixedBundleLineKey,
  normalizeMixedItems,
  normalizeRegisterVariants,
  requiresDestination,
  type QrBundlePayload
} from "../shared/bundleInventory.js";

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
      colorCode: bundle.colorCode,
      size: bundle.size,
      isMixed: bundle.isMixed,
      items: bundle.items,
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
    const code = colorCode?.trim().toUpperCase();
    const existing = this.colors.find((item) => item.name.toLowerCase() === trimmedName.toLowerCase());
    if (existing) {
      if (!code && !existing.code) throw new Error(`Color code is required for ${trimmedName}.`);
      if (code) existing.code = code;
      return existing;
    }
    if (!code) throw new Error(`Color code is required for new color ${trimmedName}.`);
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
    if (isMixedRegistration(input)) {
      return this.registerMixedBundles(input, ctx);
    }
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

  private ensureMixedItems(mixedItems: RegisterBundleMixedItemInput[]) {
    const prepared: Array<{ color: ColorOption; size: string; pieces: number }> = [];
    const seen = new Set<string>();
    for (const item of mixedItems) {
      if (item.pieces < 1) throw new Error("Each color/size line must have at least 1 piece.");
      const color = this.ensureDemoColor(item.color, item.colorCode);
      const key = mixedBundleLineKey(color.name, item.size);
      if (seen.has(key)) throw new Error(`Duplicate color/size line: ${color.name} ${item.size}.`);
      seen.add(key);
      prepared.push({ color, size: item.size, pieces: item.pieces });
    }
    return prepared;
  }

  async registerMixedBundles(input: RegisterBundleInput, ctx: AuditContext): Promise<InventoryBundle[]> {
    const mixedItems = normalizeMixedItems(input);
    const bundleQuantity = input.bundleQuantity ?? 1;
    if (bundleQuantity < 1) throw new Error("Bundle quantity must be at least 1.");
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

    const preparedItems = this.ensureMixedItems(mixedItems);
    const piecesPerBundle = preparedItems.reduce((sum, item) => sum + item.pieces, 0);
    const created: InventoryBundle[] = [];

    for (let index = 0; index < bundleQuantity; index += 1) {
      const bundleId = id("bnd");
      const bundleNumber = `LGM-BND-${String(this.bundles.length + 1).padStart(5, "0")}`;
      const qrCodeNumber = `LGM-QR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const items: BundleItem[] = preparedItems.map((item) => ({
        id: id("item"),
        bundleId,
        color: item.color.name,
        colorCode: item.color.code,
        size: item.size,
        quantity: item.pieces,
        remaining: item.pieces
      }));
      const payload: QrBundlePayload = {
        v: 2,
        bundleId,
        bundleNumber,
        qrCodeNumber,
        productCatalogId: catalog.id,
        color: "Mixed",
        size: "Mixed",
        quantity: piecesPerBundle,
        warehouseCode: warehouse.code,
        items: items.map((item) => ({
          color: item.color,
          colorCode: item.colorCode,
          size: item.size,
          quantity: item.remaining
        }))
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
        color: "Mixed",
        size: "Mixed",
        isMixed: true,
        items,
        piecesPerBundle,
        remainingPieces: piecesPerBundle,
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
        quantity: piecesPerBundle,
        toWarehouseName: warehouse.name,
        toLocationName: location?.name,
        userId: ctx.userId,
        userName: this.users.get(ctx.userId) ?? "Demo user",
        reason: "Mixed assortment bundle registration",
        referenceNumber: buildReferenceNumber("RCV"),
        createdAt: nowIso()
      });
      created.push(bundle);
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
    const payload: QrBundlePayload = bundle.isMixed && bundle.items?.length
      ? {
          v: 2,
          bundleId: bundle.id,
          bundleNumber: bundle.bundleNumber,
          qrCodeNumber: bundle.qrCodeNumber,
          productCatalogId: bundle.productCatalogId,
          color: bundle.color,
          colorCode: bundle.colorCode,
          size: bundle.size,
          quantity: bundle.remainingPieces,
          warehouseCode,
          items: bundle.items.map((item) => ({
            color: item.color,
            colorCode: item.colorCode,
            size: item.size,
            quantity: item.remaining
          }))
        }
      : {
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

    const wholeBundleTransfer = Boolean(source.isMixed)
      && input.type === "Transfer"
      && input.quantity === source.remainingPieces
      && requiresDestination(input.type);

    if (source.isMixed && !wholeBundleTransfer) {
      if (!input.itemColor || !input.itemSize) throw new Error("Select a color and size line for mixed assortment bundle moves.");
      const line = source.items?.find(
        (item) => mixedBundleLineKey(item.color, item.size) === mixedBundleLineKey(input.itemColor!, input.itemSize!)
      );
      if (!line) throw new Error(`No ${input.itemColor} ${input.itemSize} line found in this bundle.`);
      assertMoveQuantity(line.remaining, input.quantity);
    } else {
      assertMoveQuantity(source.remainingPieces, input.quantity);
    }

    const outflow = isOutflowTransaction(input.type);
    const originalRemaining = source.remainingPieces;
    let toWarehouse: Warehouse | undefined;
    if (requiresDestination(input.type)) {
      if (!input.toWarehouseId) throw new Error("Destination warehouse is required for this transaction.");
      toWarehouse = this.warehouseById(input.toWarehouseId);
      if (!wholeBundleTransfer && source.warehouseId === input.toWarehouseId && (source.storageLocationId ?? null) === (input.toLocationId ?? null)) {
        throw new Error("Destination must differ from the current location.");
      }
    }

    let movedLine: BundleItem | undefined;
    if (source.isMixed && source.items && !wholeBundleTransfer) {
      movedLine = source.items.find(
        (item) => mixedBundleLineKey(item.color, item.size) === mixedBundleLineKey(input.itemColor!, input.itemSize!)
      );
      if (movedLine) movedLine.remaining -= input.quantity;
    }

    source.remainingPieces -= input.quantity;
    source.status = source.remainingPieces === 0 ? "Depleted" : source.status;
    source.version += 1;
    source.updatedAt = nowIso();
    if (wholeBundleTransfer && toWarehouse) {
      source.warehouseId = toWarehouse.id;
      source.warehouseName = toWarehouse.name;
      source.warehouseCode = toWarehouse.code;
      const toLocation = this.locationById(input.toLocationId);
      source.storageLocationId = toLocation?.id;
      source.storageLocationName = toLocation?.name;
      source.storageLocationCode = toLocation?.code;
    }
    await this.refreshBundleQr(source, wholeBundleTransfer && toWarehouse ? toWarehouse.code : source.warehouseCode);

    let destination: InventoryBundle | undefined;
    const shouldCreateDestination = !outflow && toWarehouse && !wholeBundleTransfer && (
      input.type === "Transfer" || input.type === "Split" || input.type === "Return" || input.quantity < originalRemaining
    );
    if (shouldCreateDestination && toWarehouse) {
      const toLocation = this.locationById(input.toLocationId);
      const bundleId = id("bnd");
      const bundleNumber = `LGM-BND-${String(this.bundles.length + 1).padStart(5, "0")}`;
      const qrCodeNumber = `LGM-QR-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const destColor = movedLine?.color ?? source.color;
      const destColorCode = movedLine?.colorCode ?? source.colorCode;
      const destSize = movedLine?.size ?? source.size;
      const payload: QrBundlePayload = {
        v: 1,
        bundleId,
        bundleNumber,
        qrCodeNumber,
        productCatalogId: source.productCatalogId,
        color: destColor,
        colorCode: destColorCode,
        size: destSize,
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
        color: destColor,
        colorCode: destColorCode,
        size: destSize,
        isMixed: false,
        items: undefined,
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
      toWarehouseName: toWarehouse?.name,
      toLocationName: this.locationById(input.toLocationId)?.name,
      userId: ctx.userId,
      userName: this.users.get(ctx.userId) ?? "Demo user",
      reason: input.reason,
      referenceNumber: buildReferenceNumber(outflow ? "OUT" : "TRF"),
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
