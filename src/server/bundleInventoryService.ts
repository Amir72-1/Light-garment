import crypto from "node:crypto";
import QRCode from "qrcode";
import type { PrismaClient } from "@prisma/client";
import type {
  BundleScanResult,
  BundleStatus,
  ColorOption,
  FabricType,
  InventoryBundle,
  MoveBundleInput,
  OfflineSyncOperation,
  OfflineSyncResult,
  ProductCatalog,
  ProductVariant,
  RegisterBundleInput,
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
  decodeQrPayload,
  encodeQrPayload,
  type QrBundlePayload
} from "../shared/bundleInventory.js";

type AuditContext = { userId: string; ipAddress?: string };

const bundleStatusFromDb: Record<string, BundleStatus> = {
  ACTIVE: "Active",
  DEPLETED: "Depleted",
  SPLIT: "Split",
  ARCHIVED: "Archived"
};

const bundleStatusToDb: Record<BundleStatus, string> = {
  Active: "ACTIVE",
  Depleted: "DEPLETED",
  Split: "SPLIT",
  Archived: "ARCHIVED"
};

const transactionTypeFromDb: Record<string, StockTransactionType> = {
  RECEIVING: "Receiving",
  TRANSFER: "Transfer",
  SALE: "Sale",
  RETURN: "Return",
  PRODUCTION_CONSUMPTION: "Production consumption",
  ADJUSTMENT: "Adjustment",
  CYCLE_COUNT: "Cycle count",
  SPLIT: "Split"
};

const transactionTypeToDb: Record<StockTransactionType, string> = {
  Receiving: "RECEIVING",
  Transfer: "TRANSFER",
  Sale: "SALE",
  Return: "RETURN",
  "Production consumption": "PRODUCTION_CONSUMPTION",
  Adjustment: "ADJUSTMENT",
  "Cycle count": "CYCLE_COUNT",
  Split: "SPLIT"
};

