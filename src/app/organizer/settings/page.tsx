'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

export default function OrganizerSettingsPage() {
  const { user, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setMessage('Passwort muss mindestens 6 Zeichen haben.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Passwort erfolgreich geändert.');
      setNewPassword('');
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-3xl font-heading font-bold">Einstellungen</h1>

      {/* Account */}
      <section className="rounded-2xl border border-border-subtle bg-surface p-6 space-y-4">
        <h2 className="text-lg font-heading font-semibold">Account</h2>
        <div className="text-sm">
          <span className="text-muted-fg">E-Mail: </span>
          <span>{user?.email}</span>
        </div>
      </section>

      {/* Password */}
      <section className="rounded-2xl border border-border-subtle bg-surface p-6 space-y-4">
        <h2 className="text-lg font-heading font-semibold">Passwort ändern</h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Neues Passwort"
            className="w-full max-w-sm px-4 py-3 rounded-xl border border-border-subtle bg-input-bg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-primary-bg/20 transition"
          />
          {message && <p className="text-sm text-muted-fg">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-primary-bg text-primary-text hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Speichern...' : 'Passwort ändern'}
          </button>
        </form>
      </section>

      {/* Logout */}
      <section className="rounded-2xl border border-border-subtle bg-surface p-6">
        <button
          onClick={signOut}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-destructive/10 text-destructive hover:bg-destructive/20 transition"
        >
          Abmelden
        </button>
      </section>
    </div>
  );
}
