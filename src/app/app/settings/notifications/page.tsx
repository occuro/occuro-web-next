'use client';

import { useEffect, useState } from 'react';
import { SettingsShell, SettingsCard, SettingsRow, Toggle } from '@/components/settings-shell';
import { useAuth } from '@/lib/auth-context';
import {
  Bell, MessageCircle, Users, UserPlus, Calendar, Megaphone,
  Star, Rss,
} from 'lucide-react';

const PREFS_KEY = '@occuro/notification_prefs';

type PrefKey =
  | 'friend_requests'
  | 'organizer_events'
  | 'event_invitations'
  | 'event_reminders'
  | 'event_feed'
  | 'chat_messages'
  | 'chat_events'
  | 'org_new_followers'
  | 'org_milestones'
  | 'org_event_reminders'
  | 'event_rsvp';

const DEFAULT_PREFS: Record<PrefKey, boolean> = {
  friend_requests: true,
  organizer_events: true,
  event_invitations: true,
  event_reminders: true,
  event_feed: true,
  chat_messages: true,
  chat_events: true,
  org_new_followers: true,
  org_milestones: true,
  org_event_reminders: true,
  event_rsvp: true,
};

const INDIVIDUAL_GROUPS: { title: string; items: { key: PrefKey; label: string; subtitle?: string; icon: typeof Bell }[] }[] = [
  {
    title: 'Chat',
    items: [
      { key: 'chat_messages', label: 'Neue Nachrichten', subtitle: 'Direktnachrichten von Freunden', icon: MessageCircle },
      { key: 'chat_events', label: 'Event-Chats', subtitle: 'Aktivität in Event-Gruppen', icon: Users },
    ],
  },
  {
    title: 'Soziales',
    items: [
      { key: 'friend_requests', label: 'Freundschaftsanfragen', icon: UserPlus },
      { key: 'event_invitations', label: 'Event-Einladungen', icon: Users },
    ],
  },
  {
    title: 'Events',
    items: [
      { key: 'event_reminders', label: 'Event-Erinnerungen', subtitle: 'Vor dem Beginn deiner Events', icon: Calendar },
      { key: 'event_feed', label: 'Event-Feed', subtitle: 'Neue Posts in Events, an denen du teilnimmst', icon: Rss },
      { key: 'organizer_events', label: 'Veranstalter-Updates', subtitle: 'Neue Events von Veranstaltern, denen du folgst', icon: Star },
    ],
  },
];

const ORG_GROUPS: { title: string; items: { key: PrefKey; label: string; subtitle?: string; icon: typeof Bell }[] }[] = [
  {
    title: 'Chat',
    items: [
      { key: 'chat_messages', label: 'Neue Nachrichten', icon: MessageCircle },
      { key: 'chat_events', label: 'Event-Chats', icon: Users },
    ],
  },
  {
    title: 'Community',
    items: [
      { key: 'org_new_followers', label: 'Neue Follower', icon: UserPlus },
      { key: 'org_milestones', label: 'Meilensteine', subtitle: '10, 50, 100… Interessenten', icon: Megaphone },
      { key: 'event_rsvp', label: 'Neue RSVPs', subtitle: 'Wenn jemand "Zusagen" klickt', icon: Bell },
    ],
  },
  {
    title: 'Erinnerungen',
    items: [
      { key: 'org_event_reminders', label: 'Event-Erinnerungen', subtitle: '24h vor Beginn', icon: Calendar },
    ],
  },
];

export default function NotificationsSettingsPage() {
  const { userType } = useAuth();
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(DEFAULT_PREFS);
  const groups = userType === 'organization' ? ORG_GROUPS : INDIVIDUAL_GROUPS;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) {
        setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(stored) });
      }
    } catch {}
  }, []);

  function update(key: PrefKey, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {}
  }

  return (
    <SettingsShell
      title="Benachrichtigungen"
      description="Wähle, welche In-App-Benachrichtigungen du erhalten möchtest."
    >
      {groups.map((group) => (
        <SettingsCard key={group.title} title={group.title}>
          {group.items.map((item) => (
            <SettingsRow
              key={item.key}
              icon={item.icon}
              label={item.label}
              subtitle={item.subtitle}
              trailing={<Toggle checked={prefs[item.key]} onChange={(v) => update(item.key, v)} />}
            />
          ))}
        </SettingsCard>
      ))}
    </SettingsShell>
  );
}
