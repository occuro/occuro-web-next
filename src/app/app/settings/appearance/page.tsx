'use client';

import { useEffect, useState } from 'react';
import { SettingsShell, SettingsCard, SettingsRow } from '@/components/settings-shell';
import { Sun, Moon, Monitor, Check } from 'lucide-react';

type Theme = 'light' | 'dark' | 'system';
const THEME_KEY = '@occuro/theme';

const OPTIONS: { key: Theme; label: string; subtitle: string; icon: typeof Sun }[] = [
  { key: 'system', label: 'System', subtitle: 'Folgt dem Geräte-Theme', icon: Monitor },
  { key: 'light', label: 'Hell', subtitle: 'Helles Erscheinungsbild', icon: Sun },
  { key: 'dark', label: 'Dunkel', subtitle: 'Dunkles Erscheinungsbild', icon: Moon },
];

export default function AppearanceSettingsPage() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null;
      if (stored) setTheme(stored);
    } catch {}
  }, []);

  function applyTheme(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    // Apply immediately to <html> via class. The webapp's CSS already
    // handles the dark variants — we just need to add/remove the class.
    const root = document.documentElement;
    if (next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }

  return (
    <SettingsShell title="Erscheinungsbild" description="Wähle, wie occuro aussehen soll.">
      <SettingsCard>
        {OPTIONS.map((opt) => (
          <SettingsRow
            key={opt.key}
            icon={opt.icon}
            label={opt.label}
            subtitle={opt.subtitle}
            onClick={() => applyTheme(opt.key)}
            trailing={
              theme === opt.key ? (
                <Check size={16} className="text-violet-500" strokeWidth={2.4} />
              ) : null
            }
          />
        ))}
      </SettingsCard>
    </SettingsShell>
  );
}
