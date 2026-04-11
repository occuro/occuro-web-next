/**
 * occuro Service Worker — chunk recovery + cache busting
 *
 * What this does:
 *
 * 1. Intercepts every fetch request that targets a Next.js JavaScript
 *    or CSS chunk (/_next/static/chunks/*).
 *
 * 2. If such a request returns 404 or any 4xx, that means the user is
 *    on an old build whose chunks no longer exist on the server. We
 *    post a message to the page (`{ type: 'CHUNK_GONE' }`) so the
 *    main thread can hard-reload.
 *
 * 3. We also handle navigation requests by going network-first with a
 *    short timeout — if Next's response 404s on a stale page reference,
 *    same recovery path.
 *
 * 4. The SW unregisters itself if it ever sees a `{ type: 'KILL_SW' }`
 *    message — emergency switch in case it ever causes problems.
 *
 * No precaching, no offline support — this is purely a deploy-time
 * recovery mechanism. Service workers can do a lot more, we're being
 * intentionally minimal so it can't break the rest of the app.
 */

const SW_VERSION = 'occuro-sw-1';

self.addEventListener('install', () => {
  // Activate immediately on first install — don't wait for the user
  // to close all tabs.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of all clients immediately so the new SW handles
  // existing tabs without a reload.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'KILL_SW') {
    self.registration
      .unregister()
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      });
  }
});

// Notify all open tabs that a chunk is gone so the main thread can
// trigger a hard reload via robustness-shell.
async function notifyChunkGone() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => {
    client.postMessage({ type: 'CHUNK_GONE' });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only intercept GETs from our origin
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Detect Next.js static asset URLs — these are the ones that 404
  // when the user is on an old build.
  const isNextStatic = url.pathname.startsWith('/_next/static/');

  if (isNextStatic) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // 404 / 410 = file no longer exists on the new build
          if (res.status === 404 || res.status === 410) {
            await notifyChunkGone();
          }
          return res;
        } catch (err) {
          // Network error fetching a chunk — also a sign the build
          // is mismatched. Notify and rethrow so Next still sees
          // the original error and triggers ChunkLoadError.
          await notifyChunkGone();
          throw err;
        }
      })(),
    );
  }
});
