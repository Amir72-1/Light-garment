import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  PackagePlus,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Search,
  Split,
  Trash2,
  Truck,
  Plus,
  Wifi,
  WifiOff
} from "lucide-react";
import { api } from "./api";
import { BundleQrScanner, primeBundleCamera, type BundleQrScannerHandle } from "./bundleQrScanner";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "./components/ui";
import {
  clearFailedOperations,
  enqueueOperation,
  listQueuedOperations,
  markQueuedOperationFailed,
  removeQueuedOperation,
  type QueuedOperation
} from "./offlineStore";
import type {
  BundleScanResult,
  InventoryBundle,
  MoveBundleInput,
  RegisterBundleInput,
  RegisterBundleMixedItemInput,
  RegisterBundleVariantInput,
  StockTransaction,
  StockTransactionType
} from "../shared/bundleInventory.js";
import { formatMixedBundleSummary, isOutflowTransaction, requiresDestination } from "../shared/bundleInventory.js";

function currency(value: number) {
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", maximumFractionDigits: 0 }).format(value);
}

function clientId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readImages(files: FileList | null) {
  if (!files?.length) return Promise.resolve<string[]>([]);
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}

function colorLabel(name: string, code?: string) {
  return code ? `${name} (${code})` : name;
}

function bundleVariantLabel(bundle: InventoryBundle) {
  if (bundle.isMixed) return formatMixedBundleSummary(bundle.items);
  return `${colorLabel(bundle.color, bundle.colorCode)} · ${bundle.size} · ${bundle.remainingPieces} pcs`;
}

type VariantRow = {
  key: string;
  colorName: string;
  colorCode: string;
  size: string;
  bundleQuantity: number;
  piecesPerBundle: number;
  isNewColor: boolean;
};

export function printBundleLabels(bundles: InventoryBundle[]) {
  const doc = new jsPDF({ unit: "mm", format: [80, 50] });
  bundles.forEach((bundle, index) => {
    if (index > 0) doc.addPage([80, 50]);
    if (bundle.qrImageUrl) doc.addImage(bundle.qrImageUrl, "PNG", 4, 4, 22, 22);
    doc.setFontSize(8);
    doc.text(bundle.qrCodeNumber, 28, 8);
    doc.setFontSize(10);
    doc.text(bundle.productName.slice(0, 28), 28, 14);
    doc.setFontSize(8);
    doc.text(bundleVariantLabel(bundle), 28, 20);
    doc.text(bundle.warehouseName, 28, 26);
    doc.text(bundle.bundleNumber, 4, 46);
  });
  doc.save(`bundle-labels-${Date.now()}.pdf`);
}

