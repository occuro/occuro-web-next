'use client';

import { useEffect, useState } from 'react';
import { SettingsShell, SettingsCard, SettingsRow, Toggle } from '@/components/settings-shell';
import { MapPin, Navigation } from 'lucide-react';

const KEY = '@occuro/location_prefs';

export default function LocationSettingsPage() {
  const [prefs, setPrefs] = useState({ allow_location: true, share_live: false });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) setPrefs({ ...prefs, ...JSON.parse(stored) });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof typeof prefs>(key: K, value: typeof prefs[K]) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <SettingsShell title="Standort" description="Verwalte, wie occuro deinen Standort verwendet.">
      <SettingsCard>
        <SettingsRow
          icon={MapPin}
          label="Standort verwenden"
          subtitle="Zeige Events in deiner Nähe basierend auf deinem ungefähren Standort."
          trailing={<Toggle checked={prefs.allow_location} onChange={(v) => update('allow_location', v)} />}
        />
        <SettingsRow
          icon={Navigation}
          label="Live-Standort bei Events teilen"
          subtitle="Erlaube Freunden, dich bei Events live zu finden."
          trailing={<Toggle checked={prefs.share_live} onChange={(v) => update('share_live', v)} />}
        />
      </SettingsCard>

      <div className="text-[11px] text-muted-fg px-1">
        Standort wird nur clientseitig verwendet — wir tracken dich nicht im Hintergrund.
      </div>
    </SettingsShell>
  );
}
