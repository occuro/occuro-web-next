'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, CalendarDays, Clock, MapPin, ImageOff, Heart, CheckCircle2 } from 'lucide-react';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export default function CalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const supabase = createClient();

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    // Get user's event statuses first, then fetch those events + public events
    const statusesRes = user
      ? await supabase.from('event_statuses').select('event_id, status').eq('user_id', user.id)
      : { data: [] };

    const statusData = statusesRes.data ?? [];
    const map: Record<string, string> = {};
    statusData.forEach((s: any) => { map[s.event_id] = s.status; });
    setStatuses(map);

    // Fetch public events + user's private events
    const userEventIds = statusData.map((s: any) => s.event_id);
    const [publicRes, privateRes] = await Promise.all([
      supabase.from('events').select('*').eq('visibility', 'public').order('date', { ascending: true }),
      userEventIds.length > 0
        ? supabase.from('events').select('*').in('id', userEventIds).eq('visibility', 'private')
        : Promise.resolve({ data: [] }),
    ]);

    // Merge and deduplicate
    const allEvents = [...(publicRes.data ?? []), ...(privateRes.data ?? [])];
    const seen = new Set<string>();
    const dedupedEvents = allEvents.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    setEvents(dedupedEvents);
    setLoading(false);
  }

  // Calendar grid
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const days: (string | null)[] = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push(dateStr);
    }
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [currentMonth]);

  // Events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, Event[]> = {};
    events.forEach((e) => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [events]);

  // Events for selected date or month
  const displayEvents = useMemo(() => {
    if (selectedDate) return eventsByDate[selectedDate] ?? [];
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return events.filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === year && d.getMonth() === month;
    });
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

  const getEventDots = (dateStr: string) => {
    const dayEvents = eventsByDate[dateStr] ?? [];
    return dayEvents.slice(0, 3).map((e) => {
      const status = statuses[e.id];
      if (status === 'confirmed') return '#22c55e';
      if (status === 'interested') return '#ec4899';
      return getCategoryColor(e.category);
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ChevronLeft size={20} />
        </button>
        <button onClick={goToToday} className="text-lg font-heading font-bold hover:text-violet-600 transition-colors">
          {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </button>
        <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-muted transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="text-center text-[11px] font-medium text-muted-fg uppercase tracking-wider py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((dateStr, i) => {
            if (!dateStr) return <div key={`empty-${i}`} />;
            const day = parseInt(dateStr.split('-')[2]);
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const dots = getEventDots(dateStr);
            const hasEvents = dots.length > 0;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl transition-all duration-200 ${
                  isSelected
                    ? 'bg-violet-600 text-white ring-2 ring-violet-600/30'
                    : isToday
                    ? 'bg-violet-100 text-violet-700 font-semibold dark:bg-violet-900/30 dark:text-violet-300'
                    : hasEvents
                    ? 'hover:bg-muted/60 cursor-pointer'
                    : 'text-muted-fg/60'
                }`}
              >
                <span className="text-[13px]">{day}</span>
                {dots.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {dots.map((color, j) => (
                      <div
                        key={j}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.8)' : color }}
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
      <div className="flex items-center gap-4 text-[11px] text-muted-fg">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Bestätigt</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-pink-500" /> Interessiert</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" /> Event</span>
      </div>

      {/* Events for selected date / month */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-heading font-semibold">
            {selectedDate ? formatDate(selectedDate) : `Events im ${MONTHS[currentMonth.getMonth()]}`}
          </h2>
          <span className="text-[12px] text-muted-fg">{displayEvents.length} Events</span>
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
            <p className="text-sm font-medium">Keine Events {selectedDate ? 'an diesem Tag' : 'in diesem Monat'}</p>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {displayEvents.map((event) => {
              const status = statuses[event.id];
              const accentColor = status === 'confirmed' ? '#22c55e' : status === 'interested' ? '#ec4899' : getCategoryColor(event.category);
              return (
                <Link
                  key={event.id}
                  href={`/app/event/${event.id}`}
                  className="group flex items-center gap-4 p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200"
                >
                  <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
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
                    <div className="flex items-center gap-3 text-[12px] text-muted-fg mt-0.5">
                      <span className="flex items-center gap-1"><Clock size={11} />{formatTime(event.time)}</span>
                      <span className="flex items-center gap-1 truncate"><MapPin size={11} className="flex-shrink-0" />{event.location}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-fg flex-shrink-0">
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
