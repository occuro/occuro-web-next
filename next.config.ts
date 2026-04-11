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
