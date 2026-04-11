'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Locate, X } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface MapSearchBarProps {
  onSelectLocation: (lat: number, lng: number, label: string) => void;
  onLocate: () => void;
}

/**
 * Search bar overlay rendered on top of the map. Uses OpenStreetMap's
 * Nominatim free geocoder for autocomplete (no API key needed). Sits
 * top-left across the map; the locate button sits on its right side.
 *
 * Nominatim usage policy is 1 req/sec — we debounce typing to ~350ms
 * which keeps us comfortably below that for real users.
 */
export function MapSearchBar({ onSelectLocation, onLocate }: MapSearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch — 350ms after the last keystroke
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
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
          setLoading(false);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.warn('[MapSearchBar] geocoding failed:', err);
            setResults([]);
          }
          setLoading(false);
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

  function handleSelect(result: NominatimResult) {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    setQuery(result.display_name.split(',')[0]);
    setOpen(false);
    onSelectLocation(lat, lng, result.display_name);
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute top-3 left-3 right-3 sm:right-auto sm:w-[360px] z-20"
    >
      <div className="flex items-center gap-2">
        {/* Search input */}
        <div className="flex-1 relative">
          <div className="flex items-center bg-surface/95 backdrop-blur border border-border-subtle rounded-full shadow-lg pl-3 pr-2 h-10">
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
          {open && (results.length > 0 || loading) && (
            <div className="absolute top-12 left-0 right-0 bg-surface border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 overflow-hidden max-h-[280px] overflow-y-auto">
              {loading && results.length === 0 ? (
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
          onClick={onLocate}
          className="w-10 h-10 rounded-full bg-surface/95 backdrop-blur border border-border-subtle shadow-lg flex items-center justify-center hover:bg-elevated transition-colors flex-shrink-0"
          aria-label="Mein Standort"
          title="Mein Standort"
        >
          <Locate size={15} className="text-foreground" />
        </button>
      </div>
    </div>
  );
}
