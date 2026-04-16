'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import { EventBanner } from '@/components/event-banner';
import {
  Search, Heart, CheckCircle2, MapPin, Clock, Calendar,
  ArrowUpDown, X, Sparkles, CalendarPlus,
  Mail, Users, Building2, LocateFixed, Loader2,
} from 'lucide-react';

type SortMode = 'relevance' | 'soonest' | 'latest';

// Haversine great-circle distance between two lat/lng points, in km.
// Used to filter events within the user's selected radius without a
// round-trip to the server.
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

type InvitationRow = {
  id: string;
  event_id: string;
  invited_by: string | null;
  event: Event;
};

type FriendEventRow = {
  event: Event;
  friendCount: number;
};

export default function DiscoverPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [friendEvents, setFriendEvents] = useState<FriendEventRow[]>([]);
  const [organizerEvents, setOrganizerEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [personalLoading, setPersonalLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('soonest');
  // Location / distance filter. userLocation is populated from the
  // browser's Geolocation API when the user taps "In der Nähe"; the
  // radius determines which events appear in the grid via haversine
  // distance from that point. `null` userLocation disables the filter.
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [locatingStatus, setLocatingStatus] = useState<'idle' | 'loading' | 'denied'>('idle');
  const supabase = createClient();

  const categories = [
    'Music', 'Business', 'Health', 'Sports', 'Education',
    'Art', 'Food', 'Technology', 'Community', 'Outdoor',
  ];

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    if (!user) {
      setPersonalLoading(false);
      return;
    }
    fetchPersonal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function fetchEvents() {
    setLoading(true);
    let query = supabase
      .from('events')
      .select('*')
      .eq('visibility', 'public')
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date', { ascending: true })
      .limit(60);

    if (category) {
      query = query.ilike('category', category);
    }

    const { data } = await query;
    setEvents(data ?? []);
    setLoading(false);
  }

  async function fetchPersonal() {
    if (!user) return;
    setPersonalLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const [invRes, friendshipsRes, followsRes] = await Promise.all([
      supabase
        .from('event_invitations')
        .select('id, event_id, invited_by, status, created_at')
        .eq('invited_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('friendships')
        .select('user_id, friend_id, status')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted'),
      supabase
        .from('organizer_follows')
        .select('organizer_org_id')
        .eq('follower_id', user.id)
        .not('organizer_org_id', 'is', null),
    ]);

    // Invitations → event details
    const invRows = invRes.data ?? [];
    let invitationsOut: InvitationRow[] = [];
    if (invRows.length > 0) {
      const ids = invRows.map((r) => r.event_id);
      const { data: invEvents } = await supabase
        .from('events')
        .select('*')
        .in('id', ids)
        .gte('date', today);
      const map = new Map((invEvents ?? []).map((e) => [e.id, e as Event]));
      invitationsOut = invRows
        .map((r) => {
          const event = map.get(r.event_id);
          return event
            ? { id: r.id, event_id: r.event_id, invited_by: r.invited_by, event }
            : null;
        })
        .filter((r): r is InvitationRow => r !== null);
    }
    setInvitations(invitationsOut);

    // Friend events
    const friendIds = (friendshipsRes.data ?? []).map((f) =>
      f.user_id === user.id ? f.friend_id : f.user_id,
    );
    let friendEventsOut: FriendEventRow[] = [];
    if (friendIds.length > 0) {
      const { data: statuses } = await supabase
        .from('event_statuses')
        .select('event_id, user_id, status')
        .in('user_id', friendIds)
        .in('status', ['interested', 'confirmed']);
      const countByEvent = new Map<string, number>();
      (statuses ?? []).forEach((s) => {
        countByEvent.set(s.event_id, (countByEvent.get(s.event_id) ?? 0) + 1);
      });
      const eventIds = Array.from(countByEvent.keys());
      if (eventIds.length > 0) {
        const { data: fEvents } = await supabase
          .from('events')
          .select('*')
          .in('id', eventIds)
          .eq('visibility', 'public')
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(20);
        friendEventsOut = (fEvents ?? []).map((e) => ({
          event: e as Event,
          friendCount: countByEvent.get(e.id) ?? 0,
        }));
      }
    }
    setFriendEvents(friendEventsOut);

    // Followed organizer events
    const orgIds = (followsRes.data ?? [])
      .map((f) => f.organizer_org_id)
      .filter((id): id is string => Boolean(id));
    let organizerEventsOut: Event[] = [];
    if (orgIds.length > 0) {
      const { data: oEvents } = await supabase
        .from('events')
        .select('*')
        .in('organizer_org_id', orgIds)
        .eq('visibility', 'public')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(20);
      organizerEventsOut = (oEvents ?? []) as Event[];
    }
    setOrganizerEvents(organizerEventsOut);

    setPersonalLoading(false);
  }

  const filtered = (() => {
    let result = events;
    if (search.length >= 2) {
      const q = search.toLowerCase();
      // Defensive null guards: any event row with a null title/location/
      // category would otherwise crash the whole filter and bring down
      // the page via the ErrorBoundary.
      result = result.filter(
        (e) =>
          (e.title ?? '').toLowerCase().includes(q) ||
          (e.location ?? '').toLowerCase().includes(q) ||
          (e.category ?? '').toLowerCase().includes(q) ||
          (e.description ?? '').toLowerCase().includes(q),
      );
    }
    // Distance filter — only applied when the user has opted in by
    // tapping "In der Nähe" (which populates userLocation via browser
    // geolocation). Events without coordinates are kept out of a
    // distance-filtered view since we can't measure them.
    if (userLocation) {
      result = result.filter((e) => {
        if (e.latitude == null || e.longitude == null) return false;
        return distanceKm(userLocation, { lat: Number(e.latitude), lng: Number(e.longitude) }) <= radiusKm;
      });
    }
    // Sort — guard date as well so a row with date=null can't crash
    // localeCompare on the whole list.
    if (sort === 'soonest') result = [...result].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
    if (sort === 'latest') result = [...result].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    if (sort === 'relevance') result = [...result].sort((a, b) => ((b.interested_count ?? 0) + (b.confirmed_count ?? 0)) - ((a.interested_count ?? 0) + (a.confirmed_count ?? 0)));
    return result;
  })();

  // Request the user's location. Browsers prompt for permission the
  // first time; denial is permanent for the session (short of changing
  // site settings), so we track it separately from "loading".
  const requestNearby = () => {
    if (userLocation) {
      // Toggle off
      setUserLocation(null);
      setLocatingStatus('idle');
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocatingStatus('denied');
      return;
    }
    setLocatingStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocatingStatus('idle');
      },
      () => {
        setLocatingStatus('denied');
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  };

  const isSearching = search.length >= 2;
  const hasAnyPersonal =
    invitations.length > 0 || friendEvents.length > 0 || organizerEvents.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
      {!isSearching && (
        <div className="flex items-end justify-between gap-4 flex-wrap pt-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">Entdecken</h1>
            <p className="text-sm text-muted-fg mt-1">Finde Events in deiner Nähe</p>
          </div>
          <Link
            href="/app/events/create"
            className="group inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold bg-violet-600 text-white hover:bg-violet-500 active:scale-[0.98] transition-all shadow-lg shadow-violet-600/20"
          >
            <CalendarPlus size={15} strokeWidth={2.2} className="transition-transform group-hover:rotate-12" />
            Eigenes Event erstellen
          </Link>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder="Events, Orte, Kategorien suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3.5 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all duration-200"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Personal sections on MOBILE only — horizontal carousels above
          the main feed. Desktop renders them as a right-column sidebar
          further down so they live next to the "Mehr entdecken" grid. */}
      {!isSearching && user && hasAnyPersonal && (
        <div className="space-y-8 lg:hidden">
          {invitations.length > 0 && (
            <PersonalSection
              icon={<Mail size={16} className="text-violet-500" />}
              title="Einladungen"
              subtitle={`${invitations.length} ${invitations.length === 1 ? 'offene Einladung' : 'offene Einladungen'}`}
            >
              {invitations.map((inv) => (
                <CompactEventCard
                  key={inv.id}
                  event={inv.event}
                  contextBadge="Eingeladen"
                  accent
                />
              ))}
            </PersonalSection>
          )}

          {friendEvents.length > 0 && (
            <PersonalSection
              icon={<Users size={16} className="text-violet-500" />}
              title="Deine Freunde gehen hin"
            >
              {friendEvents.map(({ event, friendCount }) => (
                <CompactEventCard
                  key={event.id}
                  event={event}
                  contextBadge={
                    friendCount === 1 ? '1 Freund' : `${friendCount} Freunde`
                  }
                />
              ))}
            </PersonalSection>
          )}

          {organizerEvents.length > 0 && (
            <PersonalSection
              icon={<Building2 size={16} className="text-violet-500" />}
              title="Von Organizern, denen du folgst"
            >
              {organizerEvents.map((event) => (
                <CompactEventCard
                  key={event.id}
                  event={event}
                  contextBadge={event.organizer_name ?? undefined}
                />
              ))}
            </PersonalSection>
          )}
        </div>
      )}

      {/* Sort Chips (when searching) */}
      {isSearching && (
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-muted-fg" />
          {([['relevance', 'Relevanz'], ['soonest', 'Bald'], ['latest', 'Neueste']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 ${
                sort === key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-muted-fg">
            {filtered.length} {filtered.length === 1 ? 'Event' : 'Events'}
          </span>
        </div>
      )}

      {/* Location / distance filter — opt-in. Tapping "In der Nähe"
          requests the browser's current position and limits the grid
          to events within the selected radius. Denied permission
          surfaces a small hint instead of a silent no-op. */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          type="button"
          onClick={requestNearby}
          disabled={locatingStatus === 'loading'}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 disabled:opacity-60 ${
            userLocation
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-surface border border-border-subtle text-foreground/70 hover:text-foreground hover:border-border-strong'
          }`}
          title={userLocation ? 'Umkreis-Filter aktiv — klicken zum Deaktivieren' : 'Events in deiner Nähe anzeigen'}
        >
          {locatingStatus === 'loading' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <LocateFixed size={13} />
          )}
          In der Nähe
        </button>
        {userLocation && (
          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="px-3 py-2 rounded-full text-[13px] font-medium bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong focus:outline-none focus:border-violet-500/40"
          >
            {[5, 10, 25, 50, 100].map((km) => (
              <option key={km} value={km}>{km} km</option>
            ))}
          </select>
        )}
        {locatingStatus === 'denied' && (
          <span className="text-[11.5px] text-muted-fg">
            Standortzugriff verweigert. Aktiviere ihn in den Browser-Einstellungen.
          </span>
        )}
      </div>

      {/* Category Chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategory(null)}
          className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
            !category
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-surface border border-border-subtle text-foreground/70 hover:text-foreground hover:border-border-strong'
          }`}
        >
          Alle
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat === category ? null : cat)}
            className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
              category === cat
                ? 'text-white shadow-sm'
                : 'bg-surface border border-border-subtle text-foreground/70 hover:text-foreground hover:border-border-strong'
            }`}
            style={category === cat ? { backgroundColor: getCategoryColor(cat) } : undefined}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main area — single column on mobile, two-column on desktop with
          the personal sections acting as a right-hand sidebar so the
          "Mehr entdecken" feed sits next to "Freunde gehen hin" etc
          instead of below them. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8 lg:items-start">
        {/* Main feed */}
        <div className="space-y-5">
          {!isSearching && (
            <div className="flex items-center gap-2 pt-2">
              <Sparkles size={16} className="text-violet-500" />
              <h2 className="text-lg font-heading font-semibold">
                {hasAnyPersonal ? 'Mehr entdecken' : 'Events für dich'}
              </h2>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-3xl bg-surface border border-border-subtle overflow-hidden">
                  <div className="aspect-[191/100] bg-muted animate-pulse" />
                  <div className="p-5 space-y-3">
                    <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                    <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
              <Search size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
              <p className="text-base font-medium">Keine Events gefunden</p>
              <p className="text-[13px] mt-1.5">Versuche einen anderen Suchbegriff oder eine andere Kategorie.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 stagger-children">
              {filtered.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>

        {/* Desktop-only personal sidebar */}
        {!isSearching && user && hasAnyPersonal && (
          <aside className="hidden lg:block space-y-6 pt-2">
            {invitations.length > 0 && (
              <PersonalSection
                orientation="vertical"
                icon={<Mail size={15} className="text-violet-500" />}
                title="Einladungen"
                subtitle={`${invitations.length}`}
              >
                {invitations.map((inv) => (
                  <CompactEventCard
                    key={inv.id}
                    event={inv.event}
                    contextBadge="Eingeladen"
                    accent
                    fullWidth
                  />
                ))}
              </PersonalSection>
            )}
            {friendEvents.length > 0 && (
              <PersonalSection
                orientation="vertical"
                icon={<Users size={15} className="text-violet-500" />}
                title="Freunde gehen hin"
              >
                {friendEvents.map(({ event, friendCount }) => (
                  <CompactEventCard
                    key={event.id}
                    event={event}
                    contextBadge={friendCount === 1 ? '1 Freund' : `${friendCount} Freunde`}
                    fullWidth
                  />
                ))}
              </PersonalSection>
            )}
            {organizerEvents.length > 0 && (
              <PersonalSection
                orientation="vertical"
                icon={<Building2 size={15} className="text-violet-500" />}
                title="Gefolgte Organizer"
              >
                {organizerEvents.map((event) => (
                  <CompactEventCard
                    key={event.id}
                    event={event}
                    contextBadge={event.organizer_name ?? undefined}
                    fullWidth
                  />
                ))}
              </PersonalSection>
            )}
          </aside>
        )}
      </div>

      {/* Subtle personal-sections loading hint — only shows on first paint */}
      {personalLoading && user && !hasAnyPersonal && !isSearching && (
        <div className="sr-only" aria-live="polite">
          Lade persönliche Empfehlungen…
        </div>
      )}
    </div>
  );
}

function PersonalSection({
  icon,
  title,
  subtitle,
  children,
  orientation = 'horizontal',
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="translate-y-[2px]">{icon}</span>
        <h2 className="text-[15px] font-heading font-semibold">{title}</h2>
        {subtitle && (
          <span className="text-[12px] text-muted-fg">· {subtitle}</span>
        )}
      </div>
      {orientation === 'vertical' ? (
        <div className="flex flex-col gap-3">{children}</div>
      ) : (
        <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      )}
    </section>
  );
}

function CompactEventCard({
  event,
  contextBadge,
  accent,
  fullWidth,
}: {
  event: Event;
  contextBadge?: string;
  accent?: boolean;
  fullWidth?: boolean;
}) {
  const catColor = getCategoryColor(event.category);
  // Horizontal scroll uses a fixed width to snap nicely; vertical
  // sidebar column takes the parent's full width instead.
  const sizingClass = fullWidth
    ? 'w-full'
    : 'flex-shrink-0 w-[300px] snap-start';
  return (
    <Link
      href={`/app/event/${event.id}`}
      className={`group ${sizingClass} rounded-2xl border bg-surface overflow-hidden hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 transition-all duration-300 ${
        accent
          ? 'border-violet-500/40 hover:border-violet-500/60'
          : 'border-border-subtle hover:border-border-strong'
      }`}
    >
      <div className="aspect-[191/100] bg-muted relative overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.03]">
          <EventBanner event={event} />
        </div>
        {contextBadge && (
          <span
            className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-sm ${
              accent
                ? 'bg-violet-600/90 text-white'
                : 'bg-black/50 text-white'
            }`}
          >
            {contextBadge}
          </span>
        )}
        {event.category && event.category.trim() ? (
          <span
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white backdrop-blur-sm"
            style={{ backgroundColor: `${catColor}dd` }}
          >
            {event.category}
          </span>
        ) : null}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-heading font-semibold text-[15px] leading-snug line-clamp-2">
          {event.title}
        </h3>
        <div className="flex items-center gap-3 text-[12px] text-muted-fg">
          <span className="flex items-center gap-1.5">
            <Calendar size={12} strokeWidth={1.6} />
            {formatDate(event.date)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={12} strokeWidth={1.6} />
            {formatTime(event.time)}
          </span>
        </div>
        <p className="text-[12px] text-muted-fg truncate flex items-center gap-1.5">
          <MapPin size={12} strokeWidth={1.6} className="flex-shrink-0" />
          {event.location}
        </p>
      </div>
    </Link>
  );
}

function EventCard({ event }: { event: Event }) {
  const catColor = getCategoryColor(event.category);

  return (
    <Link
      href={`/app/event/${event.id}`}
      className="group rounded-3xl border border-border-subtle bg-surface overflow-hidden hover:shadow-[var(--shadow-lg)] hover:border-border-strong hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="aspect-[191/100] bg-muted relative overflow-hidden">
        <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.03]">
          <EventBanner event={event} />
        </div>
        {event.category && event.category.trim() ? (
          <span
            className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white backdrop-blur-sm"
            style={{ backgroundColor: `${catColor}dd` }}
          >
            {event.category}
          </span>
        ) : null}
      </div>

      <div className="p-5 space-y-3">
        <h3 className="font-heading font-semibold text-[18px] leading-snug line-clamp-2 group-hover:text-foreground/80 transition-colors">
          {event.title}
        </h3>
        {event.slogan && (
          <p className="text-[13px] text-muted-fg line-clamp-1">{event.slogan}</p>
        )}
        <div className="flex items-center gap-3 text-[13px] text-muted-fg">
          <span className="flex items-center gap-1.5">
            <Calendar size={13} strokeWidth={1.6} />
            {formatDate(event.date)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={13} strokeWidth={1.6} />
            {formatTime(event.time)}
          </span>
        </div>
        <p className="text-[13px] text-muted-fg truncate flex items-center gap-1.5">
          <MapPin size={13} strokeWidth={1.6} className="flex-shrink-0" />
          {event.location}
        </p>
        <div className="flex items-center gap-5 text-[12px] text-muted-fg pt-3 border-t border-border-subtle">
          <span className="flex items-center gap-1.5">
            <Heart size={12} strokeWidth={1.6} />
            {event.interested_count} interessiert
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} strokeWidth={1.6} />
            {event.confirmed_count} bestätigt
          </span>
        </div>
      </div>
    </Link>
  );
}
