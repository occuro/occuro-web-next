'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import { MapPin, Calendar, Clock, Heart, CheckCircle2, ImageOff, X, Locate } from 'lucide-react';
import Link from 'next/link';

import 'maplibre-gl/dist/maplibre-gl.css';
// react-map-gl exports the maplibre adapter under /maplibre. We import the
// pieces we need rather than the legacy `react-map-gl` default which is
// the mapbox build. This keeps everything BSD-licensed and avoids the
// mapbox token requirement.
import { Map as MapLibreMap, Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/maplibre';

// MapLibre style — we use the OpenFreeMap "liberty" style which is a
// professional vector-tile basemap, free, no API key required, and looks
// great in both light and dark mode. If we ever outgrow it we can swap to
// MapTiler with an API key by changing this URL.
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

const CATEGORIES = ['Music', 'Business', 'Health', 'Sports', 'Education', 'Art', 'Food', 'Technology', 'Community', 'Outdoor'];

// Default view: roughly centered Germany/Austria/Switzerland.
const DEFAULT_VIEW = { longitude: 10.4515, latitude: 51.1657, zoom: 4.5 };

export default function MapPage() {
  const supabase = createClient();
  const mapRef = useRef<MapRef | null>(null);

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

  // ── Initial view: zoom to fit all markers when events first load ────
  const initialView = useMemo(() => {
    if (events.length === 0) return DEFAULT_VIEW;
    if (events.length === 1) {
      return { longitude: events[0].longitude!, latitude: events[0].latitude!, zoom: 11 };
    }
    // Compute bbox center + a reasonable zoom for now; we re-fit on map load.
    const lngs = events.map((e) => e.longitude!);
    const lats = events.map((e) => e.latitude!);
    return {
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      zoom: 5,
    };
  }, [events]);

  // ── Auto-fit bounds when events change ──────────────────────────────
  useEffect(() => {
    if (!mapRef.current || events.length < 2) return;
    const lngs = events.map((e) => e.longitude!);
    const lats = events.map((e) => e.latitude!);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    mapRef.current.fitBounds(bounds, { padding: 60, duration: 600, maxZoom: 12 });
  }, [events]);

  function flyTo(event: Event) {
    setSelected(event);
    mapRef.current?.flyTo({
      center: [event.longitude!, event.latitude!],
      zoom: 13,
      duration: 800,
      essential: true,
    });
  }

  function locateMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 12,
          duration: 800,
        });
      },
      () => {},
      { timeout: 5000 },
    );
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
        <div className="lg:col-span-3 rounded-2xl border border-border-subtle bg-surface overflow-hidden relative" style={{ height: '640px' }}>
          {loading ? (
            <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
              <MapPin size={32} className="text-muted-fg/30" />
            </div>
          ) : (
            <MapLibreMap
              ref={mapRef}
              initialViewState={initialView}
              mapStyle={MAP_STYLE_URL}
              attributionControl={{ compact: true }}
              style={{ width: '100%', height: '100%' }}
            >
              <NavigationControl position="top-right" />
              {events.map((event) => {
                const color = getCategoryColor(event.category);
                const isSelected = selected?.id === event.id;
                return (
                  <Marker
                    key={event.id}
                    longitude={event.longitude!}
                    latitude={event.latitude!}
                    anchor="bottom"
                    onClick={(e) => {
                      e.originalEvent.stopPropagation();
                      flyTo(event);
                    }}
                  >
                    <button
                      className="group relative cursor-pointer"
                      style={{ transform: isSelected ? 'translateY(-2px)' : undefined }}
                    >
                      {/* Pin shape */}
                      <div
                        className={`relative flex items-center justify-center transition-transform ${
                          isSelected ? 'scale-125' : 'group-hover:scale-110'
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
                    </button>
                  </Marker>
                );
              })}

              {/* Popup */}
              {selected && (
                <Popup
                  longitude={selected.longitude!}
                  latitude={selected.latitude!}
                  anchor="bottom"
                  offset={44}
                  closeButton={false}
                  closeOnClick={false}
                  className="!font-[inherit]"
                >
                  <div className="min-w-[220px]">
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
                </Popup>
              )}
            </MapLibreMap>
          )}

          {/* Locate-me button */}
          <button
            onClick={locateMe}
            className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-surface border border-border-subtle shadow-lg flex items-center justify-center hover:bg-elevated transition-colors"
            aria-label="Mein Standort"
          >
            <Locate size={17} className="text-foreground" />
          </button>

          {/* Close popup helper */}
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-surface/90 border border-border-subtle backdrop-blur text-[12px] font-medium hover:bg-elevated transition-colors flex items-center gap-1.5"
            >
              <X size={13} /> Schließen
            </button>
          )}
        </div>

        {/* Sidebar list */}
        <div className="lg:col-span-2 space-y-2 max-h-[640px] overflow-y-auto pr-1">
          {events.length === 0 ? (
            <div className="text-center py-16 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
              <MapPin size={32} strokeWidth={1.2} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm font-medium">Keine Events mit Standort</p>
            </div>
          ) : (
            events.map((event) => (
              <button
                key={event.id}
                onClick={() => flyTo(event)}
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
