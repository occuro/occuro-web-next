import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID,

  // Expose a public version of the deployment ID so the client can
  // poll /api/version and detect "a newer build is live" without
  // having to hard-reload to find out.
  env: {
    NEXT_PUBLIC_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID ?? 'dev',
  },
};

export default nextConfig;
