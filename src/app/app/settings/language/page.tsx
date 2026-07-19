'use client';

import { useEffect, useState } from 'react';
import { SettingsShell, SettingsCard, SettingsRow } from '@/components/settings-shell';
import { Check } from 'lucide-react';

const LANG_KEY = '@occuro/language';

const LANGUAGES: { code: string; label: string; flag: string }[] = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
];

export default function LanguageSettingsPage() {
  const [lang, setLang] = useState('de');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (stored) setLang(stored);
    } catch {}
  }, []);

  function selectLang(code: string) {
    setLang(code);
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {}
  }

  return (
    <SettingsShell
      title="Sprache"
      description="Wähle die Sprache der WebApp. Die mobile App nutzt eine eigene Spracheinstellung."
    >
      <SettingsCard>
        {LANGUAGES.map((l) => (
          <SettingsRow
            key={l.code}
            label={`${l.flag}  ${l.label}`}
            onClick={() => selectLang(l.code)}
            trailing={
              lang === l.code ? <Check size={16} className="text-muted-fg" strokeWidth={2.4} /> : null
            }
          />
        ))}
      </SettingsCard>
    </SettingsShell>
  );
}
