import type { OfflineSyncOperation } from "../shared/bundleInventory.js";

const DB_NAME = "lgm-inventory-offline";
const STORE_NAME = "operations";
const DB_VERSION = 1;

export interface QueuedOperation extends OfflineSyncOperation {
  status: "pending" | "failed";
  error?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "clientId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open offline store"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, handler: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = handler(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline store operation failed"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline transaction failed"));
  });
}

export async function listQueuedOperations(): Promise<QueuedOperation[]> {
  const rows = await withStore("readonly", (store) => store.getAll());
  return (rows as QueuedOperation[]).sort((a, b) => a.clientTimestamp.localeCompare(b.clientTimestamp));
}

export async function enqueueOperation(operation: OfflineSyncOperation): Promise<QueuedOperation> {
  const queued: QueuedOperation = { ...operation, status: "pending" };
  await withStore("readwrite", (store) => store.put(queued));
  return queued;
}

export async function removeQueuedOperation(clientId: string) {
  await withStore("readwrite", (store) => store.delete(clientId));
}

export async function markQueuedOperationFailed(clientId: string, error: string) {
  const rows = await listQueuedOperations();
  const existing = rows.find((row) => row.clientId === clientId);
  if (!existing) return;
  const updated: QueuedOperation = { ...existing, status: "failed", error };
  await withStore("readwrite", (store) => store.put(updated));
}

export async function clearFailedOperations() {
  const rows = await listQueuedOperations();
  await Promise.all(rows.filter((row) => row.status === "failed").map((row) => removeQueuedOperation(row.clientId)));
}
