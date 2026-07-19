'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Locate, X, Loader2, AlertCircle } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface MapSearchBarProps {
  /** Called when the user picks a search result OR clicks Locate-Me. */
  onSelectLocation: (lat: number, lng: number, label?: string) => void;
}

type LocateStatus = 'idle' | 'loading' | 'denied' | 'unavailable' | 'timeout';

/**
 * Search bar overlay rendered on top of the map. Uses OpenStreetMap's
 * Nominatim free geocoder for autocomplete (no API key needed). Sits
 * top-left across the map; the locate button sits on its right side.
 *
 * The locate button owns its own permission/loading state — if the
 * browser denies geolocation it shows a visible tooltip explaining
 * how to re-enable it (otherwise the click would silently do nothing).
 */
export function MapSearchBar({ onSelectLocation }: MapSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingResults, setLoadingResults] = useState(false);
  const [locateStatus, setLocateStatus] = useState<LocateStatus>('idle');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch — 350ms after the last keystroke
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setLoadingResults(false);
      return;
    }
    setLoadingResults(true);
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=0`,
        { signal: ac.signal, headers: { 'Accept-Language': 'de' } },
      )
        .then((r) => r.json())
        .then((data: NominatimResult[]) => {
          setResults(Array.isArray(data) ? data : []);
          setLoadingResults(false);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.warn('[MapSearchBar] geocoding failed:', err);
            setResults([]);
          }
          setLoadingResults(false);
        });
    }, 350);
    return () => clearTimeout(handle);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Auto-clear the locate error after a few seconds so it doesn't linger.
  useEffect(() => {
    if (locateStatus === 'idle' || locateStatus === 'loading') return;
    const t = setTimeout(() => setLocateStatus('idle'), 6000);
    return () => clearTimeout(t);
  }, [locateStatus]);

  function handleSelect(result: NominatimResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    setQuery(result.display_name.split(',')[0]);
    setOpen(false);
    onSelectLocation(lat, lng, result.display_name);
  }

  function handleLocate() {
    if (!navigator.geolocation) {
      setLocateStatus('unavailable');
      return;
    }
    setLocateStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocateStatus('idle');
        onSelectLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        // err.code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        console.warn('[MapSearchBar] geolocation failed:', err.code, err.message);
        if (err.code === 1) setLocateStatus('denied');
        else if (err.code === 2) setLocateStatus('unavailable');
        else if (err.code === 3) setLocateStatus('timeout');
        else setLocateStatus('unavailable');
      },
      { timeout: 10_000, enableHighAccuracy: false, maximumAge: 60_000 },
    );
  }

  const errorMessage = (() => {
    switch (locateStatus) {
      case 'denied':
        return 'Standort verweigert. Erlaube den Zugriff in deinen Browser-Einstellungen (Schloss-Symbol links neben der URL).';
      case 'unavailable':
        return 'Standort ist nicht verfügbar.';
      case 'timeout':
        return 'Standortabfrage hat zu lange gedauert. Bitte erneut versuchen.';
      default:
        return null;
    }
  })();

  return (
    <div
      ref={wrapperRef}
      className="absolute top-3 left-3 right-3 sm:right-auto sm:w-[360px] z-20"
    >
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="flex-1 relative">
          <div className="flex items-center bg-surface/95 backdrop-blur border border-border-subtle rounded-xl shadow-lg pl-3 pr-2 h-10">
            <Search size={15} className="text-muted-fg flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder="Ort suchen…"
              className="flex-1 bg-transparent outline-none text-[13px] px-2 placeholder:text-muted-fg/70"
            />
            {query && (
              <button
                onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
                className="p-1 rounded-full hover:bg-elevated text-muted-fg flex-shrink-0"
                aria-label="Löschen"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {open && (results.length > 0 || loadingResults) && (
            <div className="absolute top-12 left-0 right-0 bg-surface border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 overflow-hidden max-h-[280px] overflow-y-auto">
              {loadingResults && results.length === 0 ? (
                <div className="px-4 py-3 text-[12px] text-muted-fg">Suche…</div>
              ) : (
                results.map((r) => {
                  const [primary, ...rest] = r.display_name.split(',');
                  return (
                    <button
                      key={r.place_id}
                      onClick={() => handleSelect(r)}
                      className="w-full text-left px-4 py-2.5 hover:bg-elevated transition-colors border-b border-border-subtle last:border-b-0"
                    >
                      <div className="text-[13px] font-medium truncate">{primary}</div>
                      {rest.length > 0 && (
                        <div className="text-[11px] text-muted-fg truncate">{rest.join(',').trim()}</div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Locate-me button */}
        <button
          onClick={handleLocate}
          disabled={locateStatus === 'loading'}
          className={`relative w-10 h-10 rounded-full backdrop-blur border shadow-lg flex items-center justify-center transition-colors flex-shrink-0 ${
            locateStatus === 'denied' || locateStatus === 'unavailable' || locateStatus === 'timeout'
              ? 'bg-red-500/10 border-red-500/40 text-red-400'
              : 'bg-surface/95 border-border-subtle text-foreground hover:bg-elevated'
          }`}
          aria-label="Mein Standort"
          title="Mein Standort"
        >
          {locateStatus === 'loading' ? (
            <Loader2 size={15} className="animate-spin" />
          ) : locateStatus === 'denied' || locateStatus === 'unavailable' || locateStatus === 'timeout' ? (
            <AlertCircle size={15} />
          ) : (
            <Locate size={15} />
          )}
        </button>
      </div>

      {/* Error tooltip */}
      {errorMessage && (
        <div className="mt-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-[12px] text-red-300 backdrop-blur shadow-lg flex items-start gap-2">
          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
