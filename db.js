/* =========================================================
   Cartella Salute — Archivio sul telefono (IndexedDB)
   ========================================================= */
const DB_NOME = 'cartella-salute';
const DB_VER = 1;
const STORES = ['impostazioni', 'misure', 'visite', 'appuntamenti', 'esami', 'problemi', 'farmaci', 'documenti', 'tipi'];

let _db = null;
function apriDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((ok, ko) => {
    const req = indexedDB.open(DB_NOME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: s === 'impostazioni' ? 'k' : 'id' });
        }
      }
    };
    req.onsuccess = () => { _db = req.result; ok(_db); };
    req.onerror = () => ko(req.error);
  });
}

function tx(store, modo, fn) {
  return apriDB().then(db => new Promise((ok, ko) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => ok(r && 'result' in r ? r.result : r);
    t.onerror = () => ko(t.error);
    t.onabort = () => ko(t.error);
  }));
}

const DB = {
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },
  async tutti(store) { return tx(store, 'readonly', s => s.getAll()); },
  async uno(store, id) { return tx(store, 'readonly', s => s.get(id)); },
  async salva(store, obj) {
    const ora = new Date().toISOString();
    if (store !== 'impostazioni') {
      if (!obj.id) { obj.id = DB.uid(); obj.creato = ora; }
      obj.modificato = ora;
    }
    await tx(store, 'readwrite', s => s.put(obj));
    return obj;
  },
  async elimina(store, id) { return tx(store, 'readwrite', s => s.delete(id)); },
  async svuota(store) { return tx(store, 'readwrite', s => s.clear()); },

  async get(k, def) {
    const r = await DB.uno('impostazioni', k);
    return r ? r.v : def;
  },
  async set(k, v) { return DB.salva('impostazioni', { k, v }); },

  /* Chiede al browser di non cancellare i dati da solo */
  async persistente() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        if (await navigator.storage.persisted()) return true;
        return await navigator.storage.persist();
      }
    } catch (e) {}
    return false;
  },
  async spazio() {
    try { return await navigator.storage.estimate(); } catch (e) { return null; }
  }
};

window.DB = DB;
window.DB_STORES = STORES;
