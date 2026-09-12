'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { OutNowWordmark } from '@/components/outnow-wordmark';
import { GoogleButton } from '@/components/google-button';
import { authFehlerText, istRateLimit, istUnbestaetigt, wartezeitAusFehler } from '@/lib/auth-errors';
import { PRIVACY_URL, TERMS_URL, isValidEmail } from '@/lib/auth-validation';
import { fehlertextAusFunktion } from '@/lib/functions-error';
import { ONBOARDING_PATH, TWO_FACTOR_PATH, sichererPfad, zielNachAnmeldung } from '@/lib/onboarding';

const FALSCHE_DATEN = 'E-Mail, Benutzername oder Passwort ist falsch.';
const inputClass =
  'w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200';

/**
 * Anmeldung — wie in der App mit E-Mail ODER Benutzername. Der
 * Benutzername-Weg läuft über die Edge Function `signin-with-username`, damit
 * die E-Mail den Server nie verlässt. Danach entscheidet zielNachAnmeldung:
 * zweiter Faktor, Einrichtung oder App.
 */
export default function LoginPage() {
  const supabase = createClient();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [unbestaetigt, setUnbestaetigt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [sperre, setSperre] = useState(0);
  const [next, setNext] = useState<string | null>(null);

  // /auth/callback leitet Fehler als ?error=… hierher weiter (englischer
  // Text von Supabase oder Google) — übersetzt statt roh anzeigen.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromCallback = params.get('error');
    if (fromCallback) {
      setError(
        /denied|cancel/i.test(fromCallback)
          ? 'Anmeldung abgebrochen.'
          : authFehlerText(fromCallback, 'sign_in'),
      );
    }
    setNext(sichererPfad(params.get('next')));
  }, []);

  useEffect(() => {
    if (sperre <= 0) return;
    const timer = setTimeout(() => setSperre((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [sperre]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const kennung = identifier.trim();
    if (!kennung) {
      setError('Bitte E-Mail oder Benutzername eingeben.');
      return;
    }
    if (!password) {
      setError('Bitte ein Passwort eingeben.');
      return;
    }
    if (sperre > 0) {
      setError(`Bitte warte ${sperre} s und versuche es erneut.`);
      return;
    }
    setError('');
    setHinweis('');
    setUnbestaetigt(false);
    setLoading(true);

    // Alles in try/catch — eine unbehandelte Ablehnung ließe den Knopf
    // sonst dauerhaft auf „Anmelden…" stehen.
    try {
      let userId: string | null = null;

      if (kennung.includes('@')) {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: kennung, password });
        if (signInError) {
          if (istUnbestaetigt(signInError)) setUnbestaetigt(true);
          if (istRateLimit(signInError)) setSperre(wartezeitAusFehler(signInError) ?? 60);
          setError(authFehlerText(signInError, 'sign_in'));
          setLoading(false);
          return;
        }
        userId = data.user?.id ?? null;
      } else {
        const { data, error: fnError } = await supabase.functions.invoke('signin-with-username', {
          body: { username: kennung, password },
        });
        if (fnError || !data?.access_token || !data?.refresh_token) {
          setError((await fehlertextAusFunktion(fnError)) ?? FALSCHE_DATEN);
          setLoading(false);
          return;
        }
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token as string,
          refresh_token: data.refresh_token as string,
        });
        if (sessionError) {
          setError(authFehlerText(sessionError, 'sign_in'));
          setLoading(false);
          return;
        }
        userId = sessionData.user?.id ?? null;
      }

      if (!userId) {
        setError('Anmeldung fehlgeschlagen. Bitte versuche es erneut.');
        setLoading(false);
        return;
      }

      // Harte Navigation, damit die Sitzungs-Cookies beim Server ankommen
      // (proxy.ts) — ein weicher Router-Wechsel würde das überspringen.
      const ziel = await zielNachAnmeldung(supabase, userId);
      window.location.href = ziel === TWO_FACTOR_PATH || ziel === ONBOARDING_PATH || !next ? ziel : next;
    } catch (err) {
      console.error('[login] threw:', err);
      setError(authFehlerText(err, 'sign_in'));
      setLoading(false);
    }
  };

  const bestaetigungErneutSenden = async () => {
    if (resending) return;
    setResending(true);
    setError('');
    setHinweis('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: identifier.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (resendError) {
        setError(authFehlerText(resendError, 'sign_up'));
        return;
      }
      setHinweis('Bestätigungs-E-Mail wurde gesendet.');
      setUnbestaetigt(false);
    } catch (err) {
      setError(authFehlerText(err, 'sign_up'));
    } finally {
      setResending(false);
    }
  };

  const vergessenHref = isValidEmail(identifier)
    ? `/auth/forgot?email=${encodeURIComponent(identifier.trim())}`
    : '/auth/forgot';

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="text-center mb-10">
          <Link href="/" className="inline-block hover:opacity-70 transition-opacity">
            <OutNowWordmark size={26} layout="stacked" />
          </Link>
          <p className="mt-2 text-sm text-muted-fg">Willkommen zurück</p>
        </div>

        <form onSubmit={handleLogin} noValidate className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px] text-center animate-fade-in-scale">
              {error}
              {unbestaetigt && isValidEmail(identifier) && (
                <button
                  type="button"
                  onClick={bestaetigungErneutSenden}
                  disabled={resending}
                  className="block mx-auto mt-2 font-semibold underline underline-offset-2 disabled:opacity-60"
                >
                  {resending ? 'Sende…' : 'Bestätigungs-E-Mail erneut senden'}
                </button>
              )}
            </div>
          )}
          {hinweis && !error && (
            <div className="p-3.5 rounded-xl bg-elevated text-[13px] text-center">{hinweis}</div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="identifier" className="block text-[13px] font-medium text-foreground/70">
              E-Mail oder Benutzername
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
              placeholder="deine@email.de oder deinname"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="block text-[13px] font-medium text-foreground/70">Passwort</label>
              <Link href={vergessenHref} className="text-[12px] text-muted-fg hover:text-foreground transition-colors">
                Passwort vergessen?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                placeholder="Passwort"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || sperre > 0}
            className="w-full py-3.5 mt-2 rounded-full text-sm font-semibold bg-primary-bg text-primary-text hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 transition-transform shadow-sm"
          >
            {loading ? 'Anmelden…' : sperre > 0 ? `Bitte warte ${sperre} s` : 'Anmelden'}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-[12px] text-muted-fg">oder</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <GoogleButton onError={setError} />
        <p className="mt-3 text-center text-[11.5px] leading-relaxed text-muted-fg">
          Mit der Anmeldung akzeptierst du die{' '}
          <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">AGB</a>
          {' '}und die{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">Datenschutzerklärung</a>
          {' '}von OutNow.
        </p>

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
