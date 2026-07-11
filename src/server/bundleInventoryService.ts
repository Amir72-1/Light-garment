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
  decodeQrPayload,
  encodeQrPayload,
  isOutflowTransaction,
  isMixedRegistration,
  mixedBundleLineKey,
  normalizeMixedItems,
  normalizeRegisterVariants,
  requiresDestination,
  type QrBundlePayload
} from "../shared/bundleInventory.js";

type AuditContext = { userId: string; ipAddress?: string };

const bundleInclude = {
  warehouse: true,
  storageLocation: true,
  items: { orderBy: { color: "asc" as const } }
};

function itemFromRow(row: any) {
  return {
    id: row.id,
    bundleId: row.bundleId,
    variantId: row.variantId ?? undefined,
    color: row.color,
    colorCode: row.colorCode ?? undefined,
    size: row.size,
    quantity: row.quantity,
    remaining: row.remaining
  };
}

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
    colorCode: row.colorCode ?? undefined,
    size: row.size,
    isMixed: row.isMixed ?? false,
    items: row.items?.map(itemFromRow),
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

async function buildBundleQr(
  row: {
    id: string;
    bundleNumber: string;
    qrCodeNumber: string;
    productCatalogId: string;
    color: string;
    colorCode?: string;
    size: string;
    remainingPieces: number;
    warehouse: { code: string };
  },
  items?: Array<{ color: string; colorCode?: string; size: string; remaining: number }>
) {
  const isMixed = Boolean(items?.length);
  const payload: QrBundlePayload = {
    v: isMixed ? 2 : 1,
    bundleId: row.id,
    bundleNumber: row.bundleNumber,
    qrCodeNumber: row.qrCodeNumber,
    productCatalogId: row.productCatalogId,
    color: row.color,
    colorCode: row.colorCode,
    size: row.size,
    quantity: row.remainingPieces,
    warehouseCode: row.warehouse.code,
    items: isMixed
      ? items!.map((item) => ({ color: item.color, colorCode: item.colorCode, size: item.size, quantity: item.remaining }))
      : undefined
  };
  const qrPayload = encodeQrPayload(payload);
  const qrImageUrl = await QRCode.toDataURL(qrPayload, { margin: 1, width: 256 });
  return { qrPayload, qrImageUrl, payload };
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

async function ensureColor(prisma: PrismaClient, name: string, colorId?: string, colorCode?: string) {
  const trimmedName = name.trim();
  const normalizedCode = colorCode?.trim().toUpperCase();

  if (colorId) {
    const existing = await prisma.colorOption.findUnique({ where: { id: colorId } });
    if (existing) {
      if (!normalizedCode && !existing.code) throw new Error(`Color code is required for ${existing.name}.`);
      if (!normalizedCode) return existing;
      const codeTaken = await prisma.colorOption.findFirst({ where: { code: normalizedCode, NOT: { id: existing.id } } });
      if (codeTaken) throw new Error(`Color code ${normalizedCode} is already used by ${codeTaken.name}.`);
      return prisma.colorOption.update({ where: { id: existing.id }, data: { code: normalizedCode } });
    }
  }

  const byName = await prisma.colorOption.findUnique({ where: { name: trimmedName } });
  if (byName) {
    if (!normalizedCode && !byName.code) throw new Error(`Color code is required for ${trimmedName}.`);
    if (!normalizedCode) return byName;
    const codeTaken = await prisma.colorOption.findFirst({ where: { code: normalizedCode, NOT: { id: byName.id } } });
    if (codeTaken) throw new Error(`Color code ${normalizedCode} is already used by ${codeTaken.name}.`);
    return prisma.colorOption.update({ where: { id: byName.id }, data: { code: normalizedCode } });
  }

  if (!normalizedCode) throw new Error(`Color code is required for new color ${trimmedName}.`);
  const codeTaken = await prisma.colorOption.findUnique({ where: { code: normalizedCode } });
  if (codeTaken) throw new Error(`Color code ${normalizedCode} is already used by ${codeTaken.name}.`);

  return prisma.colorOption.create({
    data: { name: trimmedName, code: normalizedCode }
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
    return rows.map((row) => ({ id: row.id, name: row.name, code: row.code ?? undefined, hexCode: row.hexCode ?? undefined }));
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
          { colorCode: { contains: q, mode: "insensitive" } },
          { size: { contains: q, mode: "insensitive" } },
          { qrPayload: { contains: q, mode: "insensitive" } }
        ]
      },
      include: bundleInclude,
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return rows.map(bundleFromRow);
  }

  async listBundles(): Promise<InventoryBundle[]> {
    const rows = await this.prisma.inventoryBundle.findMany({
      include: bundleInclude,
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
      include: bundleInclude
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

  private async prepareMixedItemVariants(
    catalogId: string,
    prefix: string,
    input: RegisterBundleInput,
    mixedItems: RegisterBundleMixedItemInput[]
  ) {
    const prepared: Array<{
      color: Awaited<ReturnType<typeof ensureColor>>;
      size: Awaited<ReturnType<typeof ensureSize>>;
      variant: { id: string };
      pieces: number;
    }> = [];

    for (const item of mixedItems) {
      if (item.pieces < 1) throw new Error("Each color/size line must have at least 1 piece.");
      const color = await ensureColor(this.prisma, item.color, item.colorId, item.colorCode);
      const size = await ensureSize(this.prisma, item.size, item.sizeId);
      if (!color.code) throw new Error(`Color code is required for ${color.name}.`);
      const sku = `${prefix}-${color.code}-${size.code}`;
      const variant = await this.prisma.productVariant.upsert({
        where: { productCatalogId_colorId_sizeId: { productCatalogId: catalogId, colorId: color.id, sizeId: size.id } },
        create: {
          productCatalogId: catalogId,
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
      prepared.push({ color, size, variant, pieces: item.pieces });
    }

    const seen = new Set<string>();
    for (const item of prepared) {
      const key = mixedBundleLineKey(item.color.name, item.size.code);
      if (seen.has(key)) throw new Error(`Duplicate color/size line: ${item.color.name} ${item.size.code}.`);
      seen.add(key);
    }

    return prepared;
  }

  async registerMixedBundles(input: RegisterBundleInput, ctx: AuditContext): Promise<InventoryBundle[]> {
    const mixedItems = normalizeMixedItems(input);
    const bundleQuantity = input.bundleQuantity ?? 1;
    if (bundleQuantity < 1) throw new Error("Bundle quantity must be at least 1.");

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw new Error("Warehouse not found.");

    const fabric = await ensureFabric(this.prisma, input.fabric, input.fabricId);
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

    const preparedItems = await this.prepareMixedItemVariants(catalog.id, prefix, input, mixedItems);
    const piecesPerBundle = preparedItems.reduce((sum, item) => sum + item.pieces, 0);
    const created: InventoryBundle[] = [];

    for (let index = 0; index < bundleQuantity; index += 1) {
      const bundleNumber = await nextBundleNumber(this.prisma, prefix);
      const qrCodeNumber = await nextQrCodeNumber(this.prisma);
      const bundleId = crypto.randomUUID();

      const row = await this.prisma.inventoryBundle.create({
        data: {
          id: bundleId,
          bundleNumber,
          qrCodeNumber,
          qrPayload: "",
          qrImageUrl: null,
          productCatalogId: catalog.id,
          productName: catalog.name,
          style: catalog.style,
          fabric: fabric?.name ?? input.fabric ?? null,
          color: "Mixed",
          colorCode: null,
          size: "Mixed",
          isMixed: true,
          piecesPerBundle,
          remainingPieces: piecesPerBundle,
          unitCost: input.unitCost,
          sellingPrice: input.sellingPrice,
          warehouseId: warehouse.id,
          storageLocationId: input.storageLocationId ?? null,
          status: "ACTIVE",
          items: {
            create: preparedItems.map((item) => ({
              variantId: item.variant.id,
              color: item.color.name,
              colorCode: item.color.code,
              size: item.size.code,
              quantity: item.pieces,
              remaining: item.pieces
            }))
          }
        },
        include: bundleInclude
      });

      const { qrPayload, qrImageUrl } = await buildBundleQr(
        {
          id: row.id,
          bundleNumber: row.bundleNumber,
          qrCodeNumber: row.qrCodeNumber,
          productCatalogId: row.productCatalogId,
          color: row.color,
          size: row.size,
          remainingPieces: row.remainingPieces,
          warehouse
        },
        row.items.map((item) => ({
          color: item.color,
          colorCode: item.colorCode ?? undefined,
          size: item.size,
          remaining: item.remaining
        }))
      );

      const updated = await this.prisma.inventoryBundle.update({
        where: { id: row.id },
        data: { qrPayload, qrImageUrl },
        include: bundleInclude
      });

      const referenceNumber = buildReferenceNumber("RCV");
      await this.prisma.stockTransaction.create({
        data: {
          bundleId: updated.id,
          type: "RECEIVING",
          quantity: piecesPerBundle,
          toWarehouseId: warehouse.id,
          toLocationId: input.storageLocationId ?? null,
          userId: ctx.userId,
          reason: "Mixed assortment bundle registration",
          referenceNumber,
          ipAddress: ctx.ipAddress ?? null
        }
      });
      await this.prisma.qrCodeHistory.create({
        data: {
          bundleId: updated.id,
          qrCodeNumber,
          action: "GENERATED",
          userId: ctx.userId,
          ipAddress: ctx.ipAddress ?? null
        }
      });
      await writeAudit(this.prisma, ctx, "REGISTER_BUNDLE", "InventoryBundle", updated.id, undefined, bundleFromRow(updated));
      created.push(bundleFromRow(updated));
    }

    return created;
  }

  async registerBundles(input: RegisterBundleInput, ctx: AuditContext): Promise<InventoryBundle[]> {
    if (isMixedRegistration(input)) {
      return this.registerMixedBundles(input, ctx);
    }
    const variants = normalizeRegisterVariants(input);
    for (const variant of variants) {
      if (variant.bundleQuantity < 1) throw new Error("Bundle quantity must be at least 1 for every color/size.");
      if (variant.piecesPerBundle < 1) throw new Error("Pieces per bundle must be at least 1 for every color/size.");
    }

    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: input.warehouseId } });
    if (!warehouse) throw new Error("Warehouse not found.");

    const fabric = await ensureFabric(this.prisma, input.fabric, input.fabricId);
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

    const created: InventoryBundle[] = [];
    for (const variantInput of variants) {
      const color = await ensureColor(this.prisma, variantInput.color, variantInput.colorId, variantInput.colorCode);
      const size = await ensureSize(this.prisma, variantInput.size, variantInput.sizeId);
      if (!color.code) throw new Error(`Color code is required for ${color.name}.`);
      const colorCode = color.code;
      const sku = `${prefix}-${colorCode}-${size.code}`;
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

      for (let index = 0; index < variantInput.bundleQuantity; index += 1) {
        const bundleNumber = await nextBundleNumber(this.prisma, prefix);
        const qrCodeNumber = await nextQrCodeNumber(this.prisma);
        const bundleId = crypto.randomUUID();
        const { qrPayload, qrImageUrl } = await buildBundleQr({
          id: bundleId,
          bundleNumber,
          qrCodeNumber,
          productCatalogId: catalog.id,
          color: color.name,
          colorCode,
          size: size.code,
          remainingPieces: variantInput.piecesPerBundle,
          warehouse
        });

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
            colorCode,
            size: size.code,
            piecesPerBundle: variantInput.piecesPerBundle,
            remainingPieces: variantInput.piecesPerBundle,
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
            quantity: variantInput.piecesPerBundle,
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
    }

    return created;
  }

  async createColor(input: CreateColorInput): Promise<ColorOption> {
    const row = await ensureColor(this.prisma, input.name, undefined, input.code);
    return { id: row.id, name: row.name, code: row.code ?? undefined, hexCode: row.hexCode ?? undefined };
  }

  async deleteBundle(bundleId: string, ctx: AuditContext): Promise<void> {
    const row = await this.prisma.inventoryBundle.findUnique({
      where: { id: bundleId },
      include: { warehouse: true, storageLocation: true, childBundles: true }
    });
    if (!row) throw new Error("Bundle not found.");

    const activeChildren = row.childBundles.filter((child) => child.remainingPieces > 0 && child.status !== "DEPLETED");
    if (activeChildren.length > 0) {
      throw new Error("Cannot delete bundle while active child bundles still hold inventory.");
    }

    const snapshot = bundleFromRow(row);
    await writeAudit(this.prisma, ctx, "DELETE_BUNDLE", "InventoryBundle", row.id, snapshot, undefined);
    await this.prisma.inventoryBundle.delete({ where: { id: bundleId } });
  }

  async moveBundlePieces(input: MoveBundleInput, ctx: AuditContext): Promise<{ source: InventoryBundle; destination?: InventoryBundle; transaction: StockTransaction }> {
    const source = await this.prisma.inventoryBundle.findUnique({
      where: { id: input.bundleId },
      include: bundleInclude
    });
    if (!source) throw new Error("Bundle not found.");
    if (input.expectedVersion && source.version !== input.expectedVersion) {
      throw new Error("Bundle was updated elsewhere. Refresh and try again.");
    }

    const wholeBundleTransfer = source.isMixed
      && input.type === "Transfer"
      && input.quantity === source.remainingPieces
      && requiresDestination(input.type);

    if (source.isMixed && !wholeBundleTransfer) {
      if (!input.itemColor || !input.itemSize) {
        throw new Error("Select a color and size line for mixed assortment bundle moves.");
      }
      const line = source.items.find(
        (item) => mixedBundleLineKey(item.color, item.size) === mixedBundleLineKey(input.itemColor!, input.itemSize!)
      );
      if (!line) throw new Error(`No ${input.itemColor} ${input.itemSize} line found in this bundle.`);
      assertMoveQuantity(line.remaining, input.quantity);
    } else {
      assertMoveQuantity(source.remainingPieces, input.quantity);
    }

    const outflow = isOutflowTransaction(input.type);
    let toWarehouse = null as Awaited<ReturnType<typeof this.prisma.warehouse.findUnique>>;

    if (requiresDestination(input.type)) {
      if (!input.toWarehouseId) throw new Error("Destination warehouse is required for this transaction.");
      toWarehouse = await this.prisma.warehouse.findUnique({ where: { id: input.toWarehouseId } });
      if (!toWarehouse) throw new Error("Destination warehouse not found.");
      const sameWarehouse = source.warehouseId === input.toWarehouseId && (source.storageLocationId ?? null) === (input.toLocationId ?? null);
      if (sameWarehouse && !wholeBundleTransfer) throw new Error("Destination must differ from the current location.");
    }

    const referenceNumber = buildReferenceNumber(outflow ? "OUT" : "TRF");
    const newRemaining = source.remainingPieces - input.quantity;
    const updatedItems = source.items.map((item) => {
      if (!source.isMixed || wholeBundleTransfer) return item;
      if (mixedBundleLineKey(item.color, item.size) !== mixedBundleLineKey(input.itemColor!, input.itemSize!)) return item;
      return { ...item, remaining: item.remaining - input.quantity };
    });

    const movedLine = source.isMixed && !wholeBundleTransfer
      ? updatedItems.find((item) => mixedBundleLineKey(item.color, item.size) === mixedBundleLineKey(input.itemColor!, input.itemSize!))
      : null;

    const sourceQr = await buildBundleQr(
      {
        id: source.id,
        bundleNumber: source.bundleNumber,
        qrCodeNumber: source.qrCodeNumber,
        productCatalogId: source.productCatalogId,
        color: source.color,
        colorCode: source.colorCode ?? undefined,
        size: source.size,
        remainingPieces: newRemaining,
        warehouse: wholeBundleTransfer && toWarehouse ? toWarehouse : source.warehouse
      },
      source.isMixed
        ? updatedItems.map((item) => ({
            color: item.color,
            colorCode: item.colorCode ?? undefined,
            size: item.size,
            remaining: item.remaining
          }))
        : undefined
    );

    const shouldCreateDestination = !outflow && toWarehouse && !wholeBundleTransfer && (
      input.type === "Transfer" || input.type === "Split" || input.type === "Return" || input.quantity < source.remainingPieces
    );

    const result = await this.prisma.$transaction(async (tx) => {
      if (source.isMixed && !wholeBundleTransfer) {
        await tx.bundleItem.update({
          where: { id: movedLine!.id },
          data: { remaining: movedLine!.remaining }
        });
      }

      const updatedSource = await tx.inventoryBundle.update({
        where: { id: source.id },
        data: {
          remainingPieces: newRemaining,
          status: newRemaining === 0 ? "DEPLETED" : source.status,
          qrPayload: sourceQr.qrPayload,
          qrImageUrl: sourceQr.qrImageUrl,
          version: { increment: 1 },
          ...(wholeBundleTransfer && toWarehouse
            ? {
                warehouseId: toWarehouse.id,
                storageLocationId: input.toLocationId ?? null
              }
            : {})
        },
        include: bundleInclude
      });

      let destinationRow = null as any;
      if (shouldCreateDestination && toWarehouse) {
        const destBundleNumber = await nextBundleNumber(tx as unknown as PrismaClient, source.bundleNumber.split("-BND-")[0] || "LGM");
        const qrCodeNumber = await nextQrCodeNumber(tx as unknown as PrismaClient);
        const bundleId = crypto.randomUUID();
        const destColor = movedLine?.color ?? source.color;
        const destColorCode = movedLine?.colorCode ?? source.colorCode ?? undefined;
        const destSize = movedLine?.size ?? source.size;
        const destVariantId = movedLine?.variantId ?? source.variantId;
        const destinationQr = await buildBundleQr({
          id: bundleId,
          bundleNumber: destBundleNumber,
          qrCodeNumber,
          productCatalogId: source.productCatalogId,
          color: destColor,
          colorCode: destColorCode,
          size: destSize,
          remainingPieces: input.quantity,
          warehouse: toWarehouse
        });
        destinationRow = await tx.inventoryBundle.create({
          data: {
            id: bundleId,
            bundleNumber: destBundleNumber,
            qrCodeNumber,
            qrPayload: destinationQr.qrPayload,
            qrImageUrl: destinationQr.qrImageUrl,
            productCatalogId: source.productCatalogId,
            variantId: destVariantId,
            productName: source.productName,
            style: source.style,
            fabric: source.fabric,
            color: destColor,
            colorCode: destColorCode,
            size: destSize,
            isMixed: false,
            piecesPerBundle: input.quantity,
            remainingPieces: input.quantity,
            unitCost: source.unitCost,
            sellingPrice: source.sellingPrice,
            warehouseId: toWarehouse.id,
            storageLocationId: input.toLocationId ?? null,
            parentBundleId: source.id,
            status: "ACTIVE"
          },
          include: bundleInclude
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
      }

      const transaction = await tx.stockTransaction.create({
        data: {
          bundleId: source.id,
          type: transactionTypeToDb[input.type] as any,
          quantity: input.quantity,
          itemColor: movedLine?.color ?? input.itemColor ?? null,
          itemSize: movedLine?.size ?? input.itemSize ?? null,
          fromWarehouseId: source.warehouseId,
          fromLocationId: source.storageLocationId,
          toWarehouseId: toWarehouse?.id ?? null,
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
      type: input.type,
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
      include: bundleInclude
    });
    if (!row) throw new Error("Bundle not found.");
    const refreshed = await buildBundleQr(
      {
        id: row.id,
        bundleNumber: row.bundleNumber,
        qrCodeNumber: row.qrCodeNumber,
        productCatalogId: row.productCatalogId,
        color: row.color,
        colorCode: row.colorCode ?? undefined,
        size: row.size,
        remainingPieces: row.remainingPieces,
        warehouse: row.warehouse
      },
      row.isMixed
        ? row.items.map((item) => ({
            color: item.color,
            colorCode: item.colorCode ?? undefined,
            size: item.size,
            remaining: item.remaining
          }))
        : undefined
    );
    const updated = await this.prisma.inventoryBundle.update({
      where: { id: bundleId },
      data: { qrPayload: refreshed.qrPayload, qrImageUrl: refreshed.qrImageUrl },
      include: bundleInclude
    });
    await this.prisma.qrCodeHistory.create({
      data: {
        bundleId: row.id,
        qrCodeNumber: row.qrCodeNumber,
        action: "REPRINTED",
        userId: ctx.userId,
        ipAddress: ctx.ipAddress ?? null
      }
    });
    return bundleFromRow(updated);
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
    const colors = [
      { name: "Black", code: "BLK" },
      { name: "White", code: "WHT" },
      { name: "Blue", code: "BLU" },
      { name: "Red", code: "RED" },
      { name: "Green", code: "GRN" },
      { name: "Grey", code: "GRY" }
    ];
    for (const color of colors) {
      await this.prisma.colorOption.upsert({
        where: { name: color.name },
        create: color,
        update: { code: color.code }
      });
    }
    const fabrics = ["Cotton", "Polyester", "Denim", "Linen", "Wool blend"];
    for (const name of fabrics) {
      await this.prisma.fabricType.upsert({ where: { name }, create: { name }, update: {} });
    }
  }
}
