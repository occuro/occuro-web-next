import { NextResponse, type NextRequest } from 'next/server';

// Server-side cookie wipe. Needed because Supabase SSR stores its
// session in httpOnly cookies, which JavaScript on the client can't
// delete via `document.cookie = ...`. Without this endpoint, our
// client-side "nuclear recovery" (wipe storage + reload) only cleared
// localStorage while the cookies survived, the middleware immediately
// re-established the bad session on the next request, and users stayed
// stuck in the "User" fallback state forever.
//
// On POST we return a response that sets every incoming sb-* cookie to
// empty with an expired date, which the browser then removes. POST (not
// GET) to avoid any chance of a link preview / prefetch accidentally
// signing someone out.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store' },
  });

  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith('sb-')) continue;
    response.cookies.set(cookie.name, '', {
      expires: new Date(0),
      path: '/',
      maxAge: 0,
    });
  }

  return response;
}
