'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  Heart, CheckCircle2, CalendarDays, TrendingUp, ArrowRight,
  Users, Percent, Target, Activity, Award, ArrowLeft,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function OrganizerDashboardPage() {
  const { user, organization } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followerGrowth, setFollowerGrowth] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (user) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, organization?.id]);

  async function fetchData() {
    setLoading(true);
    const orgId = organization?.id;

    let query = supabase.from('events').select('*').order('date', { ascending: false });
    if (orgId) query = query.eq('organizer_org_id', orgId);
    else query = query.eq('organizer_profile_id', user!.id);
    const { data: evts } = await query;
    setEvents(evts ?? []);

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
    const completed = all.filter((e) => (e.end_date ?? e.date) < today);
    const totalInterested = all.reduce((s, e) => s + (e.interested_count || 0), 0);
    const totalConfirmed = all.reduce((s, e) => s + (e.confirmed_count || 0), 0);
    const avgInterested = all.length ? Math.round(totalInterested / all.length) : 0;
    const avgConfirmed = all.length ? Math.round(totalConfirmed / all.length) : 0;
    const conversionRate = totalInterested ? Math.round((totalConfirmed / totalInterested) * 100) : 0;
    return {
      total: all.length, upcoming: upcoming.length, completed: completed.length,
      totalInterested, totalConfirmed, avgInterested, avgConfirmed, conversionRate,
    };
  }, [events, today]);

  const nextEvent = useMemo(
    () => events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0],
    [events, today],
  );
  const daysUntilNext = nextEvent
    ? Math.ceil((new Date(nextEvent.date).getTime() - Date.now()) / 86400000)
    : null;

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    events.forEach((e) => { map[e.category] = (map[e.category] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [events]);

  const topEvents = useMemo(
    () => [...events]
      .sort((a, b) => (b.interested_count + b.confirmed_count) - (a.interested_count + a.confirmed_count))
      .slice(0, 5),
    [events],
  );

  const maxGrowth = Math.max(...followerGrowth, 1);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/organizer"
            className="inline-flex items-center gap-1 text-[12px] text-muted-fg hover:text-foreground transition-colors mb-1"
          >
            <ArrowLeft size={12} /> Zurück zur Übersicht
          </Link>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Statistiken</h1>
          <p className="text-sm text-muted-fg mt-1">
            {organization?.name ?? 'Veranstalter'} · Letzte 6 Wochen
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* ─── KPI grid ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
            <StatCard label="Follower" value={followerCount} icon={Users} accent="violet" />
            <StatCard label="Events gesamt" value={stats.total} icon={CalendarDays} accent="violet" />
            <StatCard label="Interessenten" value={stats.totalInterested} icon={Heart} accent="pink" />
            <StatCard label="Bestätigungen" value={stats.totalConfirmed} icon={CheckCircle2} accent="green" />
          </div>

          {/* ─── Average + Conversion ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-3">
                <Target size={15} className="text-violet-500" />
                <p className="text-[11px] font-medium text-muted-fg uppercase tracking-wide">Ø Interessenten</p>
              </div>
              <p className="text-3xl font-heading font-bold tracking-tight">{stats.avgInterested}</p>
              <p className="text-[11px] text-muted-fg mt-1">Pro Event</p>
            </div>
            <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-3">
                <Award size={15} className="text-violet-500" />
                <p className="text-[11px] font-medium text-muted-fg uppercase tracking-wide">Ø Bestätigt</p>
              </div>
              <p className="text-3xl font-heading font-bold tracking-tight">{stats.avgConfirmed}</p>
              <p className="text-[11px] text-muted-fg mt-1">Pro Event</p>
            </div>
            <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-3">
                <Percent size={15} className="text-violet-500" />
                <p className="text-[11px] font-medium text-muted-fg uppercase tracking-wide">Conversion Rate</p>
              </div>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-heading font-bold tracking-tight">{stats.conversionRate}%</p>
              </div>
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(stats.conversionRate, 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-fg mt-1.5">Interessiert → Bestätigt</p>
            </div>
          </div>

          {/* ─── Follower growth chart ─── */}
          <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={15} className="text-violet-500" />
              <p className="text-[12px] font-semibold text-foreground">Follower-Wachstum</p>
              <span className="text-[11px] text-muted-fg ml-auto">Letzte 6 Wochen</span>
            </div>
            <div className="flex items-end gap-2 h-32">
              {followerGrowth.map((val, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="text-[10px] text-muted-fg/70 font-medium">{val}</div>
                  <div
                    className="w-full bg-violet-500/80 hover:bg-violet-500 rounded-t-lg transition-all duration-300 min-h-[4px]"
                    style={{ height: `${(val / maxGrowth) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted-fg">W{i + 1}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-fg mt-3">
              Insgesamt <span className="font-semibold text-foreground">+{followerGrowth.reduce((s, n) => s + n, 0)}</span> neue Follower in den letzten 6 Wochen.
            </p>
          </div>

          {/* ─── Next event highlight ─── */}
          {nextEvent && (
            <Link
              href={`/app/event/${nextEvent.id}`}
              className="group flex items-center gap-5 p-5 rounded-2xl border border-violet-500/30 bg-violet-500/[0.04] hover:bg-violet-500/[0.08] transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-violet-500/15 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-2xl font-heading font-bold text-violet-300">{daysUntilNext}</span>
                <span className="text-[9px] font-medium text-violet-400 uppercase tracking-wider">Tage</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-violet-400 uppercase tracking-wider">Nächstes Event</p>
                <h3 className="font-semibold text-[15px] truncate mt-0.5">{nextEvent.title}</h3>
                <p className="text-[12px] text-muted-fg mt-0.5">
                  {formatDate(nextEvent.date)} · {nextEvent.location}
                </p>
              </div>
              <div className="text-right text-[12px] text-muted-fg flex-shrink-0">
                <p className="flex items-center justify-end gap-1"><Heart size={11} />{nextEvent.interested_count}</p>
                <p className="flex items-center justify-end gap-1"><CheckCircle2 size={11} />{nextEvent.confirmed_count}</p>
              </div>
              <ArrowRight size={18} className="text-muted-fg group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
            </Link>
          )}

          {/* ─── Top events ─── */}
          {topEvents.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Activity size={15} className="text-violet-500" />
                  <h2 className="text-base font-heading font-semibold">Erfolgreichste Events</h2>
                </div>
                <Link href="/organizer" className="flex items-center gap-1 text-[12px] text-muted-fg hover:text-foreground transition-colors">
                  Alle <ArrowRight size={12} />
                </Link>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden">
                {topEvents.map((e, idx) => (
                  <Link
                    key={e.id}
                    href={`/app/event/${e.id}`}
                    className="flex items-center gap-4 px-5 py-3 border-b border-border-subtle last:border-0 hover:bg-elevated/40 transition-colors"
                  >
                    <span className="text-lg font-heading font-bold text-muted-fg/40 w-6">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium truncate">{e.title}</p>
                      <p className="text-[11px] text-muted-fg">{formatDate(e.date)}</p>
                    </div>
                    <div className="flex gap-3 text-[12px] text-muted-fg">
                      <span className="flex items-center gap-1"><Heart size={11} />{e.interested_count}</span>
                      <span className="flex items-center gap-1"><CheckCircle2 size={11} />{e.confirmed_count}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ─── Category breakdown ─── */}
          {categoryBreakdown.length > 0 && (
            <div>
              <h2 className="text-base font-heading font-semibold mb-4">Kategorien-Verteilung</h2>
              <div className="space-y-2.5">
                {categoryBreakdown.map(([cat, count]) => {
                  const maxCount = categoryBreakdown[0][1] as number;
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-[13px] font-medium w-28 truncate">{cat}</span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                          style={{
                            width: `${(count / (maxCount as number)) * 100}%`,
                            backgroundColor: getCategoryColor(cat),
                          }}
                        />
                      </div>
                      <span className="text-[12px] text-muted-fg w-10 text-right">{count}</span>
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

// ────────────────────────────────────────────────────────────────────
// StatCard with accent color
// ────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: 'violet' | 'pink' | 'green';
}

function StatCard({ label, value, icon: Icon, accent }: StatCardProps) {
  const accentClass = {
    violet: 'text-violet-500',
    pink: 'text-pink-500',
    green: 'text-green-500',
  }[accent];
  return (
    <div className="p-5 rounded-2xl border border-border-subtle bg-surface hover:border-border-strong transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-medium text-muted-fg uppercase tracking-wide">{label}</p>
        <Icon size={15} strokeWidth={1.8} className={accentClass} />
      </div>
      <p className="text-3xl font-heading font-bold tracking-tight">{value.toLocaleString('de-DE')}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
      <CalendarDays size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
      <p className="text-base font-medium">Noch keine Events</p>
      <p className="text-[13px] text-muted-fg mt-1">Erstelle dein erstes Event, um Statistiken zu sehen.</p>
      <Link
        href="/organizer/events/create"
        className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-full text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
      >
        Event erstellen <ArrowRight size={14} />
      </Link>
    </div>
  );
}
