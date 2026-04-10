'use client';

import { SettingsShell, SettingsCard, SettingsRow } from '@/components/settings-shell';
import { FileText, Shield, Scale, Cookie } from 'lucide-react';

export default function LegalSettingsPage() {
  return (
    <SettingsShell title="AGB & Rechtliches">
      <SettingsCard>
        <SettingsRow
          icon={FileText}
          label="Allgemeine Geschäftsbedingungen"
          subtitle="Unsere Nutzungsbedingungen"
          href="/agb"
        />
        <SettingsRow
          icon={Shield}
          label="Datenschutzerklärung"
          subtitle="Wie wir mit deinen Daten umgehen"
          href="/datenschutz"
        />
        <SettingsRow
          icon={Cookie}
          label="Cookie-Richtlinie"
          subtitle="Welche Cookies wir verwenden"
        />
        <SettingsRow
          icon={Scale}
          label="Impressum"
          subtitle="Anbieterkennzeichnung"
          href="/impressum"
        />
      </SettingsCard>
    </SettingsShell>
  );
}