function bundleFromRow(row: any): InventoryBundle {
  return {
    id: row.id,
    bundleNumber: row.bundleNumber,
    qrCodeNumber: row.qrCodeNumber,
    qrPayload: row.qrPayload,
    qrImageUrl: row.qrImageUrl ?? undefined,
    productCatalogId: row.productCatalogId,
    variantId: row.variantId ?? undefined,
    productName: row.productName,
    style: row.style,
    fabric: row.fabric ?? undefined,
    color: row.color,
    size: row.size,
    piecesPerBundle: row.piecesPerBundle,
    remainingPieces: row.remainingPieces,
    unitCost: Number(row.unitCost),
    sellingPrice: Number(row.sellingPrice),
    warehouseId: row.warehouseId,
    warehouseName: row.warehouse?.name ?? "",
    warehouseCode: row.warehouse?.code ?? "",
    storageLocationId: row.storageLocationId ?? undefined,
    storageLocationName: row.storageLocation?.name,
    storageLocationCode: row.storageLocation?.code,
    status: bundleStatusFromDb[row.status],
    parentBundleId: row.parentBundleId ?? undefined,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function transactionFromRow(row: any): StockTransaction {
  return {
    id: row.id,
    bundleId: row.bundleId,
    bundleNumber: row.bundle.bundleNumber,
    productName: row.bundle.productName,
    type: transactionTypeFromDb[row.type],
    quantity: row.quantity,
    fromWarehouseName: row.fromWarehouse?.name,
    toWarehouseName: row.toWarehouse?.name,
    fromLocationName: undefined,
    toLocationName: undefined,
    userId: row.userId,
    userName: row.user?.name ?? "Unknown",
    reason: row.reason ?? undefined,
    referenceNumber: row.referenceNumber,
    sourceBundleId: row.sourceBundleId ?? undefined,
    destinationBundleId: row.destinationBundleId ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

async function writeAudit(
  prisma: PrismaClient,
  ctx: AuditContext,
  action: string,
  entityType: string,
  entityId: string,
  oldValue?: unknown,
  newValue?: unknown
) {
  await prisma.inventoryAuditLog.create({
    data: {
      userId: ctx.userId,
      action,
      entityType,
      entityId,
      oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : undefined,
      newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : undefined,
      ipAddress: ctx.ipAddress ?? null
    }
  });
}

async function ensureFabric(prisma: PrismaClient, name?: string, fabricId?: string) {
  if (fabricId) {
    const existing = await prisma.fabricType.findUnique({ where: { id: fabricId } });
    if (existing) return existing;
  }
  if (!name?.trim()) return null;
  return prisma.fabricType.upsert({
    where: { name: name.trim() },
    create: { name: name.trim() },
    update: {}
  });
}

async function ensureColor(prisma: PrismaClient, name: string, colorId?: string) {
  if (colorId) {
    const existing = await prisma.colorOption.findUnique({ where: { id: colorId } });
    if (existing) return existing;
  }
  return prisma.colorOption.upsert({
    where: { name: name.trim() },
    create: { name: name.trim() },
    update: {}
  });
}

async function ensureSize(prisma: PrismaClient, code: string, sizeId?: string) {
  if (sizeId) {
    const existing = await prisma.sizeOption.findUnique({ where: { id: sizeId } });
    if (existing) return existing;
  }
  return prisma.sizeOption.upsert({
    where: { code: code.trim().toUpperCase() },
    create: { code: code.trim().toUpperCase(), sortOrder: 0 },
    update: {}
  });
}

async function nextBundleNumber(prisma: PrismaClient, prefix: string) {
  const count = await prisma.inventoryBundle.count();
  return `${prefix}-BND-${String(count + 1).padStart(5, "0")}`;
}

async function nextQrCodeNumber(prisma: PrismaClient) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `LGM-QR-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const existing = await prisma.inventoryBundle.findUnique({ where: { qrCodeNumber: candidate } });
    if (!existing) return candidate;
  }
  return `LGM-QR-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

export class BundleInventoryService {
  constructor(private prisma: PrismaClient) {}

  async listFabrics(): Promise<FabricType[]> {
    const rows = await this.prisma.fabricType.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async listColors(): Promise<ColorOption[]> {
    const rows = await this.prisma.colorOption.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({ id: row.id, name: row.name, hexCode: row.hexCode ?? undefined }));
  }

  async listSizes(): Promise<SizeOption[]> {
    const rows = await this.prisma.sizeOption.findMany({ orderBy: { sortOrder: "asc" } });
    return rows.map((row) => ({ id: row.id, code: row.code, sortOrder: row.sortOrder }));
  }

  async listWarehouses(): Promise<Warehouse[]> {
    const rows = await this.prisma.warehouse.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({ id: row.id, name: row.name, code: row.code, address: row.address ?? undefined }));
  }

  async listLocations(warehouseId?: string): Promise<StorageLocation[]> {
    const rows = await this.prisma.storageLocation.findMany({
      where: warehouseId ? { warehouseId } : undefined,
      orderBy: { code: "asc" }
    });
    return rows.map((row) => ({ id: row.id, warehouseId: row.warehouseId, code: row.code, name: row.name }));
  }

  async listCatalog(): Promise<ProductCatalog[]> {
    const rows = await this.prisma.productCatalog.findMany({ include: { fabric: true }, orderBy: { name: "asc" } });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      style: row.style,
      fabricId: row.fabricId ?? undefined,
      fabricName: row.fabric?.name,
      skuPrefix: row.skuPrefix ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async searchBundles(query: string): Promise<InventoryBundle[]> {
    const q = query.trim();
    if (!q) return this.listBundles();
    const rows = await this.prisma.inventoryBundle.findMany({
      where: {
        OR: [
          { bundleNumber: { contains: q, mode: "insensitive" } },
          { qrCodeNumber: { contains: q, mode: "insensitive" } },
          { productName: { contains: q, mode: "insensitive" } },
          { color: { contains: q, mode: "insensitive" } },
          { size: { contains: q, mode: "insensitive" } },
          { qrPayload: { contains: q, mode: "insensitive" } }
        ]
      },
      include: { warehouse: true, storageLocation: true },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return rows.map(bundleFromRow);
  }

  async listBundles(): Promise<InventoryBundle[]> {
    const rows = await this.prisma.inventoryBundle.findMany({
      include: { warehouse: true, storageLocation: true },
      orderBy: { updatedAt: "desc" },
      take: 200
    });
    return rows.map(bundleFromRow);
  }

  async scanBundle(code: string, ctx: AuditContext): Promise<BundleScanResult | null> {
    const decoded = decodeQrPayload(code);
    const row = await this.prisma.inventoryBundle.findFirst({
      where: decoded
        ? { OR: [{ id: decoded.bundleId }, { qrCodeNumber: decoded.qrCodeNumber }, { qrPayload: code }] }
        : { OR: [{ qrCodeNumber: code }, { bundleNumber: code }, { qrPayload: code }] },
      include: { warehouse: true, storageLocation: true }
    });
    if (!row) return null;
    const bundle = bundleFromRow(row);
    await this.prisma.qrCodeHistory.create({
      data: {
        bundleId: row.id,
        qrCodeNumber: row.qrCodeNumber,
        action: "SCANNED",
        userId: ctx.userId,
        ipAddress: ctx.ipAddress ?? null
      }
    });
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

  async registerBundles(input: RegisterBundleInput, ctx: AuditContext): Promise<InventoryBundle[]> {
    if (input.bundleQuantity < 1) throw new Error("Bundle quantity must be at least 1.");
    if (input.piecesPerBundle < 1) throw new Error("Pieces per bundle must be at least 1.");

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw new Error("Warehouse not found.");

    const fabric = await ensureFabric(this.prisma, input.fabric, input.fabricId);
    const color = await ensureColor(this.prisma, input.color, input.colorId);
    const size = await ensureSize(this.prisma, input.size, input.sizeId);
    const prefix = (input.skuPrefix || input.productName.replace(/\s+/g, "-").slice(0, 8).toUpperCase() || "LGM").toUpperCase();

    const catalogExisting = await this.prisma.productCatalog.findFirst({
      where: { name: input.productName.trim(), style: input.style.trim() }
    });
    const catalog = catalogExisting
      ? await this.prisma.productCatalog.update({
          where: { id: catalogExisting.id },
          data: { fabricId: fabric?.id ?? null, skuPrefix: prefix }
        })
      : await this.prisma.productCatalog.create({
          data: {
            name: input.productName.trim(),
            style: input.style.trim(),
            fabricId: fabric?.id ?? null,
            skuPrefix: prefix
          }
        });

    const sku = `${prefix}-${color.name.toUpperCase().slice(0, 3)}-${size.code}`;
    const variant = await this.prisma.productVariant.upsert({
      where: { productCatalogId_colorId_sizeId: { productCatalogId: catalog.id, colorId: color.id, sizeId: size.id } },
      create: {
        productCatalogId: catalog.id,
        colorId: color.id,
        sizeId: size.id,
        sku,
        costPrice: input.unitCost,
        sellingPrice: input.sellingPrice,
        images: input.images ?? []
      },
      update: {
        costPrice: input.unitCost,
        sellingPrice: input.sellingPrice,
        images: input.images ?? []
      }
    });

    const created: InventoryBundle[] = [];
    for (let index = 0; index < input.bundleQuantity; index += 1) {
      const bundleNumber = await nextBundleNumber(this.prisma, prefix);
      const qrCodeNumber = await nextQrCodeNumber(this.prisma);
      const bundleId = crypto.randomUUID();
      const payload: QrBundlePayload = {
        v: 1,
        bundleId,
        bundleNumber,
        qrCodeNumber,
        productCatalogId: catalog.id,
        color: color.name,
        size: size.code,
        quantity: input.piecesPerBundle,
        warehouseCode: warehouse.code
      };
      const qrPayload = encodeQrPayload({ ...payload, bundleId });
      const qrImageUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 256 });

      const row = await this.prisma.inventoryBundle.create({
        data: {
          id: bundleId,
          bundleNumber,
          qrCodeNumber,
          qrPayload,
          qrImageUrl,
          productCatalogId: catalog.id,
          variantId: variant.id,
          productName: catalog.name,
          style: catalog.style,
          fabric: fabric?.name ?? input.fabric ?? null,
          color: color.name,
          size: size.code,
          piecesPerBundle: input.piecesPerBundle,
          remainingPieces: input.piecesPerBundle,
          unitCost: input.unitCost,
          sellingPrice: input.sellingPrice,
          warehouseId: warehouse.id,
          storageLocationId: input.storageLocationId ?? null,
          status: "ACTIVE"
        },
        include: { warehouse: true, storageLocation: true }
      });

      const referenceNumber = buildReferenceNumber("RCV");
      await this.prisma.stockTransaction.create({
        data: {
          bundleId: row.id,
          type: "RECEIVING",
          quantity: input.piecesPerBundle,
          toWarehouseId: warehouse.id,
          toLocationId: input.storageLocationId ?? null,
          userId: ctx.userId,
          reason: "Bundle registration",
          referenceNumber,
          ipAddress: ctx.ipAddress ?? null
        }
      });
      await this.prisma.qrCodeHistory.create({
        data: {
          bundleId: row.id,
          qrCodeNumber,
          action: "GENERATED",
          userId: ctx.userId,
          ipAddress: ctx.ipAddress ?? null
        }
      });
      await writeAudit(this.prisma, ctx, "REGISTER_BUNDLE", "InventoryBundle", row.id, undefined, bundleFromRow(row));
      created.push(bundleFromRow(row));
    }

    return created;
  }

  async moveBundlePieces(input: MoveBundleInput, ctx: AuditContext): Promise<{ source: InventoryBundle; destination?: InventoryBundle; transaction: StockTransaction }> {
    const source = await this.prisma.inventoryBundle.findUnique({
      where: { id: input.bundleId },
      include: { warehouse: true, storageLocation: true }
    });
    if (!source) throw new Error("Bundle not found.");
    if (input.expectedVersion && source.version !== input.expectedVersion) {
      throw new Error("Bundle was updated elsewhere. Refresh and try again.");
    }
    assertMoveQuantity(source.remainingPieces, input.quantity);

    const toWarehouse = await this.prisma.warehouse.findUnique({ where: { id: input.toWarehouseId } });
    if (!toWarehouse) throw new Error("Destination warehouse not found.");

    const sameWarehouse = source.warehouseId === input.toWarehouseId && (source.storageLocationId ?? null) === (input.toLocationId ?? null);
    if (sameWarehouse) throw new Error("Destination must differ from the current location.");

    const referenceNumber = buildReferenceNumber("TRF");
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedSource = await tx.inventoryBundle.update({
        where: { id: source.id },
        data: {
          remainingPieces: source.remainingPieces - input.quantity,
          status: source.remainingPieces - input.quantity === 0 ? "DEPLETED" : source.status,
          version: { increment: 1 }
        },
        include: { warehouse: true, storageLocation: true }
      });

      let destinationRow = null as any;
      if (input.quantity < source.remainingPieces || input.type === "Transfer") {
        const destBundleNumber = await nextBundleNumber(tx as unknown as PrismaClient, source.bundleNumber.split("-BND-")[0] || "LGM");
        const qrCodeNumber = await nextQrCodeNumber(tx as unknown as PrismaClient);
        const bundleId = crypto.randomUUID();
        const payload: QrBundlePayload = {
          v: 1,
          bundleId,
          bundleNumber: destBundleNumber,
          qrCodeNumber,
          productCatalogId: source.productCatalogId,
          color: source.color,
          size: source.size,
          quantity: input.quantity,
          warehouseCode: toWarehouse.code
        };
        const qrPayload = encodeQrPayload(payload);
        const qrImageUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 256 });
        destinationRow = await tx.inventoryBundle.create({
          data: {
            id: bundleId,
            bundleNumber: destBundleNumber,
            qrCodeNumber,
            qrPayload,
            qrImageUrl,
            productCatalogId: source.productCatalogId,
            variantId: source.variantId,
            productName: source.productName,
            style: source.style,
            fabric: source.fabric,
            color: source.color,
            size: source.size,
            piecesPerBundle: input.quantity,
            remainingPieces: input.quantity,
            unitCost: source.unitCost,
            sellingPrice: source.sellingPrice,
            warehouseId: toWarehouse.id,
            storageLocationId: input.toLocationId ?? null,
            parentBundleId: source.id,
            status: "ACTIVE"
          },
          include: { warehouse: true, storageLocation: true }
        });
        await tx.qrCodeHistory.create({
          data: {
            bundleId: destinationRow.id,
            qrCodeNumber,
            action: "SPLIT_CREATED",
            userId: ctx.userId,
            ipAddress: ctx.ipAddress ?? null
          }
        });
      } else {
        destinationRow = await tx.inventoryBundle.update({
          where: { id: source.id },
          data: {
            warehouseId: toWarehouse.id,
            storageLocationId: input.toLocationId ?? null,
            version: { increment: 1 }
          },
          include: { warehouse: true, storageLocation: true }
        });
      }

      const transaction = await tx.stockTransaction.create({
        data: {
          bundleId: source.id,
          type: transactionTypeToDb[input.type] as any,
          quantity: input.quantity,
          fromWarehouseId: source.warehouseId,
          fromLocationId: source.storageLocationId,
          toWarehouseId: toWarehouse.id,
          toLocationId: input.toLocationId ?? null,
          userId: ctx.userId,
          reason: input.reason ?? null,
          note: input.note ?? null,
          referenceNumber,
          sourceBundleId: source.id,
          destinationBundleId: destinationRow?.id ?? null,
          ipAddress: ctx.ipAddress ?? null
        },
        include: { bundle: true, user: true, fromWarehouse: true, toWarehouse: true }
      });

      return { updatedSource, destinationRow, transaction };
    });

    await writeAudit(this.prisma, ctx, "MOVE_INVENTORY", "InventoryBundle", source.id, bundleFromRow(source), {
      quantity: input.quantity,
      destinationBundleId: result.destinationRow?.id
    });

    return {
      source: bundleFromRow(result.updatedSource),
      destination: result.destinationRow ? bundleFromRow(result.destinationRow) : undefined,
      transaction: transactionFromRow(result.transaction)
    };
  }

  async splitBundle(input: SplitBundleInput, ctx: AuditContext) {
    const source = await this.prisma.inventoryBundle.findUnique({ where: { id: input.bundleId } });
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

  async listTransactions(bundleId?: string): Promise<StockTransaction[]> {
    const rows = await this.prisma.stockTransaction.findMany({
      where: bundleId ? { bundleId } : undefined,
      include: { bundle: true, user: true, fromWarehouse: true, toWarehouse: true },
      orderBy: { createdAt: "desc" },
      take: 300
    });
    return rows.map(transactionFromRow);
  }

  async reprintQr(bundleId: string, ctx: AuditContext): Promise<InventoryBundle> {
    const row = await this.prisma.inventoryBundle.findUnique({
      where: { id: bundleId },
      include: { warehouse: true, storageLocation: true }
    });
    if (!row) throw new Error("Bundle not found.");
    await this.prisma.qrCodeHistory.create({
      data: {
        bundleId: row.id,
        qrCodeNumber: row.qrCodeNumber,
        action: "REPRINTED",
        userId: ctx.userId,
        ipAddress: ctx.ipAddress ?? null
      }
    });
    return bundleFromRow(row);
  }

  async syncOfflineOperations(operations: OfflineSyncOperation[], ctx: AuditContext): Promise<OfflineSyncResult[]> {
    const results: OfflineSyncResult[] = [];
    for (const operation of operations) {
      try {
        if (operation.type === "register_bundle") {
          const data = await this.registerBundles(operation.payload as RegisterBundleInput, ctx);
          results.push({ clientId: operation.clientId, success: true, data });
        } else if (operation.type === "move_inventory") {
          const data = await this.moveBundlePieces(operation.payload as MoveBundleInput, ctx);
          results.push({ clientId: operation.clientId, success: true, data });
        } else if (operation.type === "split_bundle") {
          const data = await this.splitBundle(operation.payload as SplitBundleInput, ctx);
          results.push({ clientId: operation.clientId, success: true, data });
        } else {
          results.push({ clientId: operation.clientId, success: false, error: "Unsupported offline operation." });
        }
      } catch (error) {
        results.push({
          clientId: operation.clientId,
          success: false,
          error: error instanceof Error ? error.message : "Sync failed"
        });
      }
    }
    return results;
  }

  async ensureDefaults() {
    const warehouseCount = await this.prisma.warehouse.count();
    if (warehouseCount === 0) {
      const main = await this.prisma.warehouse.create({
        data: { name: "Main Warehouse", code: "MAIN", address: "Addis Ababa" }
      });
      await this.prisma.storageLocation.createMany({
        data: [
          { warehouseId: main.id, code: "A-01", name: "Shelf A-01" },
          { warehouseId: main.id, code: "A-02", name: "Shelf A-02" },
          { warehouseId: main.id, code: "B-01", name: "Shelf B-01" }
        ]
      });
    }
    const sizeCodes = ["XS", "S", "M", "L", "XL", "XXL"];
    for (const [index, code] of sizeCodes.entries()) {
      await this.prisma.sizeOption.upsert({
        where: { code },
        create: { code, sortOrder: index },
        update: { sortOrder: index }
      });
    }
    const colors = ["Black", "White", "Blue", "Red", "Green", "Grey"];
    for (const name of colors) {
      await this.prisma.colorOption.upsert({ where: { name }, create: { name }, update: {} });
    }
    const fabrics = ["Cotton", "Polyester", "Denim", "Linen", "Wool blend"];
    for (const name of fabrics) {
      await this.prisma.fabricType.upsert({ where: { name }, create: { name }, update: {} });
    }
  }
}
