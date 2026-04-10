'use client';

import { useState } from 'react';
import { SettingsShell, SettingsCard } from '@/components/settings-shell';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { Mail, Check, AlertTriangle } from 'lucide-react';

export default function EmailSettingsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }
    if (newEmail === user?.email) {
      setError('Das ist bereits deine aktuelle E-Mail.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ email: newEmail });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    setNewEmail('');
  }

  return (
    <SettingsShell title="E-Mail ändern" description="Ändere die E-Mail-Adresse deines Kontos.">
      <SettingsCard>
        <div className="px-5 py-4 border-b border-border-subtle">
          <p className="text-[11px] font-semibold text-muted-fg uppercase tracking-wider">Aktuelle E-Mail</p>
          <p className="text-[14px] mt-1">{user?.email}</p>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
          <div className="space-y-2">
            <label className="text-[12px] font-semibold text-foreground/80">Neue E-Mail</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-fg" />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="neue@email.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-violet-500/40"
              />
            </div>
            <p className="text-[11px] text-muted-fg">
              Du erhältst eine Bestätigungsmail an die neue Adresse. Erst nach Klick auf den Link wird die Änderung wirksam.
            </p>
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
              <span>Bestätigungsmail wurde an {newEmail || 'die neue Adresse'} gesendet.</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !newEmail}
            className="w-full px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Speichern…' : 'E-Mail ändern'}
          </button>
        </form>
      </SettingsCard>
    </SettingsShell>
  );
}
