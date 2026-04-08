'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  Plus, Search, X, CalendarDays, Radio, Clock, ImageOff,
  Heart, CheckCircle2, AlertTriangle, ShieldCheck,
} from 'lucide-react';

type EventTab = 'upcoming' | 'live' | 'past';

export default function OrganizerEventsPage() {
  const { user, organization } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EventTab>('upcoming');
  const [search, setSearch] = useState('');
  const supabase = createClient();
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  useEffect(() => {
    if (user) fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchEvents() {
    let query = supabase.from('events').select('*').order('date', { ascending: true });
    if (organization?.id) query = query.eq('organizer_org_id', organization.id);
    else query = query.eq('organizer_profile_id', user!.id);
    const { data } = await query;
    setEvents(data ?? []);
    setLoading(false);
  }

  const isLive = (e: Event) => {
    const start = new Date(`${e.date}T${e.time}`);
    const end = e.end_date && e.end_time
      ? new Date(`${e.end_date}T${e.end_time}`)
      : new Date(start.getTime() + 4 * 3600000);
    return now >= start && now <= end;
  };

  const upcoming = events.filter((e) => e.date >= today && !isLive(e));
  const live = events.filter(isLive);
  const past = events.filter((e) => e.date < today && !isLive(e));

  const currentEvents = tab === 'upcoming' ? upcoming : tab === 'live' ? live : past;
  const filtered = search
    ? currentEvents.filter((e) =>
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.location.toLowerCase().includes(search.toLowerCase()) ||
        e.category.toLowerCase().includes(search.toLowerCase())
      )
    : currentEvents;

  const tabs: { key: EventTab; label: string; count: number; icon: any; liveBg?: boolean }[] = [
    { key: 'upcoming', label: 'Bevorstehend', count: upcoming.length, icon: CalendarDays },
    { key: 'live', label: 'Live', count: live.length, icon: Radio, liveBg: live.length > 0 },
    { key: 'past', label: 'Vergangen', count: past.length, icon: Clock },
  ];

  // Verification alert
  const isVerified = organization?.verified ?? false;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-heading font-bold tracking-tight">Meine Events</h1>
        <Link href="/organizer/events/create" className="flex items-center gap-2 px-6 py-3 rounded-full text-[13px] font-semibold bg-primary-bg text-primary-text hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-sm">
          <Plus size={16} strokeWidth={2.2} /> Neues Event
        </Link>
      </div>

      {/* Verification Alert */}
      {!isVerified && organization && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle size={20} className="text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[13px] font-medium text-amber-800 dark:text-amber-200">Organisation noch nicht verifiziert</p>
            <p className="text-[12px] text-amber-600 dark:text-amber-400">Verifiziere deine Organisation, um mehr Vertrauen bei Besuchern aufzubauen.</p>
          </div>
          <ShieldCheck size={16} className="text-amber-500 flex-shrink-0" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSearch(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                tab === t.key
                  ? t.liveBg && t.key === 'live'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-primary-bg text-primary-text shadow-sm'
                  : 'bg-surface border border-border-subtle text-muted-fg hover:text-foreground hover:border-border-strong'
              }`}
            >
              <Icon size={15} strokeWidth={tab === t.key ? 2.2 : 1.8} />
              {t.label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-white/20' : 'bg-muted'
              }`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder="Events filtern..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Events */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <CalendarDays size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {search ? 'Keine Events gefunden' : tab === 'upcoming' ? 'Keine bevorstehenden Events' : tab === 'live' ? 'Keine laufenden Events' : 'Keine vergangenen Events'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {filtered.map((event) => (
            <Link
              key={event.id}
              href={`/organizer/events/${event.id}`}
              className={`group flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200 ${
                tab === 'past' ? 'opacity-60' : ''
              }`}
            >
              {/* Live indicator */}
              {isLive(event) && (
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              )}
              <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {event.image_url ? (
                  <img src={event.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageOff size={16} strokeWidth={1.4} className="text-muted-fg/30" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
                <p className="text-[12px] text-muted-fg mt-0.5">
                  {formatDate(event.date)} · {formatTime(event.time)} · {event.location}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white flex-shrink-0" style={{ backgroundColor: getCategoryColor(event.category) }}>
                {event.category}
              </span>
              <div className="text-right text-[12px] text-muted-fg flex-shrink-0 space-y-0.5">
                <p className="flex items-center justify-end gap-1"><Heart size={11} />{event.interested_count}</p>
                <p className="flex items-center justify-end gap-1"><CheckCircle2 size={11} />{event.confirmed_count}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
