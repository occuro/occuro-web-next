'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  Globe, Palette, Bell, Shield, MapPin, UserX, Lock, Mail,
  HelpCircle, FileText, Info, LogOut, Trash2, ChevronRight,
  type LucideIcon,
} from 'lucide-react';

interface SettingsItem {
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  href?: string;
  action?: () => void;
  danger?: boolean;
}

export default function SettingsPage() {
  const { user, userType, signOut } = useAuth();

  const groups: { title: string; items: SettingsItem[] }[] = [
    {
      title: 'Allgemein',
      items: [
        { label: 'Sprache', subtitle: 'Deutsch', icon: Globe, href: '/app/settings/language' },
        { label: 'Erscheinungsbild', subtitle: 'System', icon: Palette, href: '/app/settings/appearance' },
        { label: 'Benachrichtigungen', icon: Bell, href: '/app/settings/notifications' },
      ],
    },
    {
      title: 'Privatsphäre',
      items: [
        { label: 'Privatsphäre', icon: Shield, href: '/app/settings/privacy' },
        ...(userType !== 'organization'
          ? [
              { label: 'Standort', icon: MapPin, href: '/app/settings/location' } as SettingsItem,
              { label: 'Blockierte Nutzer', icon: UserX, href: '/app/settings/blocked' } as SettingsItem,
            ]
          : []),
      ],
    },
    {
      title: 'Sicherheit',
      items: [
        { label: 'Passwort ändern', icon: Lock, href: '/app/settings/password' },
        { label: 'E-Mail ändern', subtitle: user?.email ?? undefined, icon: Mail, href: '/app/settings/email' },
      ],
    },
    {
      title: 'Hilfe & Rechtliches',
      items: [
        { label: 'Hilfe & Support', icon: HelpCircle, href: '/app/settings/help' },
        { label: 'AGB & Rechtliches', icon: FileText, href: '/app/settings/legal' },
        { label: 'Über occuro', subtitle: 'Version 1.0.6', icon: Info, href: '/app/settings/about' },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Abmelden', icon: LogOut, action: signOut, danger: true },
        { label: 'Account löschen', icon: Trash2, href: '/app/settings/delete-account', danger: true },
      ],
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-fg mt-1">Verwalte dein Konto und deine Präferenzen</p>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="text-[11px] font-semibold text-muted-fg uppercase tracking-wider mb-2 px-1">
            {group.title}
          </h2>
          <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden divide-y divide-border-subtle">
            {group.items.map((item) => <SettingsRow key={item.label} item={item} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SettingsRow({ item }: { item: SettingsItem }) {
  const Icon = item.icon;
  const className = `w-full flex items-center gap-3.5 px-4 py-3.5 transition-colors text-left group ${
    item.danger
      ? 'hover:bg-red-500/5 text-red-400'
      : 'hover:bg-elevated/50'
  }`;
  const inner = (
    <>
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
          item.danger
            ? 'bg-red-500/10 text-red-400 group-hover:bg-red-500/15'
            : 'bg-muted text-foreground/70 group-hover:bg-elevated group-hover:text-foreground'
        }`}
      >
        <Icon size={16} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium">{item.label}</p>
        {item.subtitle && (
          <p className="text-[12px] text-muted-fg truncate">{item.subtitle}</p>
        )}
      </div>
      {!item.danger && (
        <ChevronRight size={16} className="text-muted-fg/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all flex-shrink-0" />
      )}
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={item.action} className={className}>
      {inner}
    </button>
  );
}
