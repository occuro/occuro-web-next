'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import type { Event } from '@/types/occuro';
import { formatDate, getCategoryColor } from '@/lib/utils';
import { MapPin, X } from 'lucide-react';

// Both map providers are heavy (mapkit script / maplibre bundle), so we
// dynamic-import them client-only to keep them out of the initial bundle.
const AppleMap = dynamic(() => import('@/components/apple-map').then((m) => m.AppleMap), { ssr: false });
const MapLibreFallback = dynamic(
  () => import('@/components/maplibre-map').then((m) => m.MapLibreFallback),
  { ssr: false },
);

const CATEGORIES = ['Music', 'Business', 'Health', 'Sports', 'Education', 'Art', 'Food', 'Technology', 'Community', 'Outdoor'];

type MapProvider = 'probing' | 'apple' | 'maplibre';

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
  const [provider, setProvider] = useState<MapProvider>('probing');

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
  }, [category]);

  async function fetchEvents() {
    setLoading(true);
    let query = supabase
      .from('events')
      .select('*')
      .eq('visibility', 'public')
      .gte('date', new Date().toISOString().split('T')[0])
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('date', { ascending: true })
      .limit(200);
    if (category) query = query.ilike('category', category);
    const { data } = await query;
    setEvents((data ?? []) as Event[]);
    setLoading(false);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Karte</h1>
          <p className="text-sm text-muted-fg mt-1">{events.length} Events mit Standort</p>
        </div>
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
              events={events}
              selected={selected}
              onSelect={setSelected}
              skipAutoLocate={Boolean(deeplinkEventId)}
            />
          ) : (
            <MapLibreFallback
              events={events}
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
