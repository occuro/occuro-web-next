'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  Plus, Heart, CheckCircle2, CalendarDays, TrendingUp, ArrowRight,
  ImageOff, Users, BarChart3, Clock, Percent,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function OrganizerDashboard() {
  const { user, organization } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followerGrowth, setFollowerGrowth] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    const orgId = organization?.id;

    // Events
    let query = supabase.from('events').select('*').order('date', { ascending: false });
    if (orgId) query = query.eq('organizer_org_id', orgId);
    else query = query.eq('organizer_profile_id', user!.id);
    const { data: evts } = await query;
    setEvents(evts ?? []);

    // Followers
    let fQuery = supabase.from('organizer_follows').select('id, created_at');
    if (orgId) fQuery = fQuery.eq('organizer_org_id', orgId);
    else fQuery = fQuery.eq('organizer_profile_id', user!.id);
    const { data: follows } = await fQuery;
    setFollowerCount(follows?.length ?? 0);

    // Follower growth (last 6 weeks)
    const weeks: number[] = [];
    for (let w = 5; w >= 0; w--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - w * 7);
      const count = (follows ?? []).filter((f) => {
        const d = new Date(f.created_at);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeks.push(count);
    }
    setFollowerGrowth(weeks);

    setLoading(false);
  }

  const stats = useMemo(() => {
    const all = events;
    const upcoming = all.filter((e) => e.date >= today);
    const totalInterested = all.reduce((s, e) => s + (e.interested_count || 0), 0);
    const totalConfirmed = all.reduce((s, e) => s + (e.confirmed_count || 0), 0);
    const avgInterested = all.length ? Math.round(totalInterested / all.length) : 0;
    const avgConfirmed = all.length ? Math.round(totalConfirmed / all.length) : 0;
    const conversionRate = totalInterested ? Math.round((totalConfirmed / totalInterested) * 100) : 0;
    return { total: all.length, upcoming: upcoming.length, totalInterested, totalConfirmed, avgInterested, avgConfirmed, conversionRate };
  }, [events, today]);

  const nextEvent = events.find((e) => e.date >= today);
  const daysUntilNext = nextEvent ? Math.ceil((new Date(nextEvent.date).getTime() - Date.now()) / 86400000) : null;

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach((e) => { map[e.category] = (map[e.category] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [events]);

  const maxGrowth = Math.max(...followerGrowth, 1);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-fg mt-1">Willkommen, {organization?.name ?? 'Veranstalter'}</p>
        </div>
        <Link href="/organizer/events/create" className="flex items-center gap-2 px-6 py-3 rounded-full text-[13px] font-semibold bg-primary-bg text-primary-text hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-sm">
          <Plus size={16} strokeWidth={2.2} /> Event erstellen
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <CalendarDays size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
          <p className="text-base font-medium">Noch keine Events</p>
          <Link href="/organizer/events/create" className="inline-flex items-center gap-1 mt-3 text-[13px] font-medium text-foreground hover:opacity-70 transition-opacity">
            Erstelle dein erstes Event <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            <StatCard label="Follower" value={followerCount} icon={Users} />
            <StatCard label="Avg. Interessiert" value={stats.avgInterested} icon={Heart} />
            <StatCard label="Avg. Bestätigt" value={stats.avgConfirmed} icon={CheckCircle2} />
          </div>

          {/* Conversion Rate + Follower Growth */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Conversion */}
            <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-4">
                <Percent size={16} className="text-muted-fg/50" />
                <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">Conversion Rate</p>
              </div>
              <div className="flex items-end gap-3">
                <p className="text-4xl font-heading font-bold tracking-tight">{stats.conversionRate}%</p>
                <p className="text-[12px] text-muted-fg mb-1.5">Interessiert → Bestätigt</p>
              </div>
              <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${stats.conversionRate}%` }} />
              </div>
            </div>

            {/* Follower Growth */}
            <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-muted-fg/50" />
                <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">Follower-Wachstum</p>
                <span className="text-[11px] text-muted-fg ml-auto">Letzte 6 Wochen</span>
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {followerGrowth.map((val, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-violet-500/80 rounded-t transition-all duration-300 min-h-[2px]"
                      style={{ height: `${(val / maxGrowth) * 100}%` }}
                    />
                    <span className="text-[9px] text-muted-fg">W{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Timeline: Next Event */}
          {nextEvent && (
            <Link
              href={`/organizer/events/${nextEvent.id}`}
              className="group flex items-center gap-5 p-5 rounded-2xl border border-violet-200 bg-violet-50/50 hover:bg-violet-50 dark:border-violet-800 dark:bg-violet-900/20 dark:hover:bg-violet-900/30 transition-all duration-200"
            >
              <div className="w-14 h-14 rounded-xl bg-violet-100 dark:bg-violet-800/40 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-xl font-heading font-bold text-violet-700 dark:text-violet-300">{daysUntilNext}</span>
                <span className="text-[9px] font-medium text-violet-500 uppercase">Tage</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-violet-500 uppercase tracking-wider">Nächstes Event</p>
                <h3 className="font-semibold text-[15px] truncate mt-0.5">{nextEvent.title}</h3>
                <p className="text-[12px] text-muted-fg mt-0.5">{formatDate(nextEvent.date)} · {formatTime(nextEvent.time)}</p>
              </div>
              <ArrowRight size={18} className="text-muted-fg group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
            </Link>
          )}

          {/* Per Event Breakdown */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-heading font-semibold">Event-Übersicht</h2>
              <Link href="/organizer/events" className="flex items-center gap-1 text-[13px] text-muted-fg hover:text-foreground transition-colors">
                Alle <ArrowRight size={14} />
              </Link>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] text-muted-fg uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-medium">Event</th>
                    <th className="text-right px-5 py-3 font-medium"><Heart size={12} className="inline" /></th>
                    <th className="text-right px-5 py-3 font-medium"><CheckCircle2 size={12} className="inline" /></th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 8).map((e) => (
                    <tr key={e.id} className="border-b border-border-subtle last:border-0 hover:bg-elevated/30 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-[13px] font-medium truncate max-w-[250px]">{e.title}</p>
                        <p className="text-[11px] text-muted-fg">{formatDate(e.date)}</p>
                      </td>
                      <td className="px-5 py-3 text-right text-[13px]">{e.interested_count}</td>
                      <td className="px-5 py-3 text-right text-[13px]">{e.confirmed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Overview */}
          {categoryBreakdown.length > 0 && (
            <div>
              <h2 className="text-base font-heading font-semibold mb-4">Kategorien</h2>
              <div className="space-y-2.5">
                {categoryBreakdown.map(([cat, count]) => {
                  const maxCount = categoryBreakdown[0][1] as number;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-[13px] font-medium w-24 truncate">{cat}</span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(count / (maxCount as number)) * 100}%`,
                            backgroundColor: getCategoryColor(cat),
                          }}
                        />
                      </div>
                      <span className="text-[12px] text-muted-fg w-8 text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="p-5 rounded-2xl border border-border-subtle bg-surface hover:border-border-strong hover:shadow-[var(--shadow-sm)] transition-all duration-200">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">{label}</p>
        <Icon size={16} strokeWidth={1.6} className="text-muted-fg/50" />
      </div>
      <p className="text-3xl font-heading font-bold mt-2 tracking-tight">{value}</p>
    </div>
  );
}
