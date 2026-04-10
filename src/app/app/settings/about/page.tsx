'use client';

import { SettingsShell, SettingsCard, SettingsRow } from '@/components/settings-shell';
import { Globe, Mail, FileText, Code2, Heart } from 'lucide-react';

export default function AboutSettingsPage() {
  return (
    <SettingsShell title="Über occuro">
      <div className="text-center py-8 space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-violet-500/15">
          <Heart size={28} className="text-violet-500" strokeWidth={2} />
        </div>
        <h2 className="text-xl font-heading font-bold tracking-tight">occuro</h2>
        <p className="text-sm text-muted-fg">Version 1.0.6 · WebApp</p>
      </div>

      <SettingsCard title="Über uns">
        <SettingsRow icon={Heart} label="Unsere Mission" subtitle="Menschen offline zusammenbringen" />
        <SettingsRow icon={Globe} label="Webseite" subtitle="occuroapp.com" href="/" />
        <SettingsRow icon={Mail} label="Kontakt" subtitle="support@occuroapp.com" />
      </SettingsCard>

      <SettingsCard title="Mehr">
        <SettingsRow icon={FileText} label="Changelog" subtitle="Was ist neu?" />
        <SettingsRow icon={Code2} label="Open Source" subtitle="Wir lieben Open Source" />
      </SettingsCard>

      <p className="text-center text-[11px] text-muted-fg pt-2">
        Mit Liebe gemacht in Wien.
      </p>
    </SettingsShell>
  );
}
