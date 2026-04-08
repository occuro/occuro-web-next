'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  Search, Heart, CheckCircle2, MapPin, Clock, Calendar,
  ImageOff, ArrowUpDown, X, Sparkles,
} from 'lucide-react';

type SortMode = 'relevance' | 'soonest' | 'latest';

export default function DiscoverPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('soonest');
  const supabase = createClient();

  const categories = [
    'Music', 'Business', 'Health', 'Sports', 'Education',
    'Art', 'Food', 'Technology', 'Community', 'Outdoor',
  ];

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
      .order('date', { ascending: true })
      .limit(60);

    if (category) {
      query = query.ilike('category', category);
    }

    const { data } = await query;
    setEvents(data ?? []);
    setLoading(false);
  }

  const filtered = (() => {
    let result = events;
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.description ?? '').toLowerCase().includes(q),
      );
    }
    // Sort
    if (sort === 'soonest') result = [...result].sort((a, b) => a.date.localeCompare(b.date));
    if (sort === 'latest') result = [...result].sort((a, b) => b.date.localeCompare(a.date));
    if (sort === 'relevance') result = [...result].sort((a, b) => (b.interested_count + b.confirmed_count) - (a.interested_count + a.confirmed_count));
    return result;
  })();

  const isSearching = search.length >= 2;

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Hero */}
      {!isSearching && (
        <div className="relative rounded-2xl bg-gradient-to-br from-violet-600 to-purple-800 p-8 text-white overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent_70%)]" />
          <div className="relative">
            <h1 className="text-2xl font-heading font-bold">Entdecken</h1>
            <p className="text-white/70 text-sm mt-1">Finde Events in deiner Nähe</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-fg" />
        <input
          type="text"
          placeholder="Events, Orte, Kategorien suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-10 py-3.5 rounded-2xl border border-border-subtle bg-surface text-sm placeholder:text-muted-fg/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/30 transition-all duration-200"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Sort Chips (when searching) */}
      {isSearching && (
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-muted-fg" />
          {([['relevance', 'Relevanz'], ['soonest', 'Bald'], ['latest', 'Neueste']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 ${
                sort === key
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-surface border border-border-subtle text-foreground/70 hover:border-border-strong'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-muted-fg">
            {filtered.length} {filtered.length === 1 ? 'Event' : 'Events'}
          </span>
        </div>
      )}

      {/* Category Chips */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCategory(null)}
          className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
            !category
              ? 'bg-violet-600 text-white shadow-sm'
              : 'bg-surface border border-border-subtle text-foreground/70 hover:text-foreground hover:border-border-strong'
          }`}
        >
          Alle
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat === category ? null : cat)}
            className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-200 ${
              category === cat
                ? 'text-white shadow-sm'
                : 'bg-surface border border-border-subtle text-foreground/70 hover:text-foreground hover:border-border-strong'
            }`}
            style={category === cat ? { backgroundColor: getCategoryColor(cat) } : undefined}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Section Title */}
      {!isSearching && (
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-violet-500" />
          <h2 className="text-base font-heading font-semibold">Events für dich</h2>
        </div>
      )}

      {/* Events Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-surface border border-border-subtle overflow-hidden">
              <div className="aspect-[16/9] bg-muted animate-pulse" />
              <div className="p-4 space-y-3">
                <div className="h-5 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-fg rounded-2xl border border-border-subtle border-dashed bg-surface">
          <Search size={40} strokeWidth={1.2} className="mx-auto mb-4 opacity-40" />
          <p className="text-base font-medium">Keine Events gefunden</p>
          <p className="text-[13px] mt-1.5">Versuche einen anderen Suchbegriff oder eine andere Kategorie.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const catColor = getCategoryColor(event.category);

  return (
    <Link
      href={`/app/event/${event.id}`}
      className="group rounded-2xl border border-border-subtle bg-surface overflow-hidden hover:shadow-[var(--shadow-lg)] hover:border-border-strong hover:-translate-y-0.5 transition-all duration-300"
    >
      <div className="aspect-[16/9] bg-muted relative overflow-hidden">
        {event.image_url ? (
          <img
            src={event.image_url}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ease-out"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-elevated/50">
            <ImageOff size={32} strokeWidth={1.2} className="text-muted-fg/30" />
          </div>
        )}
        <span
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white backdrop-blur-sm"
          style={{ backgroundColor: `${catColor}dd` }}
        >
          {event.category}
        </span>
      </div>

      <div className="p-4 space-y-2.5">
        <h3 className="font-heading font-semibold text-[15px] leading-snug line-clamp-2 group-hover:text-foreground/80 transition-colors">
          {event.title}
        </h3>
        {event.slogan && (
          <p className="text-[12px] text-muted-fg line-clamp-1">{event.slogan}</p>
        )}
        <div className="flex items-center gap-3 text-[12px] text-muted-fg">
          <span className="flex items-center gap-1">
            <Calendar size={12} strokeWidth={1.6} />
            {formatDate(event.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} strokeWidth={1.6} />
            {formatTime(event.time)}
          </span>
        </div>
        <p className="text-[12px] text-muted-fg truncate flex items-center gap-1">
          <MapPin size={12} strokeWidth={1.6} className="flex-shrink-0" />
          {event.location}
        </p>
        <div className="flex items-center gap-4 text-[11px] text-muted-fg pt-2 border-t border-border-subtle">
          <span className="flex items-center gap-1">
            <Heart size={11} strokeWidth={1.6} />
            {event.interested_count} interessiert
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 size={11} strokeWidth={1.6} />
            {event.confirmed_count} bestätigt
          </span>
        </div>
      </div>
    </Link>
  );
}