function printBundleLabelWindow(bundles: InventoryBundle[]) {
  const html = bundles
    .map(
      (bundle) => `
      <section style="page-break-after:always;width:80mm;padding:8px;font-family:sans-serif">
        <div style="display:flex;gap:12px;align-items:flex-start">
          ${bundle.qrImageUrl ? `<img src="${bundle.qrImageUrl}" width="96" height="96" alt="QR" />` : ""}
          <div>
            <div style="font-size:11px;color:#555">${bundle.qrCodeNumber}</div>
            <div style="font-size:16px;font-weight:700">${bundle.productName}</div>
            <div style="font-size:12px">${bundleVariantLabel(bundle)}</div>
            <div style="font-size:12px">${bundle.warehouseName}</div>
          </div>
        </div>
        <div style="margin-top:8px;font-size:11px">${bundle.bundleNumber}</div>
      </section>`
    )
    .join("");
  const popup = window.open("", "_blank", "width=420,height=640");
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><title>QR Labels</title></head><body>${html}<script>window.print();</script></body></html>`);
  popup.document.close();
}

export function BundleInventoryPanel({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<BundleQrScannerHandle>(null);
  const [tab, setTab] = useState<"scan" | "register" | "bundles" | "history">("scan");
  const [search, setSearch] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanResult, setScanResult] = useState<BundleScanResult | null>(null);
  const [scanStartToken, setScanStartToken] = useState(0);
  const [scanLookupMessage, setScanLookupMessage] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<InventoryBundle | null>(null);
  const [moveQty, setMoveQty] = useState(1);
  const [moveWarehouseId, setMoveWarehouseId] = useState("");
  const [moveLocationId, setMoveLocationId] = useState("");
  const [moveType, setMoveType] = useState<StockTransactionType>("Transfer");
  const [moveReason, setMoveReason] = useState("");
  const [splitQty, setSplitQty] = useState(1);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [queued, setQueued] = useState<QueuedOperation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [registerImages, setRegisterImages] = useState<string[]>([]);
  const [lastRegistered, setLastRegistered] = useState<InventoryBundle[]>([]);
  const [selectedBundleIds, setSelectedBundleIds] = useState<Set<string>>(new Set());
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [registrationMode, setRegistrationMode] = useState<"separate" | "mixed">("separate");
  const [mixedBundleQuantity, setMixedBundleQuantity] = useState(1);
  const [moveItemColor, setMoveItemColor] = useState("");
  const [moveItemSize, setMoveItemSize] = useState("");

  const metadata = useQuery({ queryKey: ["bundle-metadata"], queryFn: () => api.bundleMetadata(token) });
  const locations = useQuery({
    queryKey: ["bundle-locations", selectedWarehouseId || moveWarehouseId],
    queryFn: () => api.bundleLocations(token, selectedWarehouseId || moveWarehouseId),
    enabled: Boolean(selectedWarehouseId || moveWarehouseId)
  });
  const bundles = useQuery({
    queryKey: ["bundles", search],
    queryFn: () => (search.trim() ? api.searchBundles(token, search.trim()) : api.bundles(token))
  });
  const transactions = useQuery({ queryKey: ["bundle-transactions"], queryFn: () => api.bundleTransactions(token) });

  const refreshQueued = useCallback(async () => {
    setQueued(await listQueuedOperations());
  }, []);

  const notify = useCallback((type: "success" | "error", message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const invalidateBundleQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["bundles"] });
    queryClient.invalidateQueries({ queryKey: ["bundle-transactions"] });
    queryClient.invalidateQueries({ queryKey: ["bundle-metadata"] });
  }, [queryClient]);

  const syncQueued = useCallback(async () => {
    const pending = (await listQueuedOperations()).filter((item) => item.status === "pending");
    if (!pending.length || !navigator.onLine) return;
    setSyncing(true);
    try {
      const results = await api.syncBundles(
        token,
        pending.map(({ clientId: id, type, payload, clientTimestamp }) => ({ clientId: id, type, payload, clientTimestamp }))
      );
      for (const result of results) {
        if (result.success) {
          await removeQueuedOperation(result.clientId);
        } else {
          await markQueuedOperationFailed(result.clientId, result.error || "Sync failed");
        }
      }
      await refreshQueued();
      invalidateBundleQueries();
      const failed = results.filter((item) => !item.success).length;
      const synced = results.filter((item) => item.success).length;
      if (synced) notify("success", `Synced ${synced} offline change${synced === 1 ? "" : "s"}.`);
      if (failed) notify("error", `${failed} offline change${failed === 1 ? "" : "s"} failed to sync.`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "Offline sync failed");
    } finally {
      setSyncing(false);
    }
  }, [token, refreshQueued, invalidateBundleQueries, notify]);

  useEffect(() => {
    refreshQueued();
    const onOnline = () => {
      setOnline(true);
      void syncQueued();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshQueued, syncQueued]);

  useEffect(() => {
    if (!metadata.data?.warehouses.length) return;
    if (!selectedWarehouseId) setSelectedWarehouseId(metadata.data.warehouses[0].id);
    if (!moveWarehouseId) setMoveWarehouseId(metadata.data.warehouses[0].id);
  }, [metadata.data, selectedWarehouseId, moveWarehouseId]);

  useEffect(() => {
    if (!metadata.data || variantRows.length) return;
    const firstColor = metadata.data.colors[0];
    const firstSize = metadata.data.sizes[0];
    if (!firstColor || !firstSize) return;
    setVariantRows([{
      key: "row-1",
      colorName: firstColor.name,
      colorCode: firstColor.code ?? "",
      size: firstSize.code,
      bundleQuantity: 1,
      piecesPerBundle: 25,
      isNewColor: false
    }]);
  }, [metadata.data, variantRows.length]);

  const scanMutation = useMutation({
    mutationFn: (code: string) => api.scanBundle(token, code),
    onSuccess: (result) => {
      setScanResult(result);
      setScanLookupMessage(null);
      setSelectedBundle(result.bundle);
      setMoveItemColor(result.bundle.isMixed ? result.bundle.items?.[0]?.color ?? "" : "");
      setMoveItemSize(result.bundle.isMixed ? result.bundle.items?.[0]?.size ?? "" : "");
      notify("success", `Scanned ${result.bundleNumber}`);
    },
    onError: () => {
      setScanResult(null);
      setScanLookupMessage("Bundle not found. Try again.");
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (input: RegisterBundleInput) => {
      if (!navigator.onLine) {
        const operation = {
          clientId: clientId(),
          type: "register_bundle" as const,
          payload: input,
          clientTimestamp: new Date().toISOString()
        };
        await enqueueOperation(operation);
        await refreshQueued();
        return { offline: true as const, operation };
      }
      return { offline: false as const, bundles: await api.registerBundles(token, input) };
    },
    onSuccess: (result) => {
      if (result.offline) {
        notify("success", "Bundle registration saved offline. It will sync when you reconnect.");
      } else {
        setLastRegistered(result.bundles);
        notify("success", `Registered ${result.bundles.length} bundle${result.bundles.length === 1 ? "" : "s"}.`);
        invalidateBundleQueries();
      }
    },
    onError: (error: Error) => notify("error", error.message)
  });

  const moveMutation = useMutation({
    mutationFn: async (input: MoveBundleInput) => {
      if (!navigator.onLine) {
        const operation = {
          clientId: clientId(),
          type: "move_inventory" as const,
          payload: input,
          clientTimestamp: new Date().toISOString()
        };
        await enqueueOperation(operation);
        await refreshQueued();
        return { offline: true as const };
      }
      return { offline: false as const, result: await api.moveBundle(token, input) };
    },
    onSuccess: (result) => {
      if (result.offline) {
        notify("success", "Move saved offline. It will sync when you reconnect.");
      } else {
        setSelectedBundle(result.result.source);
        setScanResult({
          bundle: result.result.source,
          productName: result.result.source.productName,
          style: result.result.source.style,
          color: result.result.source.color,
          colorCode: result.result.source.colorCode,
          size: result.result.source.size,
          isMixed: result.result.source.isMixed,
          items: result.result.source.items,
          bundleNumber: result.result.source.bundleNumber,
          remainingPieces: result.result.source.remainingPieces,
          warehouse: result.result.source.warehouseName,
          shelfLocation: result.result.source.storageLocationName,
          status: result.result.source.status
        });
        setMoveItemColor(result.result.source.isMixed ? result.result.source.items?.[0]?.color ?? "" : "");
        setMoveItemSize(result.result.source.isMixed ? result.result.source.items?.[0]?.size ?? "" : "");
        setMoveQty(Math.min(moveQty, result.result.source.remainingPieces || 1));
        notify("success", `Moved ${result.result.transaction.quantity} pieces. QR updated.`);
        invalidateBundleQueries();
        queryClient.invalidateQueries({ queryKey: ["bundle-transactions"] });
      }
    },
    onError: (error: Error) => notify("error", error.message)
  });

  const reprintMutation = useMutation({
    mutationFn: (bundleId: string) => api.reprintBundleQr(token, bundleId),
    onSuccess: (bundle) => {
      setSelectedBundle(bundle);
      setScanResult((current) =>
        current?.bundle.id === bundle.id
          ? {
              bundle,
              productName: bundle.productName,
              style: bundle.style,
              color: bundle.color,
              colorCode: bundle.colorCode,
              size: bundle.size,
              bundleNumber: bundle.bundleNumber,
              remainingPieces: bundle.remainingPieces,
              warehouse: bundle.warehouseName,
              shelfLocation: bundle.storageLocationName,
              status: bundle.status
            }
          : current
      );
      notify("success", "QR code refreshed with current bundle data.");
      invalidateBundleQueries();
    },
    onError: (error: Error) => notify("error", error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (bundleId: string) => api.deleteBundle(token, bundleId),
    onSuccess: (_result, bundleId) => {
      if (selectedBundle?.id === bundleId) {
        setSelectedBundle(null);
        setScanResult(null);
      }
      notify("success", "Bundle deleted.");
      invalidateBundleQueries();
    },
    onError: (error: Error) => notify("error", error.message)
  });

  const handleDeleteBundle = useCallback((bundle: InventoryBundle) => {
    if (!window.confirm(`Delete bundle ${bundle.bundleNumber}? This cannot be undone.`)) return;
    deleteMutation.mutate(bundle.id);
  }, [deleteMutation]);

  const splitMutation = useMutation({
    mutationFn: async (input: Parameters<typeof api.splitBundle>[1]) => {
      if (!navigator.onLine) {
        const operation = {
          clientId: clientId(),
          type: "split_bundle" as const,
          payload: input,
          clientTimestamp: new Date().toISOString()
        };
        await enqueueOperation(operation);
        await refreshQueued();
        return { offline: true as const };
      }
      return { offline: false as const, result: await api.splitBundle(token, input) };
    },
    onSuccess: (result) => {
      if (result.offline) {
        notify("success", "Split saved offline. It will sync when you reconnect.");
      } else {
        setSelectedBundle(result.result.source);
        notify("success", `Split ${result.result.transaction.quantity} pieces into a new bundle.`);
        invalidateBundleQueries();
      }
    },
    onError: (error: Error) => notify("error", error.message)
  });

  const handleScanSubmit = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setScanCode("");
      scanMutation.mutate(trimmed);
    },
    [scanMutation]
  );

  const requestCameraScan = useCallback(() => {
    setScanStartToken((value) => value + 1);
    void primeBundleCamera();
  }, []);

  const openScanTab = useCallback(() => {
    setTab("scan");
  }, []);

  useEffect(() => {
    if (tab !== "scan") return;
    requestCameraScan();
  }, [tab, requestCameraScan]);

  const pendingCount = queued.filter((item) => item.status === "pending").length;
  const failedCount = queued.filter((item) => item.status === "failed").length;

  if (metadata.isError) {
    return (
      <Card>
        <h2 className="text-xl font-black">QR bundle inventory unavailable</h2>
        <p className="mt-2 text-sm text-rose-600">{metadata.error instanceof Error ? metadata.error.message : "Could not load bundle inventory."}</p>
        <p className="mt-2 text-sm text-slate-500">If you just deployed, wait for Render to finish and hard-refresh the page (Ctrl+Shift+R).</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {toast && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${toast.type === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}

      <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black">QR bundle inventory</h2>
          <p className="text-sm text-slate-500">Register bundles, scan QR codes, transfer pieces, and sync offline changes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={online ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
            {online ? <Wifi className="mr-1 inline h-3.5 w-3.5" /> : <WifiOff className="mr-1 inline h-3.5 w-3.5" />}
            {online ? "Online" : "Offline"}
          </Badge>
          {pendingCount > 0 && <Badge className="bg-sky-100 text-sky-800">{pendingCount} queued</Badge>}
          {failedCount > 0 && <Badge className="bg-rose-100 text-rose-800">{failedCount} failed</Badge>}
          <Button variant="secondary" onClick={() => void syncQueued()} disabled={syncing || !online || pendingCount === 0}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync now
          </Button>
          {failedCount > 0 && (
            <Button variant="ghost" onClick={() => void clearFailedOperations().then(refreshQueued)}>
              Clear failed
            </Button>
          )}
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {(["scan", "register", "bundles", "history"] as const).map((key) => (
          <Button
            key={key}
            variant={tab === key ? "primary" : "secondary"}
            onClick={() => {
              if (key === "scan") {
                if (tab === "scan") requestCameraScan();
                else openScanTab();
                return;
              }
              void scannerRef.current?.stop();
              setTab(key);
            }}
          >
            {key === "scan" && <ScanLine className="h-4 w-4" />}
            {key === "register" && <PackagePlus className="h-4 w-4" />}
            {key === "bundles" && <QrCode className="h-4 w-4" />}
            {key === "history" && <Truck className="h-4 w-4" />}
            {key.charAt(0).toUpperCase() + key.slice(1)}
          </Button>
        ))}
      </div>

      {tab === "scan" && (
        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <Card className="bundle-scan-card">
            <div className="bundle-scan-camera">
              <BundleQrScanner
                ref={scannerRef}
                active={tab === "scan"}
                startToken={scanStartToken}
                paused={scanMutation.isPending}
                onScan={handleScanSubmit}
              />
            </div>

            {scanMutation.isPending && (
              <p className="bundle-scan-status">
                <Loader2 className="h-4 w-4 animate-spin" />
                Looking up bundle...
              </p>
            )}

            {scanLookupMessage && !scanMutation.isPending && (
              <p className="bundle-scan-status">{scanLookupMessage}</p>
            )}

            <details className="bundle-scan-manual">
              <summary>Enter code manually</summary>
              <form
                className="mt-3 flex flex-col gap-3 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleScanSubmit(scanCode);
                }}
              >
                <Input
                  ref={scanInputRef}
                  value={scanCode}
                  onChange={(event) => setScanCode(event.target.value)}
                  placeholder="Paste QR payload or bundle number"
                  className="text-lg"
                />
                <Button type="submit" disabled={scanMutation.isPending}>
                  {scanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                  Lookup
                </Button>
              </form>
            </details>
            {scanResult && (
              <div className="mt-6 grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 md:grid-cols-[120px_1fr]">
                {scanResult.bundle.qrImageUrl && <img src={scanResult.bundle.qrImageUrl} alt="QR" className="h-28 w-28 rounded-xl bg-white p-2" />}
                <div className="grid gap-1 text-sm">
                  <p className="text-lg font-bold">{scanResult.productName}</p>
                  <p>{scanResult.style}</p>
                  {scanResult.isMixed && scanResult.items?.length ? (
                    <div className="grid gap-1">
                      <p className="font-medium">Mixed assortment</p>
                      {scanResult.items.map((item) => (
                        <p key={`${item.color}-${item.size}`}>
                          {colorLabel(item.color, item.colorCode)} · {item.size} · {item.remaining} pcs
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p>{colorLabel(scanResult.color, scanResult.colorCode)} · {scanResult.size}</p>
                  )}
                  <p>Bundle {scanResult.bundleNumber}</p>
                  <p>{scanResult.remainingPieces} pieces remaining</p>
                  <p>{scanResult.warehouse}{scanResult.shelfLocation ? ` · ${scanResult.shelfLocation}` : ""}</p>
                  <Badge>{scanResult.status}</Badge>
                </div>
              </div>
            )}
          </Card>

          {selectedBundle && (
            <Card>
              <h3 className="text-lg font-bold">Move / split pieces</h3>
              <p className="mt-1 text-sm text-slate-500">Available: {selectedBundle.remainingPieces} pieces</p>
              <div className="mt-4 grid gap-3">
                {selectedBundle.isMixed && selectedBundle.items?.length ? (
                  <Field label="Color / size line">
                    <Select
                      value={`${moveItemColor}::${moveItemSize}`}
                      onChange={(event) => {
                        const [color, size] = event.target.value.split("::");
                        setMoveItemColor(color);
                        setMoveItemSize(size);
                        const line = selectedBundle.items?.find((item) => item.color === color && item.size === size);
                        setMoveQty(Math.min(moveQty, line?.remaining ?? 1));
                      }}
                    >
                      {selectedBundle.items.map((item) => (
                        <option key={`${item.color}-${item.size}`} value={`${item.color}::${item.size}`}>
                          {colorLabel(item.color, item.colorCode)} · {item.size} · {item.remaining} available
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : null}
                <Field label="Quantity">
                  <Input
                    type="number"
                    min={1}
                    max={
                      selectedBundle.isMixed
                        ? selectedBundle.items?.find((item) => item.color === moveItemColor && item.size === moveItemSize)?.remaining ?? selectedBundle.remainingPieces
                        : selectedBundle.remainingPieces
                    }
                    value={moveQty}
                    onChange={(event) => setMoveQty(Number(event.target.value))}
                  />
                </Field>
                <Field label="Transaction type">
                  <Select value={moveType} onChange={(event) => setMoveType(event.target.value as StockTransactionType)}>
                    <option>Transfer</option>
                    <option>Sale</option>
                    <option>Return</option>
                    <option>Production consumption</option>
                    <option>Adjustment</option>
                    <option>Cycle count</option>
                  </Select>
                </Field>
                {requiresDestination(moveType) && (
                  <>
                    <Field label="Destination warehouse">
                      <Select value={moveWarehouseId} onChange={(event) => setMoveWarehouseId(event.target.value)}>
                        {metadata.data?.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Storage location">
                      <Select value={moveLocationId} onChange={(event) => setMoveLocationId(event.target.value)}>
                        <option value="">No shelf</option>
                        {locations.data?.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                      </Select>
                    </Field>
                  </>
                )}
                {isOutflowTransaction(moveType) && (
                  <p className="text-sm text-slate-500">Pieces will be deducted from this bundle and recorded in movement history.</p>
                )}
                <Field label="Reason">
                  <Input value={moveReason} onChange={(event) => setMoveReason(event.target.value)} placeholder="Transfer reason" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={moveMutation.isPending}
                    onClick={() => {
                      if (!selectedBundle) return;
                      if (requiresDestination(moveType) && !moveWarehouseId) {
                        notify("error", "Select a destination warehouse for this transaction.");
                        return;
                      }
                      if (selectedBundle.isMixed && (!moveItemColor || !moveItemSize)) {
                        notify("error", "Select a color and size line for this mixed bundle.");
                        return;
                      }
                      moveMutation.mutate({
                        bundleId: selectedBundle.id,
                        quantity: moveQty,
                        itemColor: selectedBundle.isMixed ? moveItemColor : undefined,
                        itemSize: selectedBundle.isMixed ? moveItemSize : undefined,
                        toWarehouseId: requiresDestination(moveType) ? moveWarehouseId : undefined,
                        toLocationId: requiresDestination(moveType) ? moveLocationId || undefined : undefined,
                        type: moveType,
                        reason: moveReason || undefined,
                        expectedVersion: selectedBundle.version
                      });
                    }}
                  >
                    <Truck className="h-4 w-4" />
                    Move
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={splitMutation.isPending}
                    onClick={() =>
                      splitMutation.mutate({
                        bundleId: selectedBundle.id,
                        quantity: splitQty,
                        toWarehouseId: moveWarehouseId,
                        toLocationId: moveLocationId || undefined,
                        reason: moveReason || "Bundle split",
                        expectedVersion: selectedBundle.version
                      })
                    }
                  >
                    <Split className="h-4 w-4" />
                    Split
                  </Button>
                </div>
                <Field label="Split quantity">
                  <Input type="number" min={1} max={selectedBundle.remainingPieces - 1} value={splitQty} onChange={(event) => setSplitQty(Number(event.target.value))} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => printBundleLabelWindow([selectedBundle])}>
                    <Printer className="h-4 w-4" />
                    Print label
                  </Button>
                  <Button variant="secondary" onClick={() => printBundleLabels([selectedBundle])}>
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  disabled={reprintMutation.isPending}
                  onClick={() => reprintMutation.mutate(selectedBundle.id)}
                >
                  {reprintMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Refresh QR code
                </Button>
                <Button
                  variant="danger"
                  disabled={deleteMutation.isPending}
                  onClick={() => handleDeleteBundle(selectedBundle)}
                >
                  {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete bundle
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {tab === "register" && (
        <div className="grid gap-6 xl:grid-cols-[520px_1fr]">
          <Card>
            <h3 className="text-lg font-bold">Register inventory bundles</h3>
            <p className="mt-1 text-sm text-slate-500">
              {registrationMode === "mixed"
                ? "Register one QR bundle containing multiple color and size lines with different piece counts."
                : "Add multiple color and size combinations in one registration. Each combination gets its own QR codes."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant={registrationMode === "separate" ? "primary" : "secondary"} onClick={() => setRegistrationMode("separate")}>
                Separate bundles
              </Button>
              <Button type="button" variant={registrationMode === "mixed" ? "primary" : "secondary"} onClick={() => setRegistrationMode("mixed")}>
                Mixed assortment (one QR)
              </Button>
            </div>
            <form
              className="mt-4 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                if (registrationMode === "mixed") {
                  const mixedItems: RegisterBundleMixedItemInput[] = variantRows.map((row) => ({
                    color: row.colorName.trim(),
                    colorCode: row.colorCode.trim().toUpperCase(),
                    size: row.size,
                    pieces: row.piecesPerBundle
                  }));
                  if (mixedItems.some((row) => !row.color.trim() || !row.colorCode || row.colorCode.length < 2)) {
                    notify("error", "Enter a color name and color code (at least 2 characters) for every line.");
                    return;
                  }
                  registerMutation.mutate({
                    productName: String(form.get("productName")),
                    style: String(form.get("style")),
                    fabric: String(form.get("fabric") || ""),
                    registrationMode: "mixed",
                    mixedItems,
                    bundleQuantity: mixedBundleQuantity,
                    unitCost: Number(form.get("unitCost")),
                    sellingPrice: Number(form.get("sellingPrice")),
                    warehouseId: String(form.get("warehouseId")),
                    storageLocationId: String(form.get("storageLocationId") || "") || undefined,
                    images: registerImages
                  });
                  return;
                }
                const variants: RegisterBundleVariantInput[] = variantRows.map((row) => ({
                  color: row.colorName.trim(),
                  colorCode: row.colorCode.trim().toUpperCase(),
                  size: row.size,
                  bundleQuantity: row.bundleQuantity,
                  piecesPerBundle: row.piecesPerBundle
                }));
                if (variants.some((row) => !row.color.trim() || !row.colorCode || row.colorCode.length < 2)) {
                  notify("error", "Enter a color name and color code (at least 2 characters) for every variant.");
                  return;
                }
                registerMutation.mutate({
                  productName: String(form.get("productName")),
                  style: String(form.get("style")),
                  fabric: String(form.get("fabric") || ""),
                  variants,
                  unitCost: Number(form.get("unitCost")),
                  sellingPrice: Number(form.get("sellingPrice")),
                  warehouseId: String(form.get("warehouseId")),
                  storageLocationId: String(form.get("storageLocationId") || "") || undefined,
                  images: registerImages
                });
              }}
            >
              <Field label="Product name"><Input name="productName" required placeholder="Men's Polo Shirt" /></Field>
              <Field label="Style / model"><Input name="style" required placeholder="Classic fit" /></Field>
              <Field label="Fabric">
                <Select name="fabric" defaultValue="">
                  <option value="">Custom below</option>
                  {metadata.data?.fabrics.map((fabric) => <option key={fabric.id} value={fabric.name}>{fabric.name}</option>)}
                </Select>
              </Field>

              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold">{registrationMode === "mixed" ? "Assortment lines" : "Color / size variants"}</h4>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setVariantRows((rows) => [
                        ...rows,
                        {
                          key: `row-${Date.now()}`,
                          colorName: metadata.data?.colors[0]?.name ?? "",
                          colorCode: metadata.data?.colors[0]?.code ?? "",
                          size: metadata.data?.sizes[0]?.code ?? "M",
                          bundleQuantity: 1,
                          piecesPerBundle: 25,
                          isNewColor: false
                        }
                      ])
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Add variant
                  </Button>
                </div>
                {variantRows.map((row, index) => (
                  <div key={row.key} className="grid gap-3 rounded-2xl border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Variant {index + 1}</p>
                      {variantRows.length > 1 && (
                        <Button type="button" variant="ghost" onClick={() => setVariantRows((rows) => rows.filter((item) => item.key !== row.key))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Color">
                        <Select
                          value={row.isNewColor ? "__new__" : row.colorName}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === "__new__") {
                              setVariantRows((rows) => rows.map((item) => item.key === row.key ? { ...item, isNewColor: true, colorName: "", colorCode: "" } : item));
                              return;
                            }
                            const selected = metadata.data?.colors.find((color) => color.name === value);
                            setVariantRows((rows) =>
                              rows.map((item) =>
                                item.key === row.key
                                  ? { ...item, isNewColor: false, colorName: value, colorCode: selected?.code ?? "" }
                                  : item
                              )
                            );
                          }}
                        >
                          {metadata.data?.colors.map((color) => (
                            <option key={color.id} value={color.name}>{colorLabel(color.name, color.code)}</option>
                          ))}
                          <option value="__new__">+ New color</option>
                        </Select>
                      </Field>
                      <Field label="Color code">
                        <Input
                          value={row.colorCode}
                          onChange={(event) => setVariantRows((rows) => rows.map((item) => item.key === row.key ? { ...item, colorCode: event.target.value.toUpperCase() } : item))}
                          placeholder="Enter code e.g. BLU"
                          required
                          maxLength={8}
                        />
                      </Field>
                    </div>
                    {row.isNewColor && (
                      <Field label="New color name">
                        <Input
                          value={row.colorName}
                          onChange={(event) => setVariantRows((rows) => rows.map((item) => item.key === row.key ? { ...item, colorName: event.target.value } : item))}
                          placeholder="Navy"
                          required
                        />
                      </Field>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Size">
                        <Select
                          value={row.size}
                          onChange={(event) => setVariantRows((rows) => rows.map((item) => item.key === row.key ? { ...item, size: event.target.value } : item))}
                        >
                          {metadata.data?.sizes.map((size) => <option key={size.id} value={size.code}>{size.code}</option>)}
                        </Select>
                      </Field>
                      {registrationMode === "separate" ? (
                        <>
                          <Field label="Bundles">
                            <Input
                              type="number"
                              min={1}
                              value={row.bundleQuantity}
                              onChange={(event) => setVariantRows((rows) => rows.map((item) => item.key === row.key ? { ...item, bundleQuantity: Number(event.target.value) } : item))}
                              required
                            />
                          </Field>
                          <Field label="Pieces / bundle">
                            <Input
                              type="number"
                              min={1}
                              value={row.piecesPerBundle}
                              onChange={(event) => setVariantRows((rows) => rows.map((item) => item.key === row.key ? { ...item, piecesPerBundle: Number(event.target.value) } : item))}
                              required
                            />
                          </Field>
                        </>
                      ) : (
                        <div className="col-span-2">
                          <Field label="Pieces in bundle">
                            <Input
                              type="number"
                              min={1}
                              value={row.piecesPerBundle}
                              onChange={(event) => setVariantRows((rows) => rows.map((item) => item.key === row.key ? { ...item, piecesPerBundle: Number(event.target.value) } : item))}
                              required
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {registrationMode === "mixed" && (
                <Field label="Number of identical mixed bundles">
                  <Input
                    type="number"
                    min={1}
                    value={mixedBundleQuantity}
                    onChange={(event) => setMixedBundleQuantity(Number(event.target.value))}
                    required
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Unit cost"><Input name="unitCost" type="number" min={0} step="0.01" required /></Field>
                <Field label="Selling price"><Input name="sellingPrice" type="number" min={0} step="0.01" required /></Field>
              </div>
              <Field label="Warehouse">
                <Select name="warehouseId" value={selectedWarehouseId} onChange={(event) => setSelectedWarehouseId(event.target.value)} required>
                  {metadata.data?.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </Select>
              </Field>
              <Field label="Storage location">
                <Select name="storageLocationId" defaultValue="">
                  <option value="">No shelf</option>
                  {locations.data?.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </Select>
              </Field>
              <Field label="Product images">
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={async (event) => setRegisterImages(await readImages(event.target.files))}
                />
              </Field>
              <Button disabled={registerMutation.isPending || variantRows.length === 0}>
                {registerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
                {registrationMode === "mixed" ? "Register mixed bundles" : "Register bundles"}
              </Button>
            </form>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">Generated QR codes</h3>
              {lastRegistered.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => printBundleLabelWindow(lastRegistered)}><Printer className="h-4 w-4" />Print all</Button>
                  <Button variant="secondary" onClick={() => printBundleLabels(lastRegistered)}><Download className="h-4 w-4" />PDF</Button>
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {lastRegistered.map((bundle) => (
                <div key={bundle.id} className="rounded-2xl border border-slate-100 p-4">
                  {bundle.qrImageUrl && <img src={bundle.qrImageUrl} alt="QR" className="h-24 w-24" />}
                  <p className="mt-2 font-bold">{bundle.productName}</p>
                  <p className="text-sm text-slate-500">{bundleVariantLabel(bundle)}</p>
                  <p className="text-xs text-slate-500">{bundle.bundleNumber} · {bundle.qrCodeNumber}</p>
                </div>
              ))}
              {!lastRegistered.length && <p className="text-sm text-slate-500">Register bundles to generate unique QR codes instantly.</p>}
            </div>
          </Card>
        </div>
      )}

      {tab === "bundles" && (
        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-bold">Bundle search</h3>
              <p className="text-sm text-slate-500">Search by QR code, product, SKU, color, size, or bundle number.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bundles..." />
              </div>
              <Button
                variant="secondary"
                disabled={selectedBundleIds.size === 0}
                onClick={() => {
                  const selected = (bundles.data || []).filter((bundle) => selectedBundleIds.has(bundle.id));
                  printBundleLabelWindow(selected);
                }}
              >
                <Printer className="h-4 w-4" />
                Print selected
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {bundles.isLoading && <p className="text-sm text-slate-500">Loading bundles...</p>}
            {bundles.data?.map((bundle) => (
              <button
                key={bundle.id}
                type="button"
                onClick={() => {
                  setSelectedBundle(bundle);
                  setScanResult({
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
                  });
                  setMoveItemColor(bundle.isMixed ? bundle.items?.[0]?.color ?? "" : "");
                  setMoveItemSize(bundle.isMixed ? bundle.items?.[0]?.size ?? "" : "");
                  setTab("scan");
                }}
                className={`rounded-2xl border p-4 text-left transition ${selectedBundleIds.has(bundle.id) ? "border-emerald-400 bg-emerald-50/50" : "border-slate-100 hover:border-emerald-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{bundle.productName}</p>
                    <p className="text-sm text-slate-500">{bundle.style}</p>
                    <p className="text-sm text-slate-500">{bundle.isMixed ? formatMixedBundleSummary(bundle.items) : `${colorLabel(bundle.color, bundle.colorCode)} · ${bundle.size}`}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedBundleIds.has(bundle.id)}
                      onChange={(event) => {
                        event.stopPropagation();
                        setSelectedBundleIds((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(bundle.id);
                          else next.delete(bundle.id);
                          return next;
                        });
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteBundle(bundle);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="text-sm">
                    <p>{bundle.bundleNumber}</p>
                    <p className="text-slate-500">{bundle.warehouseName}</p>
                  </div>
                  {bundle.qrImageUrl && <img src={bundle.qrImageUrl} alt="QR" className="h-16 w-16" />}
                </div>
                <Badge className="mt-3">{bundle.remainingPieces} pcs · {bundle.status}</Badge>
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === "history" && (
        <Card>
          <h3 className="text-lg font-bold">Movement history</h3>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Type</th>
                  <th>Bundle</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>From</th>
                  <th>To</th>
                  <th>User</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {transactions.data?.map((tx: StockTransaction) => (
                  <tr key={tx.id} className="border-t">
                    <td className="py-2">{new Date(tx.createdAt).toLocaleString()}</td>
                    <td>{tx.type}</td>
                    <td>{tx.bundleNumber}</td>
                    <td>{tx.productName}</td>
                    <td>{tx.quantity}</td>
                    <td>{tx.fromWarehouseName || "-"}</td>
                    <td>{tx.toWarehouseName || "-"}</td>
                    <td>{tx.userName}</td>
                    <td>{tx.referenceNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {queued.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold">Offline queue</h3>
          <div className="mt-3 grid gap-2">
            {queued.map((item) => (
              <div key={item.clientId} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm">
                <div>
                  <p className="font-medium">{item.type.replaceAll("_", " ")}</p>
                  <p className="text-slate-500">{new Date(item.clientTimestamp).toLocaleString()}</p>
                  {item.error && <p className="text-rose-600">{item.error}</p>}
                </div>
                <Badge className={item.status === "failed" ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}>{item.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
