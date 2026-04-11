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
  // Mirror `selected` into a ref so the mount effect can read the
  // latest value at init time without depending on it (which would
  // re-create the map every time selection changes — bad).
  const selectedRef = useRef(selected);
  // State (not ref) so the pan-on-selected effect re-runs once the map
  // becomes available. The deeplink fetch may set `selected` BEFORE
  // mapkit is ready; the ref-based approach silently dropped that pan.
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest onSelect + selected in refs.
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // ── Boot the map once on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    loadMapkit()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new mapkit.Map(containerRef.current, {
          // Compass is hidden because we don't enable rotation, and
          // mapkit warns if the compass would be shown without
          // rotation enabled. Set explicitly to Hidden to silence it.
          showsCompass: mapkit.FeatureVisibility.Hidden,
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
        setMapReady(true);

        // Deeplink center: if the parent already set `selected` (e.g. via
        // ?event=… on /app/map) BEFORE mapkit finished loading, the
        // pan-on-selected effect at the bottom will have bailed because
        // mapInstanceRef.current was null. Center the map immediately
        // here so the user lands on the right spot.
        const selNow = selectedRef.current;
        if (selNow && selNow.latitude != null && selNow.longitude != null) {
          didFitRef.current = true; // suppress the auto-fit-to-events
          didLocateUserRef.current = true; // suppress the auto-locate
          map.setRegionAnimated(
            new mapkit.CoordinateRegion(
              new mapkit.Coordinate(selNow.latitude, selNow.longitude),
              new mapkit.CoordinateSpan(0.05, 0.05),
            ),
            false,
          );
        }

        // Auto-locate is intentionally NOT fired here anymore. It used
        // to race against the events fetch — if the geolocation
        // resolved first, the map centered on the user and the pin
        // for the event ended up offscreen. Events take priority now:
        // the events sync effect below fits the viewport to the
        // events bounds. The user can still tap the manual locate
        // button at the top of the map to jump to their position.
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

      // Apple's built-in MarkerAnnotation renders a proper teardrop
      // pin with the chosen color. Way more reliable than the custom
      // SVG factory the previous version used — that was rendering
      // empty divs in some browsers because the SVG height was being
      // collapsed to zero.
      const annotation = new mapkit.MarkerAnnotation(coordinate, {
        title: event.title,
        subtitle: event.location ?? '',
        color,
        glyphColor: '#FFFFFF',
        displayPriority: 1000, // never get hidden by clustering
      });

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
  // mapReady is in the deps so this fires both when selected changes
  // AND when the map first becomes available — covers the deeplink
  // race where selected was set before mapkit finished loading.
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
  }, [selected, mapReady]);

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
