import { NextResponse } from 'next/server';

// Returns the current server-side deployment ID. The client polls this
// endpoint every couple of minutes to detect "a newer build is live"
// and shows an "Update verfügbar" banner. The endpoint is intentionally
// no-cache so the response always reflects the actually-running build.
export const dynamic = 'force-dynamic';

export async function GET() {
  // Match the same fallback chain as next.config.ts so the build-time
  // bundle marker and the runtime API marker derive from the same
  // source. If VERCEL_DEPLOYMENT_ID isn't present at runtime for any
  // reason, the git commit SHA is always set on Vercel and changes
  // with every deploy.
  const deploymentId =
    process.env.VERCEL_DEPLOYMENT_ID ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    'dev';
  return NextResponse.json(
    {
      deploymentId,
      builtAt: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    },
  );
}
