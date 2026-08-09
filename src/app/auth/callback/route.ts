import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Handles Supabase email confirmation / magic link callbacks.
// The mobile app sends users here via the signUp emailRedirectTo.
// Flow:
//   1. Supabase sends user to /auth/callback?code=...&type=signup
//   2. We exchange the code for a session (sets httpOnly cookies)
//   3. Redirect to /app for individuals, /organizer for organizations
//
// Zwei Fälle können hier keine Session herstellen, sind aber trotzdem
// erfolgreiche Bestätigungen — der Token wurde schon in Supabases
// /auth/v1/verify eingelöst, bevor der User hier ankommt:
//   · Registrierung in der Mobile-App: der PKCE-Verifier liegt im
//     App-Speicher, nicht in diesem Browser, der Tausch schlägt zwangsläufig fehl.
//   · Supabase liefert das Ergebnis nur als URL-Fragment (#access_token /
//     #error) — ein Fragment erreicht den Server nie, hier kommt also
//     überhaupt kein Code an.
// Beide landen auf /auth/confirmed, das den Fragment-Teil im Client auswertet.
//
// Bei echten Fehlern geht es zur Login-Seite mit error-Query, damit der User
// eine Meldung sieht statt einer 404.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    const loginUrl = new URL('/auth/login', url.origin);
    loginUrl.searchParams.set('error', errorDescription ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL('/auth/confirmed', url.origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    // "PKCE code verifier not found in storage" heißt: der Flow wurde woanders
    // gestartet (Mobile-App, anderer Browser). Die Mail ist trotzdem bestätigt.
    if (/code[_ ]verifier/i.test(exchangeError.message)) {
      return NextResponse.redirect(new URL('/auth/confirmed', url.origin));
    }
    const loginUrl = new URL('/auth/login', url.origin);
    loginUrl.searchParams.set('error', exchangeError.message);
    return NextResponse.redirect(loginUrl);
  }

  // Determine where to send the user based on their profile type
  let destination = next ?? '/app';
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_type')
        .eq('id', user.id)
        .maybeSingle();
      if (profile?.user_type === 'organization') {
        destination = next ?? '/organizer';
      }
    }
  } catch {
    // fallback to /app
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
