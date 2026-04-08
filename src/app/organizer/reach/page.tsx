'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';
import {
  Heart, CheckCircle2, TrendingUp, CalendarDays, Link2, UserCheck,
  Share2, BarChart3, Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export default function ReachPage() {
  const { user, organization } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (user) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function fetchData() {
    const orgId = organization?.id;

    let evQuery = supabase.from('events').select('*').order('interested_count', { ascending: false });
    if (orgId) evQuery = evQuery.eq('organizer_org_id', orgId);
    else evQuery = evQuery.eq('organizer_profile_id', user!.id);
    const { data: evts } = await evQuery;
    setEvents(evts ?? []);

    let fQuery = supabase.from('organizer_follows').select('id', { count: 'exact', head: true });
    if (orgId) fQuery = fQuery.eq('organizer_org_id', orgId);
    else fQuery = fQuery.eq('organizer_profile_id', user!.id);
    const { count } = await fQuery;
    setFollowerCount(count ?? 0);

    setLoading(false);
  }

  const stats = useMemo(() => {
    const totalInterested = events.reduce((s, e) => s + (e.interested_count || 0), 0);
    const totalConfirmed = events.reduce((s, e) => s + (e.confirmed_count || 0), 0);
    const avgInterested = events.length ? Math.round(totalInterested / events.length) : 0;
    const withShop = events.filter((e) => e.ticket_shop_url).length;
    return { totalReach: totalInterested + totalConfirmed, totalInterested, totalConfirmed, avgInterested, withShop };
  }, [events]);

  const topEvents = events.slice(0, 5);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">Reichweite</h1>
        <p className="text-sm text-muted-fg mt-1">Deine Performance auf einen Blick</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-2xl bg-surface border border-border-subtle animate-pulse" />)}
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <BarChart3 size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
          <p className="text-base font-medium">Noch keine Daten</p>
          <p className="text-[13px] mt-1.5">Erstelle Events um deine Reichweite zu sehen.</p>
        </div>
      ) : (
        <>
          {/* KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            <KPICard label="Gesamte Reichweite" value={stats.totalReach} icon={TrendingUp} />
            <KPICard label="Interessierte" value={stats.totalInterested} icon={Heart} />
            <KPICard label="Avg. pro Event" value={stats.avgInterested} icon={CalendarDays} />
            <KPICard label="Follower" value={followerCount} icon={UserCheck} />
            <KPICard label="Events mit Shop" value={stats.withShop} icon={Link2} />
            <KPICard label="Events gesamt" value={events.length} icon={CalendarDays} />
          </div>

          {/* Engagement */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-3">
                <Heart size={16} className="text-pink-500" />
                <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">Interessierte</p>
              </div>
              <p className="text-3xl font-heading font-bold">{stats.totalInterested}</p>
            </div>
            <div className="p-5 rounded-2xl border border-border-subtle bg-surface">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-green-500" />
                <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">Bestätigte</p>
              </div>
              <p className="text-3xl font-heading font-bold">{stats.totalConfirmed}</p>
            </div>
          </div>

          {/* Top Events */}
          {topEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Trophy size={16} className="text-amber-500" />
                <h2 className="text-base font-heading font-semibold">Top Events</h2>
              </div>
              <div className="rounded-2xl border border-border-subtle bg-surface overflow-hidden divide-y divide-border-subtle">
                {topEvents.map((event, i) => (
                  <div key={event.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-elevated/30 transition-colors">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                      i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-50 text-orange-600'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{event.title}</p>
                      <p className="text-[11px] text-muted-fg">{formatDate(event.date)}</p>
                    </div>
                    {event.ticket_shop_url && <Link2 size={13} className="text-violet-500 flex-shrink-0" />}
                    <span className="flex items-center gap-1 text-[12px] text-muted-fg flex-shrink-0">
                      <Heart size={11} /> {event.interested_count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Promotion */}
          <div className="rounded-2xl border border-border-subtle bg-surface p-6">
            <h2 className="text-base font-heading font-semibold mb-2">Reichweite erhöhen</h2>
            <p className="text-[13px] text-muted-fg mb-4">
              Teile dein Profil, um mehr Follower zu gewinnen und deine Events einem größeren Publikum zugänglich zu machen.
            </p>
            <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-primary-bg text-primary-text hover:opacity-90 transition">
              <Share2 size={15} /> Profil teilen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function KPICard({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="p-5 rounded-2xl border border-border-subtle bg-surface hover:border-border-strong hover:shadow-[var(--shadow-sm)] transition-all duration-200">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-muted-fg uppercase tracking-wide">{label}</p>
        <Icon size={16} strokeWidth={1.6} className="text-muted-fg/50" />
      </div>
      <p className="text-2xl font-heading font-bold mt-2 tracking-tight">{value}</p>
    </div>
  );
}
