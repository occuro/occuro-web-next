'use client';

import { useState } from 'react';
import { SettingsShell, SettingsCard } from '@/components/settings-shell';
import { createClient } from '@/lib/supabase/client';
import { Lock, Check, AlertTriangle } from 'lucide-react';

export default function PasswordSettingsPage() {
  const supabase = createClient();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen haben.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('Passwort muss mindestens einen Buchstaben und eine Zahl enthalten.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setNewPassword('');
    setConfirm('');
  }

  const checks = [
    { ok: newPassword.length >= 8, label: 'Mindestens 8 Zeichen' },
    { ok: /[A-Za-z]/.test(newPassword), label: 'Mindestens ein Buchstabe' },
    { ok: /\d/.test(newPassword), label: 'Mindestens eine Zahl' },
    { ok: /[^A-Za-z0-9]/.test(newPassword), label: 'Mindestens ein Sonderzeichen' },
  ];

  return (
    <SettingsShell title="Passwort ändern" description="Wähle ein starkes neues Passwort für dein Konto.">
      <SettingsCard>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-foreground/80">Neues Passwort</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
              />
            </div>
            {newPassword.length > 0 && (
              <div className="space-y-1 mt-2">
                {checks.map((c) => (
                  <div key={c.label} className="flex items-center gap-2 text-[11px]">
                    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                      c.ok ? 'bg-green-500/20' : 'bg-muted'
                    }`}>
                      {c.ok && <Check size={9} className="text-green-500" strokeWidth={3} />}
                    </div>
                    <span className={c.ok ? 'text-green-400' : 'text-muted-fg'}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-foreground/80">Passwort bestätigen</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[12px] text-red-400">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-[12px] text-green-400">
              <Check size={13} className="mt-0.5 flex-shrink-0" />
              <span>Passwort erfolgreich geändert.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !newPassword || !confirm}
            className="w-full px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Speichern…' : 'Passwort ändern'}
          </button>
        </form>
      </SettingsCard>
    </SettingsShell>
  );
}
