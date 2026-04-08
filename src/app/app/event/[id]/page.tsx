'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import type { Event } from '@/types/occuro';
import { formatDate, formatTime, getCategoryColor } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, Clock, MapPin, Heart, CheckCircle2,
  Users, Globe, Ticket, ImageOff, ExternalLink, MessageCircle,
} from 'lucide-react';

type UserStatus = 'interested' | 'confirmed' | 'attended' | 'not-interested' | 'saved' | null;

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [event, setEvent] = useState<Event | null>(null);
  const [status, setStatus] = useState<UserStatus>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (id && user) fetchEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  async function fetchEvent() {
    // Wait for auth to be ready so RLS works for private events
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();

    if (error || !data) {
      // Retry once — auth cookie might not be set yet
      await new Promise((r) => setTimeout(r, 500));
      const retry = await supabase.from('events').select('*').eq('id', id).single();
      setEvent(retry.data);
    } else {
      setEvent(data);
    }

    if (user) {
      const { data: statusData } = await supabase
        .from('event_statuses')
        .select('status')
        .eq('event_id', id)
        .eq('user_id', user.id)
        .single();
      setStatus(statusData?.status ?? null);
    }
    setLoading(false);
  }

  async function updateStatus(newStatus: UserStatus) {
    if (!user || !event) return;

    if (newStatus === status) {
      // Remove status
      await supabase.from('event_statuses').delete().eq('event_id', event.id).eq('user_id', user.id);
      setStatus(null);
    } else {
      await supabase.from('event_statuses').upsert({
        event_id: event.id,
        user_id: user.id,
        status: newStatus,
      }, { onConflict: 'event_id,user_id' });
      setStatus(newStatus);
    }
    // Refresh event counts
    const { data } = await supabase.from('events').select('interested_count, confirmed_count').eq('id', event.id).single();
    if (data) setEvent((prev) => prev ? { ...prev, ...data } : prev);
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto animate-fade-in">
        <div className="h-64 rounded-2xl bg-muted animate-pulse mb-6" />
        <div className="space-y-4">
          <div className="h-8 w-2/3 bg-muted rounded animate-pulse" />
          <div className="h-5 w-1/3 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20 animate-fade-in">
        <p className="text-base font-medium text-muted-fg">Event nicht gefunden</p>
        <Link href="/app" className="inline-flex items-center gap-1 mt-3 text-[13px] font-medium hover:opacity-70 transition-opacity">
          <ArrowLeft size={14} /> Zurück
        </Link>
      </div>
    );
  }

  const catColor = getCategoryColor(event.category);
  const isPast = event.date < new Date().toISOString().split('T')[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/app" className="inline-flex items-center gap-1.5 text-[13px] text-muted-fg hover:text-foreground transition-colors">
        <ArrowLeft size={15} /> Zurück
      </Link>

      {/* Banner */}
      <div className="aspect-[21/9] rounded-2xl bg-muted overflow-hidden relative">
        {event.image_url ? (
          <img src={event.image_url} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-elevated/50">
            <ImageOff size={48} strokeWidth={1} className="text-muted-fg/20" />
          </div>
        )}
        <span
          className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-[12px] font-semibold text-white backdrop-blur-sm"
          style={{ backgroundColor: `${catColor}dd` }}
        >
          {event.category}
        </span>
        {isPast && (
          <span className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-[12px] font-semibold bg-black/50 text-white backdrop-blur-sm">
            Vergangen
          </span>
        )}
      </div>

      {/* Title + Meta */}
      <div className="space-y-3">
        <h1 className="text-2xl font-heading font-bold tracking-tight">{event.title}</h1>
        {event.slogan && <p className="text-muted-fg">{event.slogan}</p>}

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-fg">
          <span className="flex items-center gap-1.5">
            <Calendar size={14} strokeWidth={1.6} /> {formatDate(event.date)}
            {event.end_date && event.end_date !== event.date && ` – ${formatDate(event.end_date)}`}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock size={14} strokeWidth={1.6} /> {formatTime(event.time)}
            {event.end_time && ` – ${formatTime(event.end_time)}`}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin size={14} strokeWidth={1.6} /> {event.location}
          </span>
          <span className="flex items-center gap-1.5">
            <Users size={14} strokeWidth={1.6} /> Max. {event.max_participants}
          </span>
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <Heart size={15} className="text-pink-500" />
            <span className="font-semibold">{event.interested_count}</span>
            <span className="text-muted-fg">interessiert</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <CheckCircle2 size={15} className="text-green-500" />
            <span className="font-semibold">{event.confirmed_count}</span>
            <span className="text-muted-fg">bestätigt</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {!isPast && user && (
        <div className="flex gap-3">
          <button
            onClick={() => updateStatus('interested')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
              status === 'interested'
                ? 'bg-pink-500 text-white shadow-sm'
                : 'border border-border-subtle bg-surface text-foreground hover:border-border-strong'
            }`}
          >
            <Heart size={16} strokeWidth={status === 'interested' ? 2.5 : 1.8} />
            Interessiert
          </button>
          <button
            onClick={() => updateStatus('confirmed')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
              status === 'confirmed'
                ? 'bg-green-500 text-white shadow-sm'
                : 'border border-border-subtle bg-surface text-foreground hover:border-border-strong'
            }`}
          >
            <CheckCircle2 size={16} strokeWidth={status === 'confirmed' ? 2.5 : 1.8} />
            Bestätigt
          </button>
          <button
            onClick={() => updateStatus('saved')}
            className={`py-3 px-4 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
              status === 'saved'
                ? 'bg-violet-500 text-white shadow-sm'
                : 'border border-border-subtle bg-surface text-foreground hover:border-border-strong'
            }`}
          >
            Speichern
          </button>
        </div>
      )}

      {/* Description */}
      <div className="rounded-2xl border border-border-subtle bg-surface p-6">
        <h2 className="text-base font-heading font-semibold mb-3">Beschreibung</h2>
        <p className="text-sm leading-relaxed whitespace-pre-line">{event.description}</p>
      </div>

      {/* Links */}
      {(event.website || event.ticket_shop_url) && (
        <div className="flex gap-3">
          {event.website && (
            <a
              href={event.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-medium border border-border-subtle bg-surface hover:bg-elevated/50 transition-all"
            >
              <Globe size={15} /> Website <ExternalLink size={12} className="text-muted-fg" />
            </a>
          )}
          {event.ticket_shop_url && (
            <a
              href={event.ticket_shop_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-primary-bg text-primary-text hover:opacity-90 transition"
            >
              <Ticket size={15} /> Tickets kaufen <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Organizer */}
      {event.organizer_name && (
        <div className="rounded-2xl border border-border-subtle bg-surface p-5">
          <p className="text-[12px] text-muted-fg uppercase tracking-wide mb-2">Veranstalter</p>
          <p className="font-semibold">{event.organizer_name}</p>
        </div>
      )}

      {/* Gallery */}
      {event.gallery_urls && event.gallery_urls.length > 0 && (
        <div>
          <h2 className="text-base font-heading font-semibold mb-3">Galerie</h2>
          <div className="grid grid-cols-3 gap-2">
            {event.gallery_urls.map((url, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden bg-muted">
                <img src={url} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
