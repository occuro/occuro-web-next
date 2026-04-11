'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import { MapPin, Calendar, Heart, CheckCircle2, ImageOff, X, Locate, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
} from '@vis.gl/react-google-maps';

// Google Maps JavaScript API key. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in
// your Vercel project (and `.env.local` for dev). Without a key, we
// render a friendly setup placeholder instead of a broken map.
//
// To get a key:
//   1. console.cloud.google.com → create project → enable "Maps JavaScript API"
//   2. APIs & Services → Credentials → Create credentials → API key
//   3. Restrict the key to HTTP referrers (your domains)
//
// Map ID: required for AdvancedMarker. Create one in Google Cloud Console
// under Map Management → Map IDs (Vector type). Set NEXT_PUBLIC_GOOGLE_MAPS_ID.
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_ID ?? 'DEMO_MAP_ID';

const CATEGORIES = ['Music', 'Business', 'Health', 'Sports', 'Education', 'Art', 'Food', 'Technology', 'Community', 'Outdoor'];

// Default view: roughly centered Germany/Austria/Switzerland.
const DEFAULT_CENTER = { lat: 51.1657, lng: 10.4515 };
const DEFAULT_ZOOM = 5;

export default function MapPage() {
  const supabase = createClient();

  const [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);

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
          {loading ? (
            <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
              <MapPin size={32} className="text-muted-fg/30" />
            </div>
          ) : !GOOGLE_MAPS_API_KEY ? (
            <SetupPlaceholder />
          ) : (
            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
              <MapInner
                events={events}
                selected={selected}
                onSelect={setSelected}
              />
            </APIProvider>
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

// ────────────────────────────────────────────────────────────────────
// Inner map component — needs to live inside <APIProvider> so the
// useMap() hook can talk to the actual Google Map instance for fly-to,
// fit-bounds, locate-me, etc.
// ────────────────────────────────────────────────────────────────────

function MapInner({
  events,
  selected,
  onSelect,
}: {
  events: Event[];
  selected: Event | null;
  onSelect: (e: Event | null) => void;
}) {
  const map = useMap();
  const didFitRef = useRef(false);

  // Compute initial center based on whether we have events.
  const initialCenter = useMemo(() => {
    if (events.length === 0) return DEFAULT_CENTER;
    if (events.length === 1) {
      return { lat: events[0].latitude!, lng: events[0].longitude! };
    }
    const lats = events.map((e) => e.latitude!);
    const lngs = events.map((e) => e.longitude!);
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }, [events]);

  // Fit bounds whenever the event set changes — guarded so we only fit
  // automatically once on mount; subsequent fits are explicit (clicking
  // a list item flies to it instead of forcing a re-fit).
  useEffect(() => {
    if (!map || events.length < 2 || didFitRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    events.forEach((e) => bounds.extend({ lat: e.latitude!, lng: e.longitude! }));
    map.fitBounds(bounds, 60);
    didFitRef.current = true;
  }, [map, events]);

  // Fly to whatever's selected
  useEffect(() => {
    if (!map || !selected) return;
    map.panTo({ lat: selected.latitude!, lng: selected.longitude! });
    if ((map.getZoom() ?? 0) < 12) map.setZoom(13);
  }, [map, selected]);

  function locateMe() {
    if (!navigator.geolocation || !map) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        map.setZoom(12);
      },
      () => {},
      { timeout: 5000 },
    );
  }

  return (
    <>
      <GoogleMap
        defaultCenter={initialCenter}
        defaultZoom={DEFAULT_ZOOM}
        mapId={GOOGLE_MAPS_ID}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        style={{ width: '100%', height: '100%' }}
      >
        {events.map((event) => {
          const color = getCategoryColor(event.category);
          const isSelected = selected?.id === event.id;
          return (
            <AdvancedMarker
              key={event.id}
              position={{ lat: event.latitude!, lng: event.longitude! }}
              onClick={() => onSelect(event)}
            >
              <div
                className={`relative flex items-center justify-center transition-transform ${
                  isSelected ? 'scale-125' : 'hover:scale-110'
                }`}
              >
                <svg width="34" height="44" viewBox="0 0 34 44" className="drop-shadow-lg">
                  <path
                    d="M17 1C8.16 1 1 8.16 1 17c0 12 16 26 16 26s16-14 16-26c0-8.84-7.16-16-16-16z"
                    fill={color}
                    stroke="#FFFFFF"
                    strokeWidth="2"
                  />
                  <circle cx="17" cy="17" r="6" fill="#FFFFFF" />
                </svg>
              </div>
            </AdvancedMarker>
          );
        })}

        {selected && (
          <InfoWindow
            position={{ lat: selected.latitude!, lng: selected.longitude! }}
            pixelOffset={[0, -44]}
            onCloseClick={() => onSelect(null)}
            headerDisabled
          >
            <div className="min-w-[220px] font-[inherit]">
              <div className="flex items-start gap-2.5">
                <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                  {selected.banner_url || selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.banner_url ?? selected.image_url ?? ''} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff size={14} className="text-muted-fg/40" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold text-white"
                    style={{ backgroundColor: getCategoryColor(selected.category) }}
                  >
                    {selected.category}
                  </span>
                  <h3 className="font-semibold text-[13px] truncate mt-1 text-foreground">{selected.title}</h3>
                  <p className="text-[11px] text-muted-fg flex items-center gap-1 mt-0.5">
                    <Calendar size={10} />{formatDate(selected.date)} · {formatTime(selected.time)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-border-subtle">
                <div className="flex items-center gap-3 text-[11px] text-muted-fg">
                  <span className="flex items-center gap-1"><Heart size={10} />{selected.interested_count}</span>
                  <span className="flex items-center gap-1"><CheckCircle2 size={10} />{selected.confirmed_count}</span>
                </div>
                <Link
                  href={`/app/event/${selected.id}`}
                  className="text-[11px] font-semibold text-violet-500 hover:text-violet-400"
                >
                  Details →
                </Link>
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Locate-me button */}
      <button
        onClick={locateMe}
        className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-surface border border-border-subtle shadow-lg flex items-center justify-center hover:bg-elevated transition-colors z-10"
        aria-label="Mein Standort"
      >
        <Locate size={17} className="text-foreground" />
      </button>

      {/* Close popup helper */}
      {selected && (
        <button
          onClick={() => onSelect(null)}
          className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-surface/90 border border-border-subtle backdrop-blur text-[12px] font-medium hover:bg-elevated transition-colors flex items-center gap-1.5 z-10"
        >
          <X size={13} /> Schließen
        </button>
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────
// Setup placeholder — shown when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing
// ────────────────────────────────────────────────────────────────────

function SetupPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center p-8 bg-gradient-to-br from-muted/40 to-elevated/20">
      <div className="max-w-md text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mx-auto">
          <AlertTriangle size={26} />
        </div>
        <h3 className="text-lg font-heading font-semibold">Google Maps API Key benötigt</h3>
        <p className="text-sm text-muted-fg leading-relaxed">
          Setze <code className="px-1.5 py-0.5 rounded bg-elevated text-[11px]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in
          deinen Vercel- und lokalen Environment-Variablen, um die Karte zu aktivieren.
        </p>
        <ol className="text-[12px] text-muted-fg text-left space-y-1.5 bg-surface rounded-xl border border-border-subtle p-4">
          <li>1. <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">Google Cloud Console</a> öffnen</li>
          <li>2. Projekt anlegen, &quot;Maps JavaScript API&quot; aktivieren</li>
          <li>3. Credentials → API-Key erstellen</li>
          <li>4. Map ID anlegen (Vector) → <code className="px-1 py-0.5 rounded bg-elevated text-[10px]">NEXT_PUBLIC_GOOGLE_MAPS_ID</code></li>
        </ol>
      </div>
    </div>
  );
}
