import type { AppealRecord, FileMeta, IncomingRecord, ProtocolRecord } from './types';

const DB_NAME = 'vzhdo-dashboard';
const DB_VER = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(key: string, value: unknown) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const val = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return val;
}

export async function saveOperational(kind: 'protocols' | 'appeals' | 'incoming', records: unknown[], meta: FileMeta) {
  await put(kind, { records, meta, schemaVersion: 1 });
}

export async function loadOperational<T>(kind: 'protocols' | 'appeals' | 'incoming'): Promise<{ records: T[]; meta?: FileMeta } | null> {
  const data = await get<{ records: T[]; meta?: FileMeta }>(kind);
  return data || null;
}

export type SavedProtocols = ProtocolRecord[];
export type SavedAppeals = AppealRecord[];
export type SavedIncoming = IncomingRecord[];
