const CACHE_NAME = 'open-brain-v1';
const OFFLINE_QUEUE_STORE = 'offline-queue';

// Cache the PWA shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(['/pwa/', '/pwa/manifest.json']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Background sync for offline queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'replay-thoughts') {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  const db = await openDB();
  const tx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
  const store = tx.objectStore(OFFLINE_QUEUE_STORE);
  const items = await getAllFromStore(store);

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: 'POST',
        headers: item.headers,
        body: item.body,
      });

      if (response.ok || response.status === 200) {
        // Success or duplicate (idempotency key matched) — remove from queue
        const deleteTx = db.transaction(OFFLINE_QUEUE_STORE, 'readwrite');
        deleteTx.objectStore(OFFLINE_QUEUE_STORE).delete(item.id);
      }
    } catch {
      // Still offline, stop trying
      break;
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('open-brain-sw', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OFFLINE_QUEUE_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromStore(store) {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
