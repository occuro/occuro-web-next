'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { OutNowWordmark } from '@/components/outnow-wordmark';
import { zielNachAnmeldung } from '@/lib/onboarding';

/**
 * Zwei-Faktor-Abfrage nach dem Passwort — Gegenstück zu
 * TwoFactorChallengePage in der App. Einrichten lässt sich 2FA weiterhin nur
 * in der App; hier geht es darum, dass ein eingerichteter zweiter Faktor im
 * Browser nicht einfach wegfällt.
 */
export default function TwoFactorPage() {
  const supabase = createClient();
  const { user, loading: authLoading, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) window.location.replace('/auth/login');
  }, [authLoading, user]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Der Code muss aus 6 Ziffern bestehen.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;
      const totp = factors?.totp?.[0];
      if (totp) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await supabase.auth.mfa.verify({
          factorId: totp.id,
          challengeId: challenge.id,
          code,
        });
        if (verifyError) throw verifyError;
      }
      const { data: { user: aktuell } } = await supabase.auth.getUser();
      window.location.href = aktuell ? await zielNachAnmeldung(supabase, aktuell.id) : '/auth/login';
    } catch (err) {
      const text = err instanceof Error ? err.message.toLowerCase() : '';
      setError(
        text.includes('invalid') || text.includes('expired')
          ? 'Der Code ist ungültig oder abgelaufen. Bitte versuche es erneut.'
          : 'Die Prüfung hat nicht geklappt. Bitte versuche es erneut.',
      );
      setCode('');
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px] text-center animate-fade-in">
        <OutNowWordmark size={26} layout="stacked" />
        <div className="mx-auto mt-8 mb-5 w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center">
          <ShieldCheck size={26} strokeWidth={1.6} />
        </div>
        <h1 className="text-2xl font-heading font-bold">Zwei-Faktor-Bestätigung</h1>
        <p className="mt-2 text-sm text-muted-fg">
          Gib den 6-stelligen Code aus deiner Authenticator-App ein.
        </p>

        <form onSubmit={handleVerify} className="mt-8 space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px]">{error}</div>
          )}
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="w-full px-4 py-3.5 rounded-xl border border-border-subtle bg-input-bg text-center text-2xl tracking-[0.5em] font-semibold focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30"
            placeholder="000000"
            aria-label="6-stelliger Code"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full py-3.5 rounded-full text-sm font-semibold bg-primary-bg text-primary-text disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Prüfe…' : 'Bestätigen'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 text-[13px] text-muted-fg underline underline-offset-2 hover:text-foreground transition-colors"
        >
          Abbrechen und abmelden
        </button>
      </div>
    </div>
  );
}
