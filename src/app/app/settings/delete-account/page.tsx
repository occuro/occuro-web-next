'use client';

import { useState } from 'react';
import { SettingsShell, SettingsCard } from '@/components/settings-shell';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { authFehlerText, istRateLimit, wartezeitAusFehler } from '@/lib/auth-errors';
import { fehlertextAusFunktion } from '@/lib/functions-error';
import { AlertTriangle, Trash2, Loader2, Mail } from 'lucide-react';

/**
 * Konto löschen — derselbe Ablauf wie in der App (ProfileMenuModal):
 * Bestätigungscode per E-Mail anfordern (signInWithOtp), Code eingeben, die
 * Edge Function `delete-account` prüft ihn und löscht serverseitig alles.
 *
 * Vorher meldete diese Seite nur ab und schickte den Nutzer in die App.
 */
function loeschFehlerText(text: string | null): string {
  const lower = (text ?? '').toLowerCase();
  if (lower.includes('invalid') || lower.includes('expired')) {
    return 'Der Code ist ungültig oder abgelaufen. Fordere einen neuen an.';
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return 'Zu viele Versuche. Bitte warte ein paar Minuten und versuche es erneut.';
  }
  return 'Das Konto konnte nicht gelöscht werden. Bitte versuche es erneut.';
}

export default function DeleteAccountPage() {
  const { user, signOut } = useAuth();
  const supabase = createClient();
  const [schritt, setSchritt] = useState<'bestaetigen' | 'code'>('bestaetigen');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hinweis, setHinweis] = useState('');

  const isConfirmed = confirm.trim().toLowerCase() === 'löschen';

  async function codeAnfordern() {
    const email = user?.email?.trim();
    if (!email) {
      setError('Für dieses Konto ist keine E-Mail-Adresse hinterlegt.');
      return;
    }
    setBusy(true);
    setError('');
    setHinweis('');
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (otpError) {
        setError(
          istRateLimit(otpError)
            ? `Bitte warte ${wartezeitAusFehler(otpError) ?? 60} s, bevor du einen neuen Code anforderst.`
            : authFehlerText(otpError),
        );
        return;
      }
      setSchritt('code');
      setHinweis(`Wir haben dir einen Bestätigungscode an ${email} geschickt.`);
    } catch (err) {
      setError(authFehlerText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const token = code.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(token)) {
      setError('Bitte gib den Code aus der E-Mail ein.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('delete-account', {
        body: { confirmation_code: token },
      });
      if (fnError) {
        setError(loeschFehlerText(await fehlertextAusFunktion(fnError)));
        setBusy(false);
        return;
      }
      if (data && typeof data === 'object' && (data as { ok?: boolean }).ok === false) {
        setError(loeschFehlerText((data as { error?: string }).error ?? null));
        setBusy(false);
        return;
      }
      // Das Konto ist weg — lokal aufräumen und zur Startseite.
      await signOut();
    } catch {
      setError(loeschFehlerText(null));
      setBusy(false);
    }
  }

  return (
    <SettingsShell title="Account löschen" description="Diese Aktion ist endgültig und kann nicht rückgängig gemacht werden.">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-[14px] font-semibold text-red-500 dark:text-red-300">Was wird gelöscht?</h2>
            <ul className="text-[12px] text-red-700/80 dark:text-red-200/80 space-y-0.5 list-disc list-inside">
              <li>Dein Profil und Username</li>
              <li>Alle deine Events (privat und öffentlich)</li>
              <li>Deine Freundschaften, Tickets, Chats</li>
              <li>Sämtliche Medien und Uploads</li>
            </ul>
          </div>
        </div>
      </div>

      <SettingsCard>
        <div className="px-5 py-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-destructive/8 text-destructive text-[13px]">{error}</div>
          )}
          {hinweis && !error && (
            <div className="p-3 rounded-xl bg-elevated text-[13px] flex items-center gap-2">
              <Mail size={14} className="shrink-0" /> {hinweis}
            </div>
          )}

          {schritt === 'bestaetigen' ? (
            <>
              <div>
                <p className="text-[13px] text-foreground mb-3">
                  Tippe <span className="font-mono font-semibold text-red-500">löschen</span> ein, um fortzufahren.
                  Danach schicken wir dir einen Bestätigungscode per E-Mail.
                </p>
                <input
                  type="text"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="löschen"
                  className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-red-500/40"
                />
              </div>
              <button
                onClick={codeAnfordern}
                disabled={!isConfirmed || busy}
                className="w-full px-4 py-2.5 rounded-xl bg-primary-bg text-primary-text text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                Bestätigungscode anfordern
              </button>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="code" className="block text-[13px] text-foreground mb-3">
                  Gib den Code aus der E-Mail ein.
                </label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))}
                  placeholder="Code"
                  className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-center text-lg tracking-[0.3em] font-semibold focus:outline-none focus:border-red-500/40"
                />
              </div>
              <button
                onClick={handleDelete}
                disabled={busy || code.replace(/\s/g, '').length < 6}
                className="w-full px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Konto unwiderruflich löschen
              </button>
              <button
                onClick={codeAnfordern}
                disabled={busy}
                className="w-full text-[12.5px] text-muted-fg hover:text-foreground disabled:opacity-60 transition-colors"
              >
                Neuen Code anfordern
              </button>
            </>
          )}
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
