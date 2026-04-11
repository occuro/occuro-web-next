'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Wrap the entire login flow in try/catch — any unhandled rejection
    // would otherwise leave the button stuck on "Anmelden..." forever
    // because setLoading(false) wouldn't run.
    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort falsch.'
          : signInError.message);
        setLoading(false);
        return;
      }

      // signInWithPassword already returns the user — no need for a
      // separate getUser() round-trip. That second call was racing
      // against cookie propagation and could hang for several seconds.
      const userId = signInData.user?.id;
      if (!userId) {
        setError('Anmeldung fehlgeschlagen. Bitte versuche es erneut.');
        setLoading(false);
        return;
      }

      // Profile lookup is best-effort — if the row doesn't exist yet
      // (brand new account, profile created via trigger but not yet
      // visible due to replication lag), we default to the regular
      // user route. maybeSingle() returns null instead of throwing.
      let userType: string | null = null;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', userId)
          .maybeSingle();
        userType = profile?.user_type ?? null;
      } catch (profileErr) {
        // Swallow — fall back to /app
        console.warn('[login] profile lookup failed:', profileErr);
      }

      // Hard redirect so cookies are properly set for SSR.
      // window.location.href is intentional — we DON'T want the
      // Next router here because it would do a soft nav and skip
      // the proxy.ts cookie refresh.
      window.location.href = userType === 'organization' ? '/organizer' : '/app';
    } catch (err) {
      console.error('[login] threw:', err);
      setError(
        err instanceof Error
          ? `Unerwarteter Fehler: ${err.message}`
          : 'Unerwarteter Fehler bei der Anmeldung.',
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="text-center mb-10">
          <Link href="/" className="text-2xl font-heading font-bold tracking-tight hover:opacity-70 transition-opacity">
            occuro
          </Link>
          <p className="mt-2 text-sm text-muted-fg">Willkommen zurück</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px] text-center animate-fade-in-scale">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-medium text-foreground/70">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200"
              placeholder="deine@email.de"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[13px] font-medium text-foreground/70">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200"
              placeholder="Passwort"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 mt-2 rounded-full text-sm font-semibold bg-primary-bg text-primary-text hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 transition-transform shadow-sm"
          >
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <p className="text-center text-[13px] text-muted-fg mt-8">
          Noch kein Konto?{' '}
          <Link href="/auth/register" className="font-medium text-foreground hover:opacity-70 transition-opacity">
            Registrieren
          </Link>
        </p>
      </div>
    </div>
  );
}
