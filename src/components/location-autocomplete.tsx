'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
}

interface LocationAutocompleteProps {
  value: string;
  onChange: (value: { label: string; lat: number | null; lng: number | null }) => void;
  placeholder?: string;
  required?: boolean;
}

/**
 * Free-text location input with Nominatim-backed autocomplete. Behaves
 * like a normal text input — users can keep typing freely — but as soon
 * as they pick a suggestion, we capture lat/lng so the event lands on
 * the map at the right pin.
 *
 * Nominatim is rate-limited to 1 req/sec; we debounce typing to 350ms
 * to stay well under that. Free, no API key required.
 */
export function LocationAutocomplete({
  value, onChange, placeholder, required,
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Tracks whether the current `query` corresponds to a picked suggestion.
  // If the user keeps typing afterwards, we re-enable the dropdown.
  const justPickedRef = useRef(false);

  // Sync external value changes (e.g. when editing an existing event)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Debounced fetch — 350ms after the last keystroke
  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    if (!query.trim() || query.trim().length < 3) {
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
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=1`,
        { signal: ac.signal, headers: { 'Accept-Language': 'de' } },
      )
        .then((r) => r.json())
        .then((data: NominatimResult[]) => {
          setResults(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch((err) => {
          if (err?.name !== 'AbortError') {
            console.warn('[LocationAutocomplete] geocoding failed:', err);
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
    // Use a sensible label: first segment + city if present
    const label = result.display_name;
    justPickedRef.current = true;
    setQuery(label);
    setOpen(false);
    setResults([]);
    onChange({ label, lat, lng });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center bg-elevated border border-border-subtle rounded-xl pl-3 pr-2 h-[42px] focus-within:border-violet-500/50 transition-colors">
        <MapPin size={15} className="text-muted-fg flex-shrink-0" />
        <input
          type="text"
          value={query}
          required={required}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // Clear coords when the user types after picking — we no longer
            // know where the event is until they pick a new suggestion.
            onChange({ label: e.target.value, lat: null, lng: null });
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Adresse, Veranstaltungsort oder Stadt…'}
          className="flex-1 bg-transparent outline-none text-sm px-2 placeholder:text-muted-fg/60"
        />
        {loading ? (
          <Loader2 size={14} className="animate-spin text-muted-fg flex-shrink-0" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
              onChange({ label: '', lat: null, lng: null });
            }}
            className="p-1 rounded-full hover:bg-surface text-muted-fg flex-shrink-0"
            aria-label="Löschen"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {/* Autocomplete dropdown */}
      {open && (results.length > 0 || (loading && query.length >= 3)) && (
        <div className="absolute top-12 left-0 right-0 z-30 bg-surface border border-border-subtle rounded-2xl shadow-2xl shadow-black/40 overflow-hidden max-h-[280px] overflow-y-auto">
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 text-[12px] text-muted-fg">Suche…</div>
          ) : (
            results.map((r) => {
              const [primary, ...rest] = r.display_name.split(',');
              return (
                <button
                  key={r.place_id}
                  type="button"
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-elevated transition-colors border-b border-border-subtle last:border-b-0 flex items-start gap-2.5"
                >
                  <MapPin size={13} className="text-muted-fg/60 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{primary}</div>
                    {rest.length > 0 && (
                      <div className="text-[11px] text-muted-fg truncate">{rest.join(',').trim()}</div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
