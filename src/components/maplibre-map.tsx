'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import { Calendar, Heart, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, Marker, NavigationControl, Popup, type MapRef } from 'react-map-gl/maplibre';
import { MapSearchBar } from '@/components/map-search-bar';
import { EventBanner } from '@/components/event-banner';

// Tile provider — defaults to OpenFreeMap (zero-config, fully free,
// OSM-based) and upgrades to MapTiler Streets-v2 when a key is set
// (free signup, no card needed, much closer to Google Maps look).
const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const MAP_STYLE_URL = MAPTILER_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
  : 'https://tiles.openfreemap.org/styles/bright';

const DEFAULT_VIEW = { longitude: 10.4515, latitude: 51.1657, zoom: 4.5 };

interface MapLibreFallbackProps {
  events: Event[];
  selected: Event | null;
  onSelect: (event: Event | null) => void;
  /** When true, skip auto-locate-on-mount (deeplink target wins). */
  skipAutoLocate?: boolean;
}

/**
 * Free fallback map used when Apple MapKit JS is not configured. Uses
 * MapLibre GL — same fork tree as Mapbox GL but BSD-licensed and works
 * with any tile provider, including OpenFreeMap (no key required).
 */
export function MapLibreFallback({ events, selected, onSelect, skipAutoLocate }: MapLibreFallbackProps) {
  const mapRef = useRef<MapRef | null>(null);
  // Once we've panned to the user's location, suppress the auto-fit-to-
  // events behavior so the user doesn't get yanked back to the bbox.
  const didLocateUserRef = useRef(false);

  // Auto-locate on mount — the browser shows its native permission prompt;
  // if the user accepts we fly to their position, otherwise stay at default.
  useEffect(() => {
    if (!navigator.geolocation || skipAutoLocate) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        didLocateUserRef.current = true;
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 11,
          duration: 800,
          essential: true,
        });
      },
      () => {},
      { timeout: 8000, maximumAge: 60_000 },
    );
  }, [skipAutoLocate]);

  const initialView = useMemo(() => {
    // Deeplink wins: if the parent already passed a `selected` event
    // (e.g. from /app/map?event=…), center the map on it from the
    // very first render. Otherwise the auto-fit logic would briefly
    // show DACH-wide before snapping to the deeplink target.
    if (selected && selected.latitude != null && selected.longitude != null) {
      return { longitude: selected.longitude, latitude: selected.latitude, zoom: 13 };
    }
    if (events.length === 0) return DEFAULT_VIEW;
    if (events.length === 1) {
      return { longitude: events[0].longitude!, latitude: events[0].latitude!, zoom: 11 };
    }
    const lngs = events.map((e) => e.longitude!);
    const lats = events.map((e) => e.latitude!);
    return {
      longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
      zoom: 5,
    };
    // selected only matters for the initial render — once the map is
    // mounted, the pan-on-selected effect below handles updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // Auto-fit bounds when events change — but only if we haven't already
  // centered on the user's location AND no deeplink target is set.
  useEffect(() => {
    if (!mapRef.current || events.length < 2) return;
    if (didLocateUserRef.current) return;
    if (selected) return; // deeplink target — don't yank to bbox
    const lngs = events.map((e) => e.longitude!);
    const lats = events.map((e) => e.latitude!);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    mapRef.current.fitBounds(bounds, { padding: 60, duration: 600, maxZoom: 12 });
  }, [events, selected]);

  // Fly to selected — also fires when the map first becomes available
  // (handles the deeplink race where selected was set before mount).
  useEffect(() => {
    if (!mapRef.current || !selected) return;
    mapRef.current.flyTo({
      center: [selected.longitude!, selected.latitude!],
      zoom: 13,
      duration: 800,
      essential: true,
    });
  }, [selected]);

  function flyToLocation(lat: number, lng: number) {
    didLocateUserRef.current = true; // suppress auto-fit-to-events
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 12,
      duration: 800,
      essential: true,
    });
  }

  return (
    <>
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
                onSelect(event);
              }}
            >
              <button
                className="group relative cursor-pointer"
                style={{ transform: isSelected ? 'translateY(-2px)' : undefined }}
              >
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
                  <EventBanner event={selected} />
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

      <MapSearchBar onSelectLocation={flyToLocation} />
    </>
  );
}
