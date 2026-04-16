'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import { EventBanner } from '@/components/event-banner';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin,
  Heart, CheckCircle2, Lock,
} from 'lucide-react';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export default function CalendarPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [events, setEvents] = useState<Event[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mirror the mobile behavior: the calendar shows only events the user
  // is involved in (status set, saved, or owned). We never dump all
  // public events into the grid — that would be unreadable on a phone
  // and slow the page on Vercel.
  async function fetchData() {
    setLoading(true);

    const [statusesRes, savedRes] = await Promise.all([
      supabase.from('event_statuses').select('event_id, status').eq('user_id', user!.id),
      supabase.from('saved_events').select('event_id').eq('user_id', user!.id),
    ]);

    const statusData = (statusesRes.data ?? []) as { event_id: string; status: string }[];
    const map: Record<string, string> = {};
    statusData.forEach((s) => { map[s.event_id] = s.status; });
    setStatuses(map);

    const savedIds = ((savedRes.data ?? []) as { event_id: string }[]).map((r) => r.event_id);

    const eventIds = new Set<string>([
      ...statusData.map((s) => s.event_id),
      ...savedIds,
    ]);

    // Also include the user's own events (organizer of) — for individual
    // creators these are usually private events.
    const { data: ownEvents } = await supabase
      .from('events')
      .select('id')
      .eq('organizer_profile_id', user!.id);
    (ownEvents ?? []).forEach((e: { id: string }) => eventIds.add(e.id));

    if (eventIds.size === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const { data: eventRows } = await supabase
      .from('events')
      .select('*')
      .in('id', Array.from(eventIds))
      .order('date', { ascending: true });

    setEvents(eventRows ?? []);
    setLoading(false);
  }

  // ── Calendar grid (Monday-first weeks, padded to full weeks) ─────
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const days: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i += 1) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d += 1) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push(dateStr);
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [currentMonth]);

  // ── Events by date (handles multi-day events via end_date) ───────
  const eventsByDate = useMemo(() => {
    const map: Record<string, Event[]> = {};
    events.forEach((e) => {
      const start = e.date;
      const end = e.end_date ?? e.date;
      // Iterate every day in the range and add the event
      const startD = new Date(start);
      const endD = new Date(end);
      const cursor = new Date(startD);
      while (cursor <= endD) {
        const key = cursor.toISOString().split('T')[0];
        if (!map[key]) map[key] = [];
        map[key].push(e);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    return map;
  }, [events]);

  // ── Events for the selected day OR the visible month ─────────────
  const displayEvents = useMemo(() => {
    if (selectedDate) {
      return [...(eventsByDate[selectedDate] ?? [])].sort((a, b) =>
        (a.time ?? '').localeCompare(b.time ?? ''),
      );
    }
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return events
      .filter((e) => {
        const d = new Date(e.date);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedDate, eventsByDate, events, currentMonth]);

  const prevMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    setSelectedDate(null);
  };
  const nextMonth = () => {
    setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    setSelectedDate(null);
  };
  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(today);
  };

  const isToday =
    currentMonth.getMonth() === new Date().getMonth() &&
    currentMonth.getFullYear() === new Date().getFullYear();

  // Pre-computed dot colors per day
  const dotsForDate = (dateStr: string): string[] => {
    const dayEvents = eventsByDate[dateStr] ?? [];
    return dayEvents.slice(0, 3).map((e) => {
      const status = statuses[e.id];
      if (status === 'confirmed' || status === 'attended') return '#22c55e';
      if (status === 'interested') return '#ec4899';
      if (e.visibility === 'private') return '#a78bfa';
      return getCategoryColor(e.category);
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-fg mt-1">Deine Events im Überblick</p>
        </div>
        <button
          onClick={goToToday}
          disabled={isToday && selectedDate === today}
          className="px-4 py-2 rounded-full text-[12px] font-semibold border border-border-subtle bg-surface hover:bg-elevated transition-colors disabled:opacity-40"
        >
          Heute
        </button>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors"
          aria-label="Vorheriger Monat"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-heading font-bold">
          {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h2>
        <button
          onClick={nextMonth}
          className="p-2 -mr-2 rounded-xl hover:bg-muted transition-colors"
          aria-label="Nächster Monat"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-2 sm:p-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1 sm:mb-2">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="text-center text-[10px] sm:text-[11px] font-medium text-muted-fg uppercase tracking-wider py-1.5 sm:py-2"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {calendarDays.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} className="aspect-square sm:aspect-auto sm:h-12" />;
            const day = parseInt(dateStr.split('-')[2], 10);
            const isTodayCell = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const dots = dotsForDate(dateStr);
            const hasEvents = dots.length > 0;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`relative flex flex-col items-center justify-center aspect-square sm:aspect-auto sm:h-12 rounded-xl transition-all duration-200 ${
                  isSelected
                    ? 'bg-violet-600 text-white ring-2 ring-violet-600/40'
                    : isTodayCell
                      ? 'bg-violet-500/15 text-violet-300 font-semibold'
                      : hasEvents
                        ? 'hover:bg-muted/60 cursor-pointer'
                        : 'text-muted-fg/50 hover:bg-muted/30'
                }`}
              >
                <span className="text-[12px] sm:text-[13px] font-medium">{day}</span>
                {dots.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5 sm:mt-1">
                    {dots.map((color, j) => (
                      <span
                        key={j}
                        className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full"
                        style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.85)' : color }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-[11px] text-muted-fg flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Bestätigt</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-500" /> Interessiert</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-400" /> Privat</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-muted-fg" /> Sonstige</span>
      </div>

      {/* Event list */}
      <div>
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-base font-heading font-semibold">
            {selectedDate ? formatDate(selectedDate) : `Events im ${MONTHS[currentMonth.getMonth()]}`}
          </h2>
          <span className="text-[12px] text-muted-fg">{displayEvents.length} {displayEvents.length === 1 ? 'Event' : 'Events'}</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />
            ))}
          </div>
        ) : displayEvents.length === 0 ? (
          <div className="text-center py-12 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
            <CalendarDays size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">
              {selectedDate
                ? 'Keine Events an diesem Tag'
                : 'Keine Events in diesem Monat'}
            </p>
            <p className="text-[12px] text-muted-fg mt-1">
              Markiere Events als &quot;Interessiert&quot; oder &quot;Bestätigt&quot;, damit sie hier auftauchen.
            </p>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {displayEvents.map((event) => {
              const status = statuses[event.id];
              const accentColor =
                status === 'confirmed' || status === 'attended' ? '#22c55e'
                : status === 'interested' ? '#ec4899'
                : event.visibility === 'private' ? '#a78bfa'
                : getCategoryColor(event.category);
              return (
                <Link
                  key={event.id}
                  href={`/app/event/${event.id}`}
                  className="group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200"
                >
                  <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
                  <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                    <EventBanner event={event} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
                      {event.visibility === 'private' && (
                        <Lock size={11} className="text-violet-400 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-[12px] text-muted-fg mt-0.5">
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <Clock size={11} />{formatTime(event.time)}
                      </span>
                      <span className="flex items-center gap-1 truncate min-w-0">
                        <MapPin size={11} className="flex-shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </span>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-fg flex-shrink-0">
                    <span className="flex items-center gap-1"><Heart size={11} />{event.interested_count}</span>
                    <span className="flex items-center gap-1"><CheckCircle2 size={11} />{event.confirmed_count}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
