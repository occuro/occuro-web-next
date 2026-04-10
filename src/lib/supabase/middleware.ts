import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase session cookies on every request. This MUST be
 * called from `proxy.ts` (the new name for `middleware.ts`) so that the
 * access token gets renewed before the page renders — otherwise the
 * cookies expire silently and the user appears logged-in client-side
 * but every API call fails with 401, and even `signOut()` becomes
 * impossible because the local session is broken.
 *
 * The critical part is the `await supabase.auth.getUser()` call below.
 * Without it, the SSR client never touches the cookies and `setAll`
 * is never invoked. Previously this was missing, which is why the web
 * app worked during a session but broke as soon as the user closed
 * and reopened the tab (matching the dev-mode bug from earlier).
 *
 * Auth protection itself is still handled client-side in the layout
 * components — this function only keeps the session cookies fresh.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: This call is what triggers the session refresh. It hits
  // the Supabase Auth server, validates the access token, and if needed
  // exchanges the refresh token for a new pair — which then flows back
  // through `setAll` above and into both the request cookies (for any
  // downstream server code) and the response cookies (for the browser).
  // Errors are swallowed because an unauthenticated request is still a
  // valid request — auth gating is the layout's job, not the proxy's.
  try {
    await supabase.auth.getUser();
  } catch {
    // ignore
  }

  return supabaseResponse;
}
