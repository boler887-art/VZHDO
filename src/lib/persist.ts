import type { AppealRecord, FileMeta, IncomingRecord, ProtocolRecord } from '../types';

const DB = 'vzhdo-dash';
const VER = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function saveStore(data: {
  protocols: ProtocolRecord[];
  appeals: AppealRecord[];
  incoming: IncomingRecord[];
  meta: Record<string, FileMeta | null>;
}) {
  const db = await open();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put({ ...data, schemaVersion: 1 }, 'state');
  return new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadStore(): Promise<{
  protocols: ProtocolRecord[];
  appeals: AppealRecord[];
  incoming: IncomingRecord[];
  meta: Record<string, FileMeta | null>;
} | null> {
  try {
    const db = await open();
    return await new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readonly');
      const q = tx.objectStore('kv').get('state');
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  } catch {
    return null;
  }
}
