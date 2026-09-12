'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { authFehlerText } from '@/lib/auth-errors';

/**
 * „Mit Google fortfahren" — derselbe Weg wie in der App (socialAuth.ts):
 * Supabase-OAuth mit prompt=select_account, zurück über /auth/callback, der
 * den Code gegen eine Sitzung tauscht und neue Konten in die Einrichtung
 * schickt.
 *
 * Apple fehlt hier bewusst: Die App meldet sich nativ per Identity-Token an,
 * für den Browser-Weg bräuchte Supabase einen Apple-Secret-Key, der absichtlich
 * nicht hinterlegt ist.
 */
export function GoogleButton({ onError }: { onError?: (message: string) => void }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { prompt: 'select_account' },
        },
      });
      // Bei Erfolg leitet der Browser zu Google weiter — der Knopf bleibt
      // bis dahin im Ladezustand.
      if (error) {
        setLoading(false);
        onError?.(authFehlerText(error, 'sign_in'));
      }
    } catch (err) {
      setLoading(false);
      onError?.(authFehlerText(err, 'sign_in'));
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-full text-sm font-semibold border border-border-strong bg-surface text-foreground hover:bg-elevated disabled:opacity-60 transition-colors"
    >
      <GoogleLogo />
      {loading ? 'Weiterleiten…' : 'Mit Google fortfahren'}
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
