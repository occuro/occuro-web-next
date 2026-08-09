import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Handles Supabase email confirmation / magic link callbacks.
// The mobile app sends users here via the signUp emailRedirectTo.
// Flow:
//   1. Supabase sends user to /auth/callback?code=...&type=signup
//   2. We exchange the code for a session (sets httpOnly cookies)
//   3. Redirect to /app for individuals, /organizer for organizations
//
// Registrierungen aus der Mobile-App landen hier ebenfalls, können aber
// keine Session herstellen: der PKCE-Verifier liegt im App-Speicher, nicht
// in diesem Browser, der Tausch schlägt also zwangsläufig fehl. Die Mail
// ist zu dem Zeitpunkt trotzdem schon bestätigt — Supabases /auth/v1/verify
// hat den Token eine Station vorher eingelöst. Dieser Fall geht deshalb auf
// /auth/confirmed statt auf eine Fehlermeldung.
//
// Aufrufe OHNE ?code erreichen diesen Handler im Normalfall gar nicht: ein
// beforeFiles-Rewrite in next.config.ts rendert dafür direkt /auth/confirmed,
// damit ein Ergebnis-Fragment (#error=…) nicht von einem Redirect abhängt.
// Die Zweige unten bleiben als Absicherung, falls der Rewrite mal nicht greift.
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
