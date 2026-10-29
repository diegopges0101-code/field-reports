// Almacenamiento local (IndexedDB): borradores, fotos pendientes, caché. Permite trabajar sin cobertura.
const DB_NAME = 'orbius-field-reports';
const STORES = ['reports', 'photos', 'queue', 'kv'];
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'k' : 'id' }); });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => res(r && 'result' in r ? r.result : r);
    t.onerror = () => rej(t.error);
  });
}
export const idb = {
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  put: (store, val) => tx(store, 'readwrite', (s) => s.put(val)),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
};
export const kv = {
  get: async (k) => (await idb.get('kv', k))?.v,
  set: (k, v) => idb.put('kv', { k, v }),
};
