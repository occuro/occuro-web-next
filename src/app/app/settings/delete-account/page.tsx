'use client';

import { useState } from 'react';
import { SettingsShell, SettingsCard } from '@/components/settings-shell';
import { useAuth } from '@/lib/auth-context';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';

export default function DeleteAccountPage() {
  const { signOut } = useAuth();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const isConfirmed = confirm.trim().toLowerCase() === 'löschen';

  async function handleDelete() {
    if (!isConfirmed) return;
    setBusy(true);
    // Server-side deletion is handled in the mobile app via an Edge Function
    // (delete-account). Wiring that up here is on the parity backlog. For
    // now we sign the user out and instruct them to complete the deletion
    // from the mobile app.
    await signOut();
  }

  return (
    <SettingsShell title="Account löschen" description="Diese Aktion ist endgültig und kann nicht rückgängig gemacht werden.">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div className="space-y-1">
            <h2 className="text-[14px] font-semibold text-red-300">Was wird gelöscht?</h2>
            <ul className="text-[12px] text-red-200/80 space-y-0.5 list-disc list-inside">
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
          <div>
            <p className="text-[13px] text-foreground mb-3">
              Tippe <span className="font-mono font-semibold text-red-400">löschen</span> ein, um die Löschung zu bestätigen.
            </p>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder='löschen'
              className="w-full px-3 py-2.5 rounded-xl border border-border-subtle bg-elevated text-sm focus:outline-none focus:border-red-500/40"
            />
          </div>
          <button
            onClick={handleDelete}
            disabled={!isConfirmed || busy}
            className="w-full px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Konto unwiderruflich löschen
          </button>
          <p className="text-[11px] text-muted-fg leading-relaxed">
            Hinweis: Die endgültige Löschung wird derzeit nur über die mobile App ausgeführt. Wir melden dich hier ab und bitten dich,
            den Vorgang in der App abzuschließen.
          </p>
        </div>
      </SettingsCard>
    </SettingsShell>
  );
}
