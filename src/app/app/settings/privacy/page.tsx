'use client';

import { useEffect, useState } from 'react';
import { SettingsShell, SettingsCard, SettingsRow, Toggle } from '@/components/settings-shell';
import { Eye, EyeOff, Users, Shield } from 'lucide-react';

const PRIVACY_KEY = '@occuro/privacy_prefs';

interface PrivacyPrefs {
  show_in_search: boolean;
  show_attended_events: boolean;
  allow_friend_requests: boolean;
}

const DEFAULTS: PrivacyPrefs = {
  show_in_search: true,
  show_attended_events: true,
  allow_friend_requests: true,
};

export default function PrivacySettingsPage() {
  const [prefs, setPrefs] = useState<PrivacyPrefs>(DEFAULTS);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRIVACY_KEY);
      if (stored) setPrefs({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch {}
  }, []);

  function update<K extends keyof PrivacyPrefs>(key: K, value: PrivacyPrefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      localStorage.setItem(PRIVACY_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <SettingsShell title="Privatsphäre" description="Lege fest, wer dich sehen und kontaktieren darf.">
      <SettingsCard title="Sichtbarkeit">
        <SettingsRow
          icon={Eye}
          label="In Suche auffindbar"
          subtitle="Andere User können dein Profil über die Suche finden."
          trailing={<Toggle checked={prefs.show_in_search} onChange={(v) => update('show_in_search', v)} />}
        />
        <SettingsRow
          icon={EyeOff}
          label="Besuchte Events anzeigen"
          subtitle="Zeige in deinem Profil, an welchen Events du teilgenommen hast."
          trailing={<Toggle checked={prefs.show_attended_events} onChange={(v) => update('show_attended_events', v)} />}
        />
      </SettingsCard>

      <SettingsCard title="Kontakt">
        <SettingsRow
          icon={Users}
          label="Freundschaftsanfragen erlauben"
          subtitle="Wenn aus, kann dir niemand neue Anfragen senden."
          trailing={<Toggle checked={prefs.allow_friend_requests} onChange={(v) => update('allow_friend_requests', v)} />}
        />
      </SettingsCard>

      <div className="rounded-2xl border border-border-subtle bg-surface px-5 py-4">
        <div className="flex items-start gap-2.5">
          <Shield size={14} className="text-violet-500 mt-0.5 flex-shrink-0" />
          <p className="text-[12px] text-muted-fg leading-relaxed">
            Diese Einstellungen werden derzeit nur in der mobilen App vollständig erzwungen.
            In der WebApp werden sie als Präferenzen gespeichert und in Kürze für alle Funktionen aktiv.
          </p>
        </div>
      </div>
    </SettingsShell>
  );
}
