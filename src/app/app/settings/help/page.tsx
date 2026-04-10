'use client';

import { SettingsShell, SettingsCard, SettingsRow } from '@/components/settings-shell';
import { Mail, MessageCircle, FileQuestion, Bug, BookOpen } from 'lucide-react';

export default function HelpSettingsPage() {
  return (
    <SettingsShell title="Hilfe & Support" description="Wir helfen dir gerne weiter.">
      <SettingsCard title="Kontakt">
        <SettingsRow
          icon={Mail}
          label="E-Mail an Support"
          subtitle="support@occuroapp.com"
          onClick={() => { window.location.href = 'mailto:support@occuroapp.com'; }}
        />
        <SettingsRow
          icon={Bug}
          label="Bug melden"
          subtitle="Hilf uns, occuro besser zu machen."
          onClick={() => { window.location.href = 'mailto:support@occuroapp.com?subject=Bug%20Report'; }}
        />
      </SettingsCard>

      <SettingsCard title="Häufige Fragen">
        <SettingsRow icon={FileQuestion} label="Wie erstelle ich ein Event?" />
        <SettingsRow icon={FileQuestion} label="Wie funktioniert die Verifizierung?" />
        <SettingsRow icon={FileQuestion} label="Wie lösche ich mein Konto?" href="/app/settings/delete-account" />
      </SettingsCard>

      <SettingsCard title="Mehr">
        <SettingsRow icon={MessageCircle} label="Community" subtitle="Tausch dich mit anderen aus." />
        <SettingsRow icon={BookOpen} label="Dokumentation" subtitle="Anleitungen & Tutorials" />
      </SettingsCard>
    </SettingsShell>
  );
}
