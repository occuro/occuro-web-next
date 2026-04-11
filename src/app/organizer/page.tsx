'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  Plus, Search, X, CalendarDays, Radio, Clock, ImageOff,
  AlertTriangle, ShieldCheck, ArrowRight,
  Users, Lock, Pencil,
} from 'lucide-react';

type EventTab = 'upcoming' | 'live' | 'past';

export default function OrganizerHomePage() {
  const { user, organization } = useAuth();
  const supabase = createClient();

  const [events, setEvents] = useState<Event[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<EventTab>('upcoming');
  const [search, setSearch] = useState('');

  const now = useMemo(() => new Date(), []);
  const today = now.toISOString().split('T')[0];

  useEffect(() => {
    if (user) void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, organization?.id]);

  async function fetchData() {
    setLoading(true);
    const orgId = organization?.id;

    // Events owned by this org/user
    let query = supabase.from('events').select('*').order('date', { ascending: true });
    if (orgId) query = query.eq('organizer_org_id', orgId);
    else query = query.eq('organizer_profile_id', user!.id);
    const { data: evts } = await query;
    setEvents(evts ?? []);

    // Follower count
    let fQuery = supabase
      .from('organizer_follows')
      .select('id', { count: 'exact', head: true });
    if (orgId) fQuery = fQuery.eq('organizer_org_id', orgId);
    else fQuery = fQuery.eq('organizer_profile_id', user!.id);
    const { count } = await fQuery;
    setFollowerCount(count ?? 0);

    setLoading(false);
  }

  // ── Live = today between start and end (inclusive) ──────────────
  const isLive = (e: Event) => {
    const startKey = e.date;
    const endKey = e.end_date ?? e.date;
    return startKey <= today && today <= endKey;
  };

  // Defensive null guards on date — a single bad row in the database
  // would otherwise crash localeCompare and bring down the whole page
  // via the ErrorBoundary. Organizers only have public events; the
  // visibility filter is intentionally permissive to also surface
  // legacy rows that might be missing the visibility column.
  // Organizers shouldn't have private events anyway, but filter as a
  // safety net for legacy data so a stray private row doesn't sneak in.
  const publicOnly = events.filter((e) => e.visibility !== 'private');
  const upcoming = publicOnly.filter((e) => (e.end_date ?? e.date ?? '') >= today && !isLive(e));
  const live = publicOnly.filter((e) => isLive(e));
  const past = publicOnly
    .filter((e) => (e.end_date ?? e.date ?? '') < today)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));

  const currentEvents =
    tab === 'live' ? live
    : tab === 'past' ? past
    : upcoming;

  const filtered = search
    ? currentEvents.filter((e) => {
        const q = search.toLowerCase();
        return (
          (e.title ?? '').toLowerCase().includes(q) ||
          (e.location ?? '').toLowerCase().includes(q) ||
          (e.category ?? '').toLowerCase().includes(q)
        );
      })
    : currentEvents;

  const isVerified = organization?.verified ?? false;

  const tabs: { key: EventTab; label: string; count: number; icon: typeof CalendarDays; liveBg?: boolean }[] = [
    { key: 'upcoming', label: 'Anstehend', count: upcoming.length, icon: CalendarDays },
    { key: 'live', label: 'Live', count: live.length, icon: Radio, liveBg: live.length > 0 },
    { key: 'past', label: 'Vergangen', count: past.length, icon: Clock },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* ─── Welcome header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">
            Hallo, {organization?.name ?? 'Veranstalter'}
          </h1>
          <p className="text-sm text-muted-fg mt-1">
            Verwalte deine Events und sieh, wie deine Community wächst.
          </p>
        </div>
        <Link
          href="/organizer/events/create"
          className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors shadow-lg shadow-violet-600/20"
        >
          <Plus size={15} strokeWidth={2.2} /> Event erstellen
        </Link>
      </div>

      {/* ─── Quick stats strip — only the two that matter at a glance.
          Engagement metrics live on the Statistiken page in the sidebar. ─── */}
      <div className="grid grid-cols-2 gap-3">
        <QuickStat
          label="Follower"
          value={followerCount}
          icon={Users}
          href="/organizer/followers"
        />
        <QuickStat
          label="Events gesamt"
          value={events.length}
          icon={CalendarDays}
        />
      </div>

      {/* ─── Verification alert ─── */}
      {!isVerified && organization && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5">
          <div className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-amber-200">Organisation noch nicht verifiziert</p>
            <p className="text-[12px] text-amber-200/70 mt-0.5">
              Verifiziere deine Organisation in der mobilen App, um mehr Vertrauen aufzubauen.
            </p>
          </div>
          <ShieldCheck size={16} className="text-amber-400 flex-shrink-0" />
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="grid grid-cols-3 gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSearch(''); }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 ${
                active
                  ? t.liveBg && t.key === 'live'
                    ? 'bg-green-600 text-white shadow-sm'
                    : 'bg-violet-600 text-white shadow-sm'
                  : 'bg-surface border border-border-subtle text-muted-fg hover:text-foreground hover:border-border-strong'
              }`}
            >
              <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              {t.label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                active ? 'bg-white/20' : 'bg-muted'
              }`}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Search ─── */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder="Events filtern..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ─── Events list ─── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-surface border border-border-subtle animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <CalendarDays size={36} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {search ? 'Keine Events gefunden'
            : tab === 'upcoming' ? 'Keine anstehenden Events'
            : tab === 'live' ? 'Aktuell läuft kein Event'
            : 'Noch keine vergangenen Events'}
          </p>
          {!search && events.length === 0 && (
            <Link
              href="/organizer/events/create"
              className="inline-flex items-center gap-1 mt-3 text-[13px] font-medium text-foreground hover:text-violet-400 transition-colors"
            >
              Erstelle dein erstes Event <ArrowRight size={14} />
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2 stagger-children">
          {filtered.map((event) => (
            <div
              key={event.id}
              className={`group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong transition-all duration-200 ${
                tab === 'past' ? 'opacity-70' : ''
              }`}
            >
              {isLive(event) && (
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              )}
              <Link
                href={`/app/event/${event.id}`}
                className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0"
              >
                <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                  {event.banner_url || event.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={event.banner_url ?? event.image_url ?? ''} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff size={16} strokeWidth={1.4} className="text-muted-fg/30" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[14px] truncate">{event.title}</h3>
                  <p className="text-[12px] text-muted-fg mt-0.5 truncate">
                    {formatDate(event.date)} · {formatTime(event.time)} · {event.location}
                  </p>
                </div>
                <span
                  className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold text-white flex-shrink-0"
                  style={{ backgroundColor: getCategoryColor(event.category) }}
                >
                  {event.category}
                </span>
              </Link>
              {/* Edit button — separate Link so it doesn't trigger the row navigation */}
              <Link
                href={`/organizer/events/${event.id}/edit`}
                className="p-2 rounded-lg text-muted-fg hover:text-violet-400 hover:bg-violet-500/10 transition-colors flex-shrink-0"
                aria-label="Bearbeiten"
                title="Bearbeiten"
              >
                <Pencil size={15} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Quick stat tile
// ────────────────────────────────────────────────────────────────────

interface QuickStatProps {
  label: string;
  value: number;
  icon: typeof Users;
  href?: string;
}

function QuickStat({ label, value, icon: Icon, href }: QuickStatProps) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-medium text-muted-fg uppercase tracking-wide">{label}</p>
        <Icon size={14} strokeWidth={1.8} className="text-violet-500/60" />
      </div>
      <p className="text-2xl font-heading font-bold tracking-tight">{value.toLocaleString('de-DE')}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block p-4 rounded-2xl border border-border-subtle bg-surface hover:border-violet-500/30 hover:bg-elevated/30 transition-all"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="p-4 rounded-2xl border border-border-subtle bg-surface">
      {inner}
    </div>
  );
}
