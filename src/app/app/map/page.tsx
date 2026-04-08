'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import { MapPin, Calendar, Clock, Heart, CheckCircle2, ImageOff, X } from 'lucide-react';

export default function MapPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string | null>(null);
  const supabase = createClient();

  const categories = ['Music', 'Business', 'Health', 'Sports', 'Education', 'Art', 'Food', 'Technology', 'Community', 'Outdoor'];

  useEffect(() => {
    fetchEvents();
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
      .limit(100);

    if (category) query = query.ilike('category', category);

    const { data } = await query;
    setEvents(data ?? []);
    setLoading(false);
  }

  // Default center: Germany
  const center = events.length > 0
    ? { lat: events[0].latitude!, lng: events[0].longitude! }
    : { lat: 51.1657, lng: 10.4515 };

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Karte</h1>
          <p className="text-sm text-muted-fg mt-1">{events.length} Events mit Standort</p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategory(null)}
          className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
            !category ? 'bg-violet-600 text-white' : 'bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong'
          }`}
        >
          Alle
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat === category ? null : cat)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              category === cat ? 'text-white' : 'bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong'
            }`}
            style={category === cat ? { backgroundColor: getCategoryColor(cat) } : undefined}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Map + Event List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Map */}
        <div className="lg:col-span-3 rounded-2xl border border-border-subtle bg-surface overflow-hidden relative" style={{ height: '600px' }}>
          {loading ? (
            <div className="w-full h-full bg-muted animate-pulse flex items-center justify-center">
              <MapPin size={32} className="text-muted-fg/30" />
            </div>
          ) : (
            <iframe
              title="Event Map"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${center.lng - 0.5}%2C${center.lat - 0.3}%2C${center.lng + 0.5}%2C${center.lat + 0.3}&layer=mapnik`}
            />
          )}

          {/* Selected Event Overlay */}
          {selected && (
            <div className="absolute bottom-4 left-4 right-4 bg-surface border border-border-subtle rounded-2xl p-4 shadow-lg animate-fade-in-scale">
              <button onClick={() => setSelected(null)} className="absolute top-3 right-3 text-muted-fg hover:text-foreground">
                <X size={16} />
              </button>
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden flex-shrink-0">
                  {selected.image_url ? (
                    <img src={selected.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><ImageOff size={18} className="text-muted-fg/30" /></div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: getCategoryColor(selected.category) }}>
                    {selected.category}
                  </span>
                  <h3 className="font-semibold text-[14px] truncate mt-1">{selected.title}</h3>
                  <div className="flex items-center gap-3 text-[11px] text-muted-fg mt-1">
                    <span className="flex items-center gap-1"><Calendar size={10} />{formatDate(selected.date)}</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{formatTime(selected.time)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-fg mt-1">
                    <span className="flex items-center gap-1"><Heart size={10} />{selected.interested_count}</span>
                    <span className="flex items-center gap-1"><CheckCircle2 size={10} />{selected.confirmed_count}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Event List Sidebar */}
        <div className="lg:col-span-2 space-y-2 max-h-[600px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-center py-16 text-muted-fg">
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
                    ? 'bg-violet-50 border border-violet-200 dark:bg-violet-900/20 dark:border-violet-800'
                    : 'border border-border-subtle bg-surface hover:bg-elevated/50 hover:border-border-strong'
                }`}
              >
                <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryColor(event.category) }} />
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
