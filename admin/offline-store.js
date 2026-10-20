const DATABASE = "coincollector-offline";
const STORE = "records";
let databasePromise;

function database() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) return reject(new Error("Le stockage local est indisponible sur ce navigateur."));
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

async function operate(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("Le stockage local a échoué."));
    transaction.onabort = () => reject(transaction.error || new Error("Le stockage local a été interrompu."));
  });
}

export const draftKey = cfg => `draft:${cfg.owner}/${cfg.repo}/${cfg.branch}`;
export const metadataKey = cfg => `metadata:${cfg.owner}/${cfg.repo}/${cfg.branch}`;
export const readOffline = key => operate("readonly", store => store.get(key));
export const writeOffline = (key, value) => operate("readwrite", store => store.put(value, key));
export const removeOffline = key => operate("readwrite", store => store.delete(key));
