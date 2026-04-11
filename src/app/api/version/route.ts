import { NextResponse } from 'next/server';

// Returns the current server-side deployment ID. The client polls this
// endpoint every couple of minutes to detect "a newer build is live"
// and shows an "Update verfügbar" banner. The endpoint is intentionally
// no-cache so the response always reflects the actually-running build.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? 'dev',
      builtAt: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    },
  );
}
