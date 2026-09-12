'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Eye, EyeOff, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { OutNowWordmark } from '@/components/outnow-wordmark';
import { GoogleButton } from '@/components/google-button';
import { authFehlerText, istRateLimit, istUnbestaetigt, wartezeitAusFehler } from '@/lib/auth-errors';
import {
  PASSWORD_RULES,
  PASSWORD_TOO_WEAK,
  PRIVACY_URL,
  TERMS_URL,
  isStrongPassword,
  isValidEmail,
} from '@/lib/auth-validation';
import { ONBOARDING_PATH } from '@/lib/onboarding';

const BEREITS_REGISTRIERT = 'Diese E-Mail ist bereits registriert. Bitte melde dich an.';
const inputClass =
  'w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200';

/** Sekunden-Countdown für Sperren nach Ratenlimit bzw. erneutem Senden. */
function useCountdown() {
  const [sekunden, setSekunden] = useState(0);
  useEffect(() => {
    if (sekunden <= 0) return;
    const timer = setTimeout(() => setSekunden((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [sekunden]);
  return [sekunden, setSekunden] as const;
}

/**
 * Registrierung — derselbe Weg wie in der App seit 1.3.1: Das Formular legt
 * nur das Konto an (E-Mail, Passwort, Zustimmung). Kontotyp, Benutzername,
 * Ort und Bild kommen danach in /auth/onboarding, für E-Mail- und
 * Google-Konten gleich.
 *
 * Vorher fragte diese Seite Kontotyp und Namen ab, ohne Zustimmung zu AGB und
 * Datenschutz, mit 6-Zeichen-Passwort und ohne Wiederholung — und zeigte
 * Serverfehler auf Englisch.
 */
export default function RegisterPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [bereitsRegistriert, setBereitsRegistriert] = useState(false);
  const [hinweis, setHinweis] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const [sperre, setSperre] = useCountdown();
  const [resendSperre, setResendSperre] = useCountdown();

  const emailFehler = submitted && !isValidEmail(email) ? 'Bitte eine gültige E-Mail eingeben.' : '';
  const passwortFehler = submitted && !isStrongPassword(password) ? PASSWORD_TOO_WEAK : '';
  const wiederholungFehler =
    submitted && !confirmPassword
      ? 'Bitte bestätige dein Passwort.'
      : submitted && confirmPassword !== password
        ? 'Die Passwörter stimmen nicht überein.'
        : '';
  const formOk =
    isValidEmail(email) && isStrongPassword(password) && confirmPassword === password && acceptedTerms;

  const melde = (err: unknown, context: 'sign_up' | 'sign_in') => {
    if (istRateLimit(err)) setSperre(wartezeitAusFehler(err) ?? 60);
    setError(authFehlerText(err, context));
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setBereitsRegistriert(false);
    // Die Zustimmung ist ein Riegel im Ablauf, nicht nur die Farbe des
    // Knopfes — in der App war genau das einmal nur Dekoration.
    if (!formOk) {
      setError(!acceptedTerms && isValidEmail(email) && isStrongPassword(password) && confirmPassword === password
        ? 'Bitte akzeptiere die AGB und die Datenschutzerklärung.'
        : '');
      return;
    }
    if (sperre > 0) {
      setError(`Bitte warte ${sperre} s und versuche es erneut.`);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Ohne emailRedirectTo landet der Link auf der Site-URL statt auf
          // dem Callback, und die Bestätigung stellt keine Sitzung her.
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (signUpError) {
        melde(signUpError, 'sign_up');
        return;
      }
      // Bei schon bestätigter Adresse antwortet Supabase OHNE Fehler, aber mit
      // leeren identities — und verschickt keine Mail. Ohne diese Prüfung
      // wartete der Nutzer auf eine Bestätigung, die nie kommt.
      const identities = data.user?.identities;
      if (data.user && Array.isArray(identities) && identities.length === 0) {
        setError(BEREITS_REGISTRIERT);
        setBereitsRegistriert(true);
        return;
      }
      if (data.session) {
        window.location.href = ONBOARDING_PATH;
        return;
      }
      setPending(true);
    } catch (err) {
      melde(err, 'sign_up');
    } finally {
      setLoading(false);
    }
  };

  // „Ich habe bestätigt": anmelden und in die Einrichtung. Harte Navigation,
  // damit die Sitzungs-Cookies beim Server ankommen (wie beim Login).
  const letzterAutoVersuch = useRef(0);
  const autoGesperrtBis = useRef(0);
  const anmeldenNachBestaetigung = useCallback(async (still: boolean) => {
    if (!still) {
      setError('');
      setHinweis('');
      setLoading(true);
    }
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        if (still) {
          if (istRateLimit(signInError)) {
            autoGesperrtBis.current = Date.now() + (wartezeitAusFehler(signInError) ?? 60) * 1000;
          }
          return;
        }
        if (istUnbestaetigt(signInError)) {
          setError('Deine E-Mail ist noch nicht bestätigt. Öffne den Link in der Mail und versuche es dann erneut.');
          return;
        }
        if (istRateLimit(signInError)) setSperre(wartezeitAusFehler(signInError) ?? 60);
        setError(authFehlerText(signInError, 'sign_in'));
        return;
      }
      window.location.href = ONBOARDING_PATH;
    } catch (err) {
      if (!still) setError(authFehlerText(err, 'sign_in'));
    } finally {
      if (!still) setLoading(false);
    }
  }, [email, password, setSperre, supabase]);

  // Wer den Link in einem anderen Tab öffnet und zurückkommt, soll nicht
  // noch einmal klicken müssen — das Gegenstück zum AppState-Listener der App.
  useEffect(() => {
    if (!pending) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now < autoGesperrtBis.current || now - letzterAutoVersuch.current < 3000) return;
      letzterAutoVersuch.current = now;
      void anmeldenNachBestaetigung(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pending, anmeldenNachBestaetigung]);

  const handleResend = async () => {
    if (resending || resendSperre > 0) return;
    setResending(true);
    setError('');
    setHinweis('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (resendError) {
        setError(authFehlerText(resendError, 'sign_up'));
        if (istRateLimit(resendError)) setResendSperre(wartezeitAusFehler(resendError) ?? 60);
        return;
      }
      setHinweis('Bestätigungs-E-Mail wurde gesendet.');
      setResendSperre(30);
    } catch (err) {
      setError(authFehlerText(err, 'sign_up'));
    } finally {
      setResending(false);
    }
  };

  if (pending) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px] text-center animate-fade-in">
          <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center">
            <MailCheck size={26} strokeWidth={1.6} />
          </div>
          <h1 className="text-2xl font-heading font-bold">E-Mail bestätigen</h1>
          <p className="mt-3 text-sm text-muted-fg leading-relaxed">
            Bestätigungslink wurde an <strong className="text-foreground">{email.trim()}</strong> gesendet.
            Nach der Bestätigung kannst du direkt starten.
          </p>

          {error && (
            <div className="mt-6 p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px]">{error}</div>
          )}
          {hinweis && !error && (
            <div className="mt-6 p-3.5 rounded-xl bg-elevated text-foreground text-[13px]">{hinweis}</div>
          )}

          <button
            type="button"
            onClick={() => void anmeldenNachBestaetigung(false)}
            disabled={loading || sperre > 0}
            className="w-full py-3.5 mt-6 rounded-full text-sm font-semibold bg-primary-bg text-primary-text hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 transition-transform shadow-sm"
          >
            {loading ? 'Einen Moment…' : sperre > 0 ? `Bitte warte ${sperre} s` : 'Ich habe bestätigt'}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendSperre > 0}
            className="w-full py-3 mt-3 rounded-full text-sm font-medium border border-border-strong hover:bg-elevated disabled:opacity-50 transition-colors"
          >
            {resending
              ? 'Sende…'
              : resendSperre > 0
                ? `Erneut senden (${resendSperre} s)`
                : 'Bestätigungs-E-Mail erneut senden'}
          </button>
          <p className="mt-6 text-[12px] text-muted-fg">
            Keine Mail? Schau auch im Spam-Ordner nach.
          </p>
          <Link href="/auth/login" className="inline-block mt-4 text-[13px] font-medium hover:opacity-70 transition-opacity">
            Zur Anmeldung zurück
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="text-center mb-10">
          <Link href="/" className="inline-block hover:opacity-70 transition-opacity">
            <OutNowWordmark size={26} layout="stacked" />
          </Link>
          <p className="mt-2 text-sm text-muted-fg">Erstelle dein OutNow Konto und entdecke Events</p>
        </div>

        <form onSubmit={handleRegister} noValidate className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px] text-center animate-fade-in-scale">
              {error}
              {bereitsRegistriert && (
                <>
                  {' '}
                  <Link href="/auth/login" className="font-semibold underline">Zur Anmeldung</Link>
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[13px] font-medium text-foreground/70">E-Mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="deine@email.de"
              aria-invalid={Boolean(emailFehler)}
            />
            {emailFehler && <p className="text-[12px] text-destructive">{emailFehler}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[13px] font-medium text-foreground/70">Passwort</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-11`}
                placeholder="Passwort"
                aria-invalid={Boolean(passwortFehler)}
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
            {(password.length > 0 || submitted) && (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <li key={rule.label} className={`flex items-center gap-1.5 text-[11.5px] ${ok ? 'text-foreground' : 'text-muted-fg'}`}>
                      <Check size={12} className={ok ? 'opacity-100' : 'opacity-30'} />
                      {rule.label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-[13px] font-medium text-foreground/70">Passwort bestätigen</label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              placeholder="Passwort wiederholen"
              aria-invalid={Boolean(wiederholungFehler)}
            />
            {wiederholungFehler && <p className="text-[12px] text-destructive">{wiederholungFehler}</p>}
          </div>

          <label className="flex items-start gap-3 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => {
                setAcceptedTerms(e.target.checked);
                if (e.target.checked) setError('');
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary-bg)]"
            />
            <span className="text-[12.5px] leading-relaxed text-muted-fg">
              Ich akzeptiere die{' '}
              <a href={TERMS_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">AGB</a>
              {' '}und die{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">Datenschutzerklärung</a>
              {' '}von OutNow.
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || sperre > 0}
            className="w-full py-3.5 mt-2 rounded-full text-sm font-semibold bg-primary-bg text-primary-text hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 transition-transform shadow-sm"
          >
            {loading ? 'Registrieren…' : sperre > 0 ? `Bitte warte ${sperre} s` : 'Registrieren'}
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
          Du hast schon ein Konto?{' '}
          <Link href="/auth/login" className="font-medium text-foreground hover:opacity-70 transition-opacity">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
