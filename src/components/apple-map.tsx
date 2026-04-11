'use client';

import { useEffect, useRef, useState } from 'react';
import type { Event } from '@/types/occuro';
import { getCategoryColor } from '@/lib/utils';
import { MapSearchBar } from '@/components/map-search-bar';

// Single, app-wide mapkit script loader. We resolve a shared promise so
// multiple <AppleMap> instances mounting at once don't end up loading
// the script twice (or fighting over mapkit.init()).
let mapkitReady: Promise<typeof mapkit> | null = null;

function loadMapkit(): Promise<typeof mapkit> {
  if (mapkitReady) return mapkitReady;
  mapkitReady = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('mapkit can only load in the browser'));
      return;
    }
    if ((window as unknown as { mapkit?: typeof mapkit }).mapkit) {
      resolve(mapkit);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js';
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => {
      mapkit.init({
        authorizationCallback: (done) => {
          // The token endpoint signs a fresh JWT each time mapkit asks
          // (initial load and again before the previous token expires).
          fetch('/api/maps/token')
            .then((r) => r.json())
            .then((data) => {
              if (data?.token) done(data.token);
              else throw new Error(data?.error ?? 'no_token');
            })
            .catch((err) => {
              console.error('[mapkit] token fetch failed:', err);
            });
        },
        language: 'de',
      });
      resolve(mapkit);
    };
    script.onerror = () => reject(new Error('mapkit script failed to load'));
    document.head.appendChild(script);
  });
  return mapkitReady;
}

interface AppleMapProps {
  events: Event[];
  selected: Event | null;
  onSelect: (event: Event | null) => void;
  /** When true, the map skips its auto-locate-on-mount step. Used for
   *  deeplinks (?event=…) where the parent already wants the map at
   *  a specific location. */
  skipAutoLocate?: boolean;
}

/**
 * Apple MapKit JS map of events. Receives the event list from the parent
 * (so the parent owns filter/selection state) and renders an annotation
 * for each one. Uses native mapkit annotations rather than wrapping each
 * one in React for performance and so callouts respect Apple animations.
 */
export function AppleMap({ events, selected, onSelect, skipAutoLocate }: AppleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapkit.Map | null>(null);
  const annotationsRef = useRef<Map<string, mapkit.Annotation>>(new Map());
  const didFitRef = useRef(false);
  // True once we've centered the map on the user's location — that takes
  // precedence over the auto-fit-to-events behavior, so the user doesn't
  // get yanked back to Germany center after their position arrives.
  const didLocateUserRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest onSelect callback in a ref so we don't have to
  // re-create annotation listeners just because the parent re-renders.
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // ── Boot the map once on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadMapkit()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new mapkit.Map(containerRef.current, {
          showsCompass: mapkit.FeatureVisibility.Adaptive,
          showsZoomControl: true,
          showsMapTypeControl: false,
          showsUserLocationControl: false,
          colorScheme: mapkit.Map.ColorSchemes.Dark,
          region: new mapkit.CoordinateRegion(
            new mapkit.Coordinate(51.1657, 10.4515),
            new mapkit.CoordinateSpan(8, 12),
          ),
        });
        mapInstanceRef.current = map;

        // Auto-locate the user as soon as the map is ready. The browser
        // shows its native permission prompt — if the user accepts we
        // pan to their position; if they deny we just stay at the
        // default region. Either way the explicit Locate button below
        // remains available as a manual retry.
        // skipAutoLocate is set when the page wants the map at a
        // specific deeplink target — auto-locating would yank the user
        // away from the location they explicitly asked to see.
        if (navigator.geolocation && !skipAutoLocate) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (cancelled || !mapInstanceRef.current) return;
              didLocateUserRef.current = true;
              didFitRef.current = true; // suppress the auto-fit-to-events on first event load
              mapInstanceRef.current.setRegionAnimated(
                new mapkit.CoordinateRegion(
                  new mapkit.Coordinate(pos.coords.latitude, pos.coords.longitude),
                  new mapkit.CoordinateSpan(0.15, 0.15),
                ),
                true,
              );
            },
            () => {
              // Permission denied or timed out — silently fall back.
            },
            { timeout: 8000, maximumAge: 60_000 },
          );
        }
      })
      .catch((err) => {
        console.error('[AppleMap] init failed:', err);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
      mapInstanceRef.current?.destroy();
      mapInstanceRef.current = null;
      annotationsRef.current.clear();
    };
  }, []);

  // ── Sync annotations whenever events change ────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const next = new Set(events.map((e) => e.id));
    for (const [id, annotation] of annotationsRef.current.entries()) {
      if (!next.has(id)) {
        map.removeAnnotation(annotation);
        annotationsRef.current.delete(id);
      }
    }

    const toAdd: mapkit.Annotation[] = [];
    for (const event of events) {
      if (annotationsRef.current.has(event.id)) continue;
      if (event.latitude == null || event.longitude == null) continue;

      const coordinate = new mapkit.Coordinate(event.latitude, event.longitude);
      const color = getCategoryColor(event.category);

      const annotation = new mapkit.Annotation(
        coordinate,
        () => {
          const div = document.createElement('div');
          div.innerHTML = `
            <svg width="34" height="44" viewBox="0 0 34 44" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.4));cursor:pointer;">
              <path d="M17 1C8.16 1 1 8.16 1 17c0 12 16 26 16 26s16-14 16-26c0-8.84-7.16-16-16-16z"
                    fill="${color}" stroke="#FFFFFF" stroke-width="2" />
              <circle cx="17" cy="17" r="6" fill="#FFFFFF" />
            </svg>
          `;
          return div;
        },
        {
          title: event.title,
          subtitle: event.location ?? '',
          anchorOffset: new DOMPoint(0, -22),
        },
      );

      annotation.addEventListener('select', () => {
        onSelectRef.current(event);
      });

      annotationsRef.current.set(event.id, annotation);
      toAdd.push(annotation);
    }
    if (toAdd.length > 0) map.addAnnotations(toAdd);

    if (!didFitRef.current && events.length >= 2) {
      map.showItems(Array.from(annotationsRef.current.values()), {
        animate: false,
        padding: new mapkit.Padding(60, 60, 60, 60),
      });
      didFitRef.current = true;
    } else if (!didFitRef.current && events.length === 1) {
      const e = events[0];
      map.setCenterAnimated(new mapkit.Coordinate(e.latitude!, e.longitude!), false);
      didFitRef.current = true;
    }
  }, [events]);

  // ── Fly to selected event ──────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selected || selected.latitude == null || selected.longitude == null) return;
    map.setRegionAnimated(
      new mapkit.CoordinateRegion(
        new mapkit.Coordinate(selected.latitude, selected.longitude),
        new mapkit.CoordinateSpan(0.05, 0.05),
      ),
      true,
    );
  }, [selected]);

  function flyToLocation(lat: number, lng: number) {
    const map = mapInstanceRef.current;
    if (!map) return;
    didLocateUserRef.current = true; // suppress auto-fit-to-events
    map.setRegionAnimated(
      new mapkit.CoordinateRegion(
        new mapkit.Coordinate(lat, lng),
        new mapkit.CoordinateSpan(0.15, 0.15),
      ),
      true,
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-center">
        <div className="text-sm text-muted-fg">
          Apple Maps konnte nicht geladen werden.
          <br />
          <span className="text-[11px] opacity-70">{error}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} className="w-full h-full" />
      <MapSearchBar onSelectLocation={flyToLocation} />
    </>
  );
}
