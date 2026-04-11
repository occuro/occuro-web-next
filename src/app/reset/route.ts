import { NextResponse } from 'next/server';

/**
 * Emergency escape hatch — /reset
 *
 * Returns a self-contained HTML page with vanilla JavaScript that:
 *   1. Clears all localStorage entries (Supabase tokens, occuro cache)
 *   2. Clears sessionStorage
 *   3. Deletes every cookie on the document (including sb-* tokens)
 *   4. Unregisters any service workers (in case the cached SW is part
 *      of the problem)
 *   5. Calls caches.delete() on every Cache Storage entry
 *   6. Redirects to /
 *
 * This page has ZERO React, ZERO bundled JS, ZERO dependencies on the
 * webapp's auth context — so it works even when the regular logout
 * button is broken because the bundle is too stale to render. Users
 * who get stuck can simply type `<host>/reset` in the URL bar.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>occuro — Zurücksetzen</title>
<style>
  html, body {
    margin: 0; padding: 0;
    background: #0A0A0A; color: #FAFAFA;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
  }
  .card {
    text-align: center;
    max-width: 420px;
    padding: 32px 24px;
  }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.02em; }
  p  { font-size: 14px; line-height: 1.5; opacity: 0.7; margin: 0 0 24px; }
  .spinner {
    width: 32px; height: 32px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: #8B5CF6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 24px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ok { color: #4ADE80; font-size: 32px; margin-bottom: 12px; }
  a {
    display: inline-block;
    padding: 12px 24px;
    background: #8B5CF6; color: white;
    text-decoration: none;
    border-radius: 999px;
    font-weight: 600;
    font-size: 14px;
    margin-top: 8px;
  }
  a:hover { background: #7C3AED; }
  .step { font-size: 11px; opacity: 0.5; margin-top: 8px; min-height: 16px; }
</style>
</head>
<body>
  <div class="card">
    <div id="spinner" class="spinner"></div>
    <div id="check" class="ok" style="display:none">✓</div>
    <h1 id="title">App wird zurückgesetzt…</h1>
    <p id="subtitle">Sitzung wird beendet, Cache wird geleert.</p>
    <div id="step" class="step"></div>
    <a id="link" href="/" style="display:none">Zur Startseite</a>
  </div>

  <script>
    (function () {
      var step = document.getElementById('step');
      function log(msg) { if (step) step.textContent = msg; }

      try {
        log('localStorage wird geleert…');
        var keys = Object.keys(localStorage);
        for (var i = 0; i < keys.length; i++) {
          try { localStorage.removeItem(keys[i]); } catch (e) {}
        }
      } catch (e) {}

      try {
        log('sessionStorage wird geleert…');
        sessionStorage.clear();
      } catch (e) {}

      try {
        log('Cookies werden gelöscht…');
        var cookies = document.cookie.split(';');
        for (var j = 0; j < cookies.length; j++) {
          var name = cookies[j].split('=')[0].trim();
          if (!name) continue;
          // Delete on root path
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
          // And on the current host (for subdomain-scoped cookies)
          document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + window.location.hostname;
        }
      } catch (e) {}

      // Service workers — unregister all so a stale SW doesn't keep
      // serving an old bundle from cache.
      var swPromise = (function () {
        if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistrations) {
          return Promise.resolve();
        }
        log('Service Worker wird abgemeldet…');
        return navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }).catch(function () {});
      })();

      // CacheStorage — delete every cache entry the app may have
      // accumulated (icons, fonts, prefetched pages).
      var cachePromise = (function () {
        if (!window.caches || !window.caches.keys) return Promise.resolve();
        log('Browser-Cache wird geleert…');
        return window.caches.keys().then(function (names) {
          return Promise.all(names.map(function (n) { return window.caches.delete(n); }));
        }).catch(function () {});
      })();

      Promise.all([swPromise, cachePromise]).then(function () {
        log('');
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('check').style.display = 'block';
        document.getElementById('title').textContent = 'Fertig — du bist abgemeldet';
        document.getElementById('subtitle').textContent = 'Du wirst gleich zur Startseite weitergeleitet.';
        document.getElementById('link').style.display = 'inline-block';
        // Hard redirect after a short delay so the user can see the
        // confirmation. The replace() avoids leaving /reset in history.
        setTimeout(function () {
          window.location.replace('/');
        }, 1500);
      });
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Never cache the reset page itself — we always want the freshest
      // version, and there's no benefit to caching since it's tiny.
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
    },
  });
}
