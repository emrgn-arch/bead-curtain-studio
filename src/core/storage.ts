// Strands — © 2026 Emre Ergin (emrgn-arch) · https://github.com/emrgn-arch/bead-curtain-studio
// Keeps the last uploaded image in IndexedDB so a reload does not lose it.

const DB = 'bead-curtain-studio';
const STORE = 'files';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export interface StoredImage {
  blob: Blob;
  name: string;
}

export async function saveImage(img: StoredImage): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(img, 'image'));
  } catch {
    /* private mode / blocked storage */
  }
}

export async function loadImage(): Promise<StoredImage | null> {
  try {
    return ((await tx('readonly', (s) => s.get('image'))) as StoredImage | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function clearImage(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete('image'));
  } catch {
    /* ignore */
  }
}
