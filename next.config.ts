import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browsers ALWAYS auto-fetch /favicon.ico regardless of what's in
  // the HTML <link rel="icon">. We don't ship a .ico file (only the
  // SVG via app/icon.svg), so without this redirect every page load
  // logs a 404 in the console. Modern browsers happily render SVG
  // when redirected from /favicon.ico.
  async redirects() {
    return [
      { source: '/favicon.ico', destination: '/icon.svg', permanent: true },
    ];
  },

  // ── Apple App Site Association ─────────────────────────────────
  // Universal Links für app.occuroapp.com. Share-Links der App zeigen
  // hierher (EXPO_PUBLIC_WEB_BASE_URL), und app.json deklariert sowohl
  // `applinks:app.occuroapp.com` als auch `webcredentials:` — ohne diese
  // Datei öffnet iOS die Links im Browser statt in der App und die
  // Passwort-Autofill-Verknüpfung greift nicht.
  //
  // Apple ist bei zwei Dingen streng: die Datei MUSS als application/json
  // ausgeliefert werden, und der Pfad MUSS exakt
  // /.well-known/apple-app-site-association ohne Dateiendung sein. Die
  // Datei liegt deshalb in public/.well-known/ und bekommt ihren
  // Content-Type hier. Headers werden vor dem Dateisystem geprüft und
  // treffen damit auch statische Dateien.
  //
  // Apples CDN folgt beim Abholen KEINEN Redirects — die Datei muss also
  // unter genau diesem Host direkt antworten.
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
      // ── Android App Links ──────────────────────────────────────────
      // Das Gegenstueck fuer Android. Die .json-Endung liefert zwar meist
      // schon den richtigen Typ, aber Androids Pruefung scheitert STILL,
      // wenn er nicht stimmt: Es gibt keine Fehlermeldung, die Links
      // oeffnen sich einfach weiter im Browser. Deshalb ausdruecklich.
      //
      // Wie bei Apple gilt: exakter Pfad, HTTPS, keine Weiterleitung.
      // Der Host muss der sein, den app.json unter android.intentFilters
      // beansprucht — app.occuroapp.com, also GENAU dieses Projekt.
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },

  // ── Bestätigungslinks ohne Code ────────────────────────────────
  // Supabase liefert das Ergebnis einer Bestätigung bei einigen Flows nur
  // als URL-Fragment (#error=…). Ein Fragment erreicht den Server nie, also
  // kommt hier eine nackte /auth/callback ohne ?code an.
  //
  // Ein Redirect auf /auth/confirmed würde funktionieren, aber nur weil
  // Browser das Fragment über den 3xx hinweg mitschleppen. Ein Rewrite
  // rendert /auth/confirmed direkt unter der aufgerufenen URL — das
  // Fragment bleibt unangetastet, ganz ohne diese Annahme.
  //
  // `beforeFiles` ist nötig, weil der Route-Handler unter
  // src/app/auth/callback/route.ts eine Dateisystem-Route ist und sonst
  // gewinnen würde. Mit `?code=` greift der Rewrite nicht und der
  // Handler tauscht den Code wie bisher gegen eine Session.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/auth/callback',
          missing: [{ type: 'query', key: 'code' }],
          destination: '/auth/confirmed',
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },


  // ── Version Skew Protection ────────────────────────────────────
  // When we deploy a new build while a user is mid-session, the user's
  // browser still holds JavaScript chunks from the OLD build. Without
  // skew protection those chunks 404 → React silently breaks → the
  // signOut button stops working and the user is stuck.
  //
  // Vercel auto-injects VERCEL_DEPLOYMENT_ID at build time. By passing
  // it to Next as `deploymentId`, every static asset URL gets a
  // ?dpl=<id> query and every nav request includes an x-deployment-id
  // header. If the server detects a mismatch, Next triggers a full
  // page reload — which fetches fresh assets and recovers the user
  // automatically. This is the single biggest win against the
  // "stuck after deploy" bug.
  //
  // Falls back to undefined in dev (no skew protection needed locally).
  // Also fall back to the git commit SHA — VERCEL_DEPLOYMENT_ID is the
  // canonical value but on some Vercel project setups it shows up empty
  // at build time, leaving the bundle without a usable version marker.
  // The commit SHA is always present on Vercel and changes with every
  // deploy, so it's a perfectly valid stand-in for skew detection.
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_GIT_COMMIT_SHA,

  // Expose a public version of the deployment ID so the client can
  // poll /api/version and detect "a newer build is live" without
  // having to hard-reload to find out.
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ID:
      process.env.VERCEL_DEPLOYMENT_ID ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      'dev',
  },
};

export default nextConfig;
