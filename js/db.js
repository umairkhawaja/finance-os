    // ================================================================
    // INDEXED DB
    // ================================================================
    const DB_NAME = 'FinanceOS_v2';
    const DB_VERSION = 1;
    let db = null;

    function openDB() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains('transactions')) d.createObjectStore('transactions', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('portfolioEntries')) d.createObjectStore('portfolioEntries', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('config')) d.createObjectStore('config', { keyPath: 'key' });
          if (!d.objectStoreNames.contains('balanceHistory')) d.createObjectStore('balanceHistory', { keyPath: 'date' });
        };
        req.onsuccess = e => { db = e.target.result; resolve(db); };
        req.onerror = e => reject(e.target.error);
      });
    }
    function dbGetAll(store) {
      return new Promise((res, rej) => { const r = db.transaction(store, 'readonly').objectStore(store).getAll(); r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error); });
    }
    function dbPut(store, obj) {
      return new Promise((res, rej) => { const r = db.transaction(store, 'readwrite').objectStore(store).put(obj); r.onsuccess = () => { if (typeof scheduleSync === 'function') scheduleSync(); res(); }; r.onerror = e => rej(e.target.error); });
    }
    function dbDelete(store, key) {
      return new Promise((res, rej) => { const r = db.transaction(store, 'readwrite').objectStore(store).delete(key); r.onsuccess = () => { if (typeof scheduleSync === 'function') scheduleSync(); res(); }; r.onerror = e => rej(e.target.error); });
    }
    function dbClear(store) {
      return new Promise((res, rej) => { const r = db.transaction(store, 'readwrite').objectStore(store).clear(); r.onsuccess = () => { if (typeof scheduleSync === 'function') scheduleSync(); res(); }; r.onerror = e => rej(e.target.error); });
    }
    async function dbGetConfig(key) { const all = await dbGetAll('config'); const e = all.find(x => x.key === key); return e ? e.value : null; }
    async function dbSetConfig(key, value) { await dbPut('config', { key, value }); }

