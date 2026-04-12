import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Handles Supabase email confirmation / magic link callbacks.
// The mobile app sends users here via the signUp emailRedirectTo.
// Flow:
//   1. Supabase sends user to /auth/callback?code=...&type=signup
//   2. We exchange the code for a session (sets httpOnly cookies)
//   3. Redirect to /app for individuals, /organizer for organizations
//
// On failure, redirect to login with an error query param so the user
// gets a helpful message instead of a 404.

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
    const loginUrl = new URL('/auth/login', url.origin);
    loginUrl.searchParams.set('error', 'missing_code');
    return NextResponse.redirect(loginUrl);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
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
