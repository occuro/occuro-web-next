'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { Event } from '@/types/occuro';
import Link from 'next/link';
import { formatDate, getCategoryColor } from '@/lib/utils';
import { MapPin, X, CalendarRange, Sparkles, Sun, Sunrise, Wine, CalendarDays, ArrowRight, Clock } from 'lucide-react';

// Both map providers are heavy (mapkit script / maplibre bundle), so we
// dynamic-import them client-only to keep them out of the initial bundle.
const AppleMap = dynamic(() => import('@/components/apple-map').then((m) => m.AppleMap), { ssr: false });
const MapLibreFallback = dynamic(
  () => import('@/components/maplibre-map').then((m) => m.MapLibreFallback),
  { ssr: false },
);

type MapProvider = 'probing' | 'apple' | 'maplibre';
type DateRange = 'all' | 'today' | 'tomorrow' | 'weekend' | 'week';

const GEOCODE_CACHE_KEY = '@occuro/event-geocode-cache';

interface GeocodeCache {
  [eventId: string]: { lat: number; lng: number };
}

function loadGeocodeCache(): GeocodeCache {
  try {
    const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGeocodeCache(cache: GeocodeCache) {
  try {
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

// Compute the start/end ISO date strings for a date filter range.
function dateRangeToBounds(range: DateRange): { gte: string; lte: string | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  switch (range) {
    case 'today':
      return { gte: fmt(today), lte: fmt(today) };
    case 'tomorrow': {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      return { gte: fmt(t), lte: fmt(t) };
    }
    case 'weekend': {
      // Friday → Sunday of the current week (or next if today is past Sun)
      const dow = today.getDay(); // 0=Sun, 6=Sat
      const daysToFri = dow <= 5 ? 5 - dow : 12 - dow; // if Sat/Sun, jump to next Fri
      const fri = new Date(today);
      fri.setDate(fri.getDate() + daysToFri);
      const sun = new Date(fri);
      sun.setDate(sun.getDate() + 2);
      return { gte: fmt(fri), lte: fmt(sun) };
    }
    case 'week': {
      const week = new Date(today);
      week.setDate(week.getDate() + 7);
      return { gte: fmt(today), lte: fmt(week) };
    }
    default:
      return { gte: fmt(today), lte: null };
  }
}

// Wrapping the inner component in <Suspense> is REQUIRED by Next.js
// when a client component reads useSearchParams() — without it, the
// production build fails with "useSearchParams() should be wrapped
// in a suspense boundary". Without the boundary the server can't
// statically prerender the page and the whole deploy aborts.
export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapPageInner />
    </Suspense>
  );
}

function MapPageInner() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [provider, setProvider] = useState<MapProvider>('probing');
  // Tracks how many events are still being geocoded in the background
  // so we can show a small spinner next to the count.
  const [geocoding, setGeocoding] = useState(0);
  // Total fetched (with or without coords) so the empty-state can
  // distinguish "no events at all" from "events exist but no coords yet".
  const [fetchedCount, setFetchedCount] = useState(0);
  // Surface fetch errors in the empty state so a dead supabase client
  // (auth deadlock, network loss) can't be mistaken for "no events".
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Deeplink: ?event=… — when the user clicks an event's location on
  // the detail page we land here, fetch that event by id, and select
  // it so the map auto-pans + opens the popup. lat/lng are passed for
  // forward compat / sharable URLs but the event's own coords drive
  // the actual centering via the maps' useEffect on `selected`.
  const deeplinkEventId = searchParams.get('event');

  useEffect(() => {
    if (!deeplinkEventId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', deeplinkEventId)
        .maybeSingle();
      if (cancelled || !data) return;
      setSelected(data as Event);
    })();
    return () => { cancelled = true; };
    // Only re-run when the deeplink event id changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deeplinkEventId]);

  // ── Probe which map provider to use ────────────────────────────────
  // Hit /api/maps/token once on mount. If it returns a token, Apple
  // MapKit JS is configured and we use it. Otherwise fall back to
  // MapLibre + OpenFreeMap (zero-config, fully free).
  useEffect(() => {
    fetch('/api/maps/token')
      .then((r) => r.json())
      .then((data) => {
        setProvider(data?.token ? 'apple' : 'maplibre');
      })
      .catch(() => setProvider('maplibre'));
  }, []);

  useEffect(() => {
    void fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  async function fetchEvents() {
    setLoading(true);
    const bounds = dateRangeToBounds(dateRange);
    // No visibility filter — RLS on events already restricts what a
    // user can read: public events for everyone, private events only
    // for invitees / participants / the organizer. Filtering by
    // visibility='public' client-side was hiding private events from
    // the very users who SHOULD see them on the map.
    let query = supabase
      .from('events')
      .select('*')
      .gte('date', bounds.gte)
      .order('date', { ascending: true })
      .limit(200);
    if (bounds.lte) query = query.lte('date', bounds.lte);
    const { data, error } = await query;
    if (error) {
      console.warn('[map] events fetch failed:', error.message);
      setFetchError(error.message);
    } else {
      setFetchError(null);
    }
    // CRITICAL: supabase-js returns numeric columns (like latitude /
    // longitude on the events table) as STRINGS by default to preserve
    // precision. mapkit and maplibre both silently no-op on string
    // coordinates → no pins. Force-convert here so every downstream
    // consumer can rely on real numbers.
    const all = ((data ?? []) as Event[]).map((e) => ({
      ...e,
      latitude: e.latitude != null ? Number(e.latitude) : null,
      longitude: e.longitude != null ? Number(e.longitude) : null,
    }));
    setFetchedCount(all.length);
    console.info(`[map] fetched ${all.length} events for range=${dateRange}`, all.slice(0, 3));

    // Apply any cached geocodes from a previous visit so the user
    // doesn't see "no pins" while we re-geocode the same events.
    const cache = loadGeocodeCache();
    const enriched = all.map((e) => {
      if (e.latitude != null && e.longitude != null && !Number.isNaN(e.latitude) && !Number.isNaN(e.longitude)) return e;
      const cached = cache[e.id];
      return cached ? { ...e, latitude: cached.lat, longitude: cached.lng } : e;
    });
    setEvents(enriched);
    setLoading(false);

    // Background-geocode anything still missing coords. We hit
    // Nominatim with a 1.1 sec delay between requests to stay safely
    // under their 1 req/sec policy. As each lookup completes we patch
    // the events array AND the cache so reloading the page doesn't
    // hit Nominatim again for the same locations.
    const missing = enriched.filter(
      (e) => (e.latitude == null || e.longitude == null) && e.location && e.location.trim().length > 1,
    );
    if (missing.length === 0) return;
    setGeocoding(missing.length);

    void (async () => {
      for (const event of missing) {
        try {
          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(event.location!)}&format=json&limit=1`;
          const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
          const json = (await res.json()) as Array<{ lat: string; lon: string }>;
          const hit = json[0];
          if (hit) {
            const lat = parseFloat(hit.lat);
            const lng = parseFloat(hit.lon);
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
              setEvents((prev) =>
                prev.map((p) => (p.id === event.id ? { ...p, latitude: lat, longitude: lng } : p)),
              );
              const c = loadGeocodeCache();
              c[event.id] = { lat, lng };
              saveGeocodeCache(c);
            }
          }
        } catch (err) {
          console.warn('[map] nominatim lookup failed for', event.id, err);
        }
        setGeocoding((n) => n - 1);
        // Rate limit: 1 req/sec policy + small buffer
        await new Promise((r) => setTimeout(r, 1100));
      }
    })();
  }

  // Only events with valid numeric coords get rendered as pins.
  // Events that are still being geocoded in the background pop in as
  // their lat/lng resolves (the events state is patched in place).
  // The Number.isFinite check filters out NaN that comes back when
  // supabase returns garbage strings or the geocoder returns junk.
  const eventsWithCoords = useMemo(
    () => events.filter((e) =>
      e.latitude != null && e.longitude != null
      && Number.isFinite(e.latitude) && Number.isFinite(e.longitude)
    ),
    [events],
  );

  // Always render the selected event as a pin, even if it's not in
  // the filtered events array (e.g. when arriving via a deeplink to
  // an event that's outside the current category filter or that's
  // a private event). Without this merge the map opens at the right
  // location but shows no marker — exactly the bug the user hit.
  const mergedEvents = useMemo(() => {
    if (!selected || selected.latitude == null || selected.longitude == null) return eventsWithCoords;
    if (eventsWithCoords.some((e) => e.id === selected.id)) return eventsWithCoords;
    return [selected, ...eventsWithCoords];
  }, [eventsWithCoords, selected]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Karte</h1>
          <p className="text-sm text-muted-fg mt-1">
            {fetchedCount === 0
              ? 'Keine Events in diesem Zeitraum'
              : (
                <>
                  {eventsWithCoords.length} von {fetchedCount} Events auf der Karte
                  {geocoding > 0 && (
                    <span className="ml-2 text-violet-400">
                      · {geocoding} werden geladen…
                    </span>
                  )}
                </>
              )}
          </p>
        </div>
      </div>

      {/* Date range — bigger icon-cards instead of plain pills. Each
          card is square-ish and tappable, mobile-style. Five options
          fit in one row on desktop and wrap to a 2x3 grid on mobile. */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {([
          { key: 'all' as const, label: 'Alle', icon: Sparkles },
          { key: 'today' as const, label: 'Heute', icon: Sun },
          { key: 'tomorrow' as const, label: 'Morgen', icon: Sunrise },
          { key: 'weekend' as const, label: 'Wochenende', icon: Wine },
          { key: 'week' as const, label: 'Diese Woche', icon: CalendarRange },
        ]).map((d) => {
          const Icon = d.icon;
          const active = dateRange === d.key;
          return (
            <button
              key={d.key}
              onClick={() => setDateRange(d.key)}
              className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-2xl border transition-all duration-200 ${
                active
                  ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-600/20'
                  : 'bg-surface border-border-subtle text-foreground/70 hover:border-border-strong hover:bg-elevated/50'
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.4 : 1.8} />
              <span className="text-[11px] font-semibold">{d.label}</span>
            </button>
          );
        })}
      </div>

      {/* Events left, map right (mobile parity).
          Mobile-first layout stacks the events list on top followed by
          the map; on lg screens they sit side-by-side with the events
          on the left so users can scan the list and click into the
          right side. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Events sidebar (left on lg+) */}
        <div className="lg:col-span-2 space-y-2 lg:max-h-[640px] lg:overflow-y-auto pr-1 order-2 lg:order-1">
          {events.length === 0 ? (
            <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
              <CalendarDays size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
              {fetchError ? (
                <>
                  <p className="text-sm font-medium">Events konnten nicht geladen werden</p>
                  <p className="text-[11px] mt-1 mb-4">Prüfe deine Verbindung und versuch es erneut.</p>
                  <button
                    onClick={() => void fetchEvents()}
                    className="px-4 py-2 rounded-full text-[12px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                  >
                    Neu laden
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Keine anstehenden Events</p>
                  <p className="text-[11px] mt-1">Versuche einen anderen Zeitraum.</p>
                </>
              )}
            </div>
          ) : (
            events.map((event) => {
              const hasCoords = event.latitude != null && event.longitude != null && Number.isFinite(event.latitude) && Number.isFinite(event.longitude);
              return (
                <button
                  key={event.id}
                  onClick={() => hasCoords && setSelected(event)}
                  disabled={!hasCoords}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 ${
                    selected?.id === event.id
                      ? 'bg-violet-500/10 border border-violet-500/30'
                      : 'border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong'
                  } ${!hasCoords ? 'opacity-60 cursor-default' : ''}`}
                  title={hasCoords ? '' : 'Koordinaten werden geladen…'}
                >
                  <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryColor(event.category) }} />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[13px] font-medium truncate">{event.title}</h4>
                    <p className="text-[11px] text-muted-fg truncate flex items-center gap-1">
                      <MapPin size={10} className="flex-shrink-0" />{event.location}
                    </p>
                    <p className="text-[11px] text-muted-fg">{formatDate(event.date)}</p>
                  </div>
                  {!hasCoords && (
                    <span className="text-[9px] text-muted-fg/70 italic flex-shrink-0">Lädt…</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Map (right on lg+) */}
        <div className="lg:col-span-3 rounded-2xl border border-border-subtle bg-surface overflow-hidden relative h-[420px] sm:h-[520px] lg:h-[640px] order-1 lg:order-2">
          {loading || provider === 'probing' ? (
            <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
              <MapPin size={32} className="text-muted-fg/30" />
            </div>
          ) : provider === 'apple' ? (
            <AppleMap
              events={mergedEvents}
              selected={selected}
              onSelect={setSelected}
              skipAutoLocate={Boolean(deeplinkEventId)}
            />
          ) : (
            <MapLibreFallback
              events={mergedEvents}
              selected={selected}
              onSelect={setSelected}
              skipAutoLocate={Boolean(deeplinkEventId)}
            />
          )}

          {/* Pin-click: floating card over the map with event summary +
              CTA to open the detail page. Replaces the old bare
              "Schließen" button which gave users no way to actually
              open the event they tapped on. */}
          {selected && (
            <div className="absolute top-4 left-4 right-4 sm:right-auto sm:max-w-[360px] z-10 animate-fade-in">
              <div className="flex gap-3 p-3 rounded-2xl bg-surface/95 border border-border-subtle backdrop-blur-md shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]">
                <div
                  className="w-1.5 self-stretch rounded-full flex-shrink-0"
                  style={{ backgroundColor: getCategoryColor(selected.category) }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-semibold leading-snug line-clamp-1">
                    {selected.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-[11.5px] text-muted-fg">
                    <span className="flex items-center gap-1">
                      <CalendarDays size={11} />
                      {formatDate(selected.date)}
                    </span>
                    {selected.time && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {selected.time.slice(0, 5)}
                      </span>
                    )}
                  </div>
                  {selected.location && (
                    <p className="text-[11.5px] text-muted-fg truncate flex items-center gap-1 mt-0.5">
                      <MapPin size={11} className="flex-shrink-0" />
                      {selected.location}
                    </p>
                  )}
                  <Link
                    href={`/app/event/${selected.id}`}
                    className="inline-flex items-center gap-1 mt-2.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                  >
                    Event-Details <ArrowRight size={12} />
                  </Link>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Schließen"
                  className="p-1.5 rounded-full text-muted-fg hover:text-foreground hover:bg-elevated transition-colors self-start flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
