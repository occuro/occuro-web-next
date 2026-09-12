'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { OutNowWordmark } from '@/components/outnow-wordmark';
import { authFehlerText, istRateLimit, wartezeitAusFehler } from '@/lib/auth-errors';
import { PASSWORD_RULES, PASSWORD_TOO_WEAK, isStrongPassword, isValidEmail } from '@/lib/auth-validation';
import { zielNachAnmeldung } from '@/lib/onboarding';

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-foreground text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-primary-bg/10 focus:border-primary-bg/30 transition-all duration-200';

/**
 * Passwort vergessen — derselbe Weg wie in der App: Supabase schickt einen
 * CODE (die Recovery-Vorlage enthält {{ .Token }}, keinen Link), der hier
 * zusammen mit dem neuen Passwort eingegeben wird. Vorher gab es das im Web
 * gar nicht; /auth/confirmed schickte Betroffene in die App.
 *
 * Anders als die App bleibt man danach angemeldet: Ein Abmelden hier löst im
 * AuthProvider den „Sitzung abgelaufen"-Dialog aus, und wer gerade sein
 * Passwort gesetzt hat, will ohnehin hinein.
 */
export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [schritt, setSchritt] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [loading, setLoading] = useState(false);
  const [sperre, setSperre] = useState(0);

  useEffect(() => {
    const vorbelegt = new URLSearchParams(window.location.search).get('email');
    if (vorbelegt) setEmail(vorbelegt);
  }, []);

  useEffect(() => {
    if (sperre <= 0) return;
    const timer = setTimeout(() => setSperre((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [sperre]);

  const codeSenden = async () => {
    if (!isValidEmail(email)) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    if (sperre > 0) return;
    setError('');
    setHinweis('');
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) {
        if (istRateLimit(resetError)) setSperre(wartezeitAusFehler(resetError) ?? 60);
        setError(authFehlerText(resetError));
        return;
      }
      setSchritt('code');
      setHinweis(`Wir haben dir einen Code an ${email.trim()} geschickt.`);
      setSperre(60);
    } catch (err) {
      setError(authFehlerText(err));
    } finally {
      setLoading(false);
    }
  };

  const passwortSetzen = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(token)) {
      setError('Bitte gib den Code aus der E-Mail ein.');
      return;
    }
    if (!isStrongPassword(password)) {
      setError(PASSWORD_TOO_WEAK);
      return;
    }
    if (password !== confirmPassword) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }
    setError('');
    setHinweis('');
    setLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'recovery',
      });
      if (verifyError) {
        const text = verifyError.message.toLowerCase();
        setError(
          text.includes('expired') || text.includes('invalid')
            ? 'Der Code ist ungültig oder abgelaufen. Fordere einen neuen an.'
            : authFehlerText(verifyError),
        );
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        const text = updateError.message.toLowerCase();
        setError(
          text.includes('different from the old')
            ? 'Das neue Passwort muss sich vom alten unterscheiden.'
            : authFehlerText(updateError),
        );
        return;
      }
      const userId = data.user?.id;
      window.location.href = userId ? await zielNachAnmeldung(supabase, userId) : '/auth/login';
    } catch (err) {
      setError(authFehlerText(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px] animate-fade-in">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block hover:opacity-70 transition-opacity">
            <OutNowWordmark size={26} layout="stacked" />
          </Link>
          <div className="mx-auto mt-8 mb-4 w-14 h-14 rounded-2xl bg-elevated flex items-center justify-center">
            <KeyRound size={24} strokeWidth={1.6} />
          </div>
          <h1 className="text-2xl font-heading font-bold">Passwort zurücksetzen</h1>
          <p className="mt-2 text-sm text-muted-fg">
            {schritt === 'email'
              ? 'Wir senden dir einen Code zum Zurücksetzen.'
              : 'Gib den Code aus der E-Mail und dein neues Passwort ein.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-destructive/8 text-destructive text-[13px] text-center">{error}</div>
        )}
        {hinweis && !error && (
          <div className="mb-4 p-3.5 rounded-xl bg-elevated text-[13px] text-center">{hinweis}</div>
        )}

        {schritt === 'email' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void codeSenden();
            }}
            className="space-y-4"
          >
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
              />
            </div>
            <button
              type="submit"
              disabled={loading || sperre > 0}
              className="w-full py-3.5 rounded-full text-sm font-semibold bg-primary-bg text-primary-text disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Sende…' : sperre > 0 ? `Bitte warte ${sperre} s` : 'Code senden'}
            </button>
          </form>
        ) : (
          <form onSubmit={passwortSetzen} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="code" className="block text-[13px] font-medium text-foreground/70">Code aus der E-Mail</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))}
                className={`${inputClass} tracking-[0.3em] font-semibold text-center`}
                placeholder="Code"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-[13px] font-medium text-foreground/70">Neues Passwort</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-11`}
                  placeholder="Neues Passwort"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground"
                  aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {password.length > 0 && (
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
              <label htmlFor="confirm" className="block text-[13px] font-medium text-foreground/70">Passwort bestätigen</label>
              <input
                id="confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                placeholder="Passwort wiederholen"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-full text-sm font-semibold bg-primary-bg text-primary-text disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Speichere…' : 'Passwort speichern'}
            </button>
            <button
              type="button"
              onClick={() => void codeSenden()}
              disabled={loading || sperre > 0}
              className="w-full text-[13px] text-muted-fg hover:text-foreground disabled:opacity-60 transition-colors"
            >
              {sperre > 0 ? `Neuen Code anfordern (${sperre} s)` : 'Neuen Code anfordern'}
            </button>
          </form>
        )}

        <p className="text-center text-[13px] text-muted-fg mt-8">
          <Link href="/auth/login" className="font-medium text-foreground hover:opacity-70 transition-opacity">
            Zurück zur Anmeldung
          </Link>
        </p>
      </div>
    </div>
  );
}
