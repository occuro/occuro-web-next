'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime } from '@/lib/utils';
import Link from 'next/link';
import {
  Ticket, CalendarDays, Radio, Clock, ScanLine, ImageOff,
  Heart, CheckCircle2,
} from 'lucide-react';

type TicketTab = 'live' | 'upcoming' | 'past';

export default function OrganizerTicketsPage() {
  const { user, organization } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TicketTab>('upcoming');
  const supabase = createClient();
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  useEffect(() => {
    if (user) fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchEvents() {
    let query = supabase.from('events').select('*').eq('requires_ticket', true).order('date', { ascending: true });
    if (organization?.id) query = query.eq('organizer_org_id', organization.id);
    else query = query.eq('organizer_profile_id', user!.id);
    const { data } = await query;
    setEvents(data ?? []);
    setLoading(false);
  }

  const isLive = (e: Event) => {
    const start = new Date(`${e.date}T${e.time}`);
    const end = e.end_date && e.end_time ? new Date(`${e.end_date}T${e.end_time}`) : new Date(start.getTime() + 4 * 3600000);
    return now >= start && now <= end;
  };

  const liveEvents = events.filter(isLive);
  const upcomingEvents = events.filter((e) => e.date >= today && !isLive(e));
  const pastEvents = events.filter((e) => e.date < today && !isLive(e));
  const current = tab === 'live' ? liveEvents : tab === 'upcoming' ? upcomingEvents : pastEvents;

  const tabs: { key: TicketTab; label: string; count: number; icon: any }[] = [
    { key: 'live', label: 'Live', count: liveEvents.length, icon: Radio },
    { key: 'upcoming', label: 'Bevorstehend', count: upcomingEvents.length, icon: CalendarDays },
    { key: 'past', label: 'Vergangen', count: pastEvents.length, icon: Clock },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Ticket-Verwaltung</h1>
        <p className="text-sm text-muted-fg mt-1">Events mit Ticketpflicht</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-border-subtle bg-surface text-center">
          <Ticket size={20} className="mx-auto text-muted-fg/50 mb-1" />
          <p className="text-xl font-heading font-bold">{events.length}</p>
          <p className="text-[11px] text-muted-fg">Gesamt</p>
        </div>
        <div className="p-4 rounded-2xl border border-border-subtle bg-surface text-center">
          <CalendarDays size={20} className="mx-auto text-muted-fg/50 mb-1" />
          <p className="text-xl font-heading font-bold">{upcomingEvents.length}</p>
          <p className="text-[11px] text-muted-fg">Bevorstehend</p>
        </div>
        <div className="p-4 rounded-2xl border border-border-subtle bg-surface text-center">
          <Radio size={20} className="mx-auto text-green-500 mb-1" />
          <p className="text-xl font-heading font-bold">{liveEvents.length}</p>
          <p className="text-[11px] text-muted-fg">Live</p>
        </div>
      </div>

      {/* Check-in Hint */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-900/20">
        <ScanLine size={20} className="text-violet-600 flex-shrink-0" />
        <p className="text-[13px] text-violet-700 dark:text-violet-300">
          Scanne Tickets am Einlass mit der mobilen App, um den Check-in zu bestätigen.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                tab === t.key
                  ? t.key === 'live' && liveEvents.length > 0
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-primary-bg text-primary-text shadow-sm'
                  : 'bg-surface border border-border-subtle text-muted-fg hover:text-foreground hover:border-border-strong'
              }`}
            >
              <Icon size={15} />
              {t.label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-white/20' : 'bg-muted'}`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* Events */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <Ticket size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Keine Events mit Ticketpflicht</p>
          <p className="text-[12px] mt-1">Aktiviere die Ticketpflicht beim Erstellen eines Events.</p>
        </div>
      ) : current.length === 0 ? (
        <div className="text-center py-12 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <p className="text-sm font-medium">
            {tab === 'live' ? 'Keine laufenden Ticket-Events' : tab === 'upcoming' ? 'Keine bevorstehenden Ticket-Events' : 'Keine vergangenen Ticket-Events'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {current.map((event) => (
            <Link
              key={event.id}
              href={`/organizer/events/${event.id}`}
              className={`group flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200 ${tab === 'past' ? 'opacity-60' : ''}`}
            >
              {isLive(event) && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />}
              <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                {event.image_url ? (
                  <img src={event.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><ImageOff size={16} className="text-muted-fg/30" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
                <p className="text-[12px] text-muted-fg mt-0.5">{formatDate(event.date)} · {formatTime(event.time)}</p>
              </div>
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
