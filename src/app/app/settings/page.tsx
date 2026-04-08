'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import {
  Globe, Palette, Bell, Shield, MapPin, UserX, Lock, Mail,
  HelpCircle, FileText, Info, LogOut, Trash2, ChevronRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type SettingsView = 'main' | 'password' | 'email';

export default function SettingsPage() {
  const { user, profile, userType, signOut } = useAuth();
  const [view, setView] = useState<SettingsView>('main');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) { setMessage('Mindestens 6 Zeichen.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setMessage(error ? error.message : 'Passwort erfolgreich geändert.');
    if (!error) setNewPassword('');
    setLoading(false);
  }

  if (view === 'password') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <button onClick={() => setView('main')} className="text-[13px] text-muted-fg hover:text-foreground transition-colors">
          &larr; Zurück
        </button>
        <h1 className="text-2xl font-heading font-bold">Passwort ändern</h1>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Neues Passwort"
            className="w-full max-w-sm px-4 py-3 rounded-xl border border-border-subtle bg-input-bg text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
          />
          {message && <p className="text-[13px] text-muted-fg">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-primary-bg text-primary-text hover:opacity-90 disabled:opacity-50 transition"
          >
            {loading ? 'Speichern...' : 'Passwort ändern'}
          </button>
        </form>
      </div>
    );
  }

  const groups: { title: string; items: { label: string; subtitle?: string; icon: LucideIcon; iconBg: string; action?: () => void; danger?: boolean }[] }[] = [
    {
      title: 'Allgemein',
      items: [
        { label: 'Sprache', subtitle: 'Deutsch', icon: Globe, iconBg: 'bg-blue-50 text-blue-600' },
        { label: 'Erscheinungsbild', subtitle: 'System', icon: Palette, iconBg: 'bg-purple-50 text-purple-600' },
        { label: 'Benachrichtigungen', icon: Bell, iconBg: 'bg-orange-50 text-orange-600' },
      ],
    },
    {
      title: 'Privatsphäre',
      items: [
        { label: 'Privatsphäre', icon: Shield, iconBg: 'bg-green-50 text-green-600' },
        ...(userType !== 'organization' ? [
          { label: 'Standort', icon: MapPin, iconBg: 'bg-teal-50 text-teal-600' } as const,
          { label: 'Blockierte Nutzer', icon: UserX, iconBg: 'bg-red-50 text-red-500' } as const,
        ] : []),
      ],
    },
    {
      title: 'Sicherheit',
      items: [
        { label: 'Passwort ändern', icon: Lock, iconBg: 'bg-indigo-50 text-indigo-600', action: () => setView('password') },
        { label: 'E-Mail ändern', subtitle: user?.email, icon: Mail, iconBg: 'bg-cyan-50 text-cyan-600' },
      ],
    },
    {
      title: 'Hilfe & Rechtliches',
      items: [
        { label: 'Hilfe & Support', icon: HelpCircle, iconBg: 'bg-amber-50 text-amber-600' },
        { label: 'AGB & Rechtliches', icon: FileText, iconBg: 'bg-gray-100 text-gray-600' },
        { label: 'Über occuro', subtitle: 'Version 1.0.6', icon: Info, iconBg: 'bg-violet-50 text-violet-600' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Abmelden', icon: LogOut, iconBg: 'bg-red-50 text-red-500', action: signOut, danger: true },
        { label: 'Account löschen', icon: Trash2, iconBg: 'bg-red-50 text-red-500', danger: true },
      ],
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-3xl font-heading font-bold tracking-tight">Einstellungen</h1>

      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="text-[12px] font-medium text-muted-fg uppercase tracking-wider mb-2 px-1">{group.title}</h2>
          <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden divide-y divide-border-subtle">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={item.action}
                  className={`w-full flex items-center gap-3.5 px-4 py-3.5 hover:bg-elevated/50 transition-colors text-left ${
                    item.danger ? 'text-red-500' : ''
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium">{item.label}</p>
                    {item.subtitle && <p className="text-[12px] text-muted-fg truncate">{item.subtitle}</p>}
                  </div>
                  {!item.danger && <ChevronRight size={16} className="text-muted-fg/40 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
