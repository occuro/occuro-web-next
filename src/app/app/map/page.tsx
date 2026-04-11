'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { Event } from '@/types/occuro';
import { formatDate, getCategoryColor } from '@/lib/utils';
import { MapPin, X, CalendarDays } from 'lucide-react';

// Both map providers are heavy (mapkit script / maplibre bundle), so we
// dynamic-import them client-only to keep them out of the initial bundle.
const AppleMap = dynamic(() => import('@/components/apple-map').then((m) => m.AppleMap), { ssr: false });
const MapLibreFallback = dynamic(
  () => import('@/components/maplibre-map').then((m) => m.MapLibreFallback),
  { ssr: false },
);

const CATEGORIES = ['Music', 'Business', 'Health', 'Sports', 'Education', 'Art & Culture', 'Food & Drink', 'Technology', 'Community', 'Outdoor'];

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
  const [category, setCategory] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [provider, setProvider] = useState<MapProvider>('probing');
  // Tracks how many events are still being geocoded in the background
  // so we can show a small spinner next to the count.
  const [geocoding, setGeocoding] = useState(0);

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
  }, [category, dateRange]);

  async function fetchEvents() {
    setLoading(true);
    const bounds = dateRangeToBounds(dateRange);
    let query = supabase
      .from('events')
      .select('*')
      .eq('visibility', 'public')
      .gte('date', bounds.gte)
      .order('date', { ascending: true })
      .limit(200);
    if (bounds.lte) query = query.lte('date', bounds.lte);
    if (category) query = query.ilike('category', category);
    const { data } = await query;
    const all = (data ?? []) as Event[];

    // Apply any cached geocodes from a previous visit so the user
    // doesn't see "no pins" while we re-geocode the same events.
    const cache = loadGeocodeCache();
    const enriched = all.map((e) => {
      if (e.latitude != null && e.longitude != null) return e;
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

  // Only events with coords get rendered as pins. Events that are
  // still being geocoded in the background pop in as their lat/lng
  // resolves (the events state is patched in place).
  const eventsWithCoords = useMemo(
    () => events.filter((e) => e.latitude != null && e.longitude != null),
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
            {eventsWithCoords.length} Events auf der Karte
            {geocoding > 0 && (
              <span className="ml-2 text-violet-400">
                · {geocoding} werden geladen…
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Date filter — pills, mobile-style */}
      <div className="flex gap-2 flex-wrap items-center">
        <CalendarDays size={14} className="text-muted-fg" />
        {([
          { key: 'all' as const, label: 'Alle' },
          { key: 'today' as const, label: 'Heute' },
          { key: 'tomorrow' as const, label: 'Morgen' },
          { key: 'weekend' as const, label: 'Wochenende' },
          { key: 'week' as const, label: 'Diese Woche' },
        ]).map((d) => (
          <button
            key={d.key}
            onClick={() => setDateRange(d.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              dateRange === d.key
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategory(null)}
          className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
            !category ? 'bg-violet-600 text-white' : 'bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong'
          }`}
        >
          Alle
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat === category ? null : cat)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              category === cat ? 'text-white shadow-sm' : 'bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong'
            }`}
            style={category === cat ? { backgroundColor: getCategoryColor(cat) } : undefined}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Map + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-2xl border border-border-subtle bg-surface overflow-hidden relative h-[420px] sm:h-[520px] lg:h-[640px]">
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

          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-surface/90 border border-border-subtle backdrop-blur text-[12px] font-medium hover:bg-elevated transition-colors flex items-center gap-1.5 z-10"
            >
              <X size={13} /> Schließen
            </button>
          )}
        </div>

        {/* Sidebar list */}
        <div className="lg:col-span-2 space-y-2 lg:max-h-[640px] lg:overflow-y-auto pr-1">
          {events.length === 0 ? (
            <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
              <MapPin size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Keine Events mit Standort</p>
            </div>
          ) : (
            events.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelected(event)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-200 ${
                  selected?.id === event.id
                    ? 'bg-violet-500/10 border border-violet-500/30'
                    : 'border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong'
                }`}
              >
                <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryColor(event.category) }} />
                <div className="flex-1 min-w-0">
                  <h4 className="text-[13px] font-medium truncate">{event.title}</h4>
                  <p className="text-[11px] text-muted-fg truncate flex items-center gap-1">
                    <MapPin size={10} className="flex-shrink-0" />{event.location}
                  </p>
                  <p className="text-[11px] text-muted-fg">{formatDate(event.date)}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
