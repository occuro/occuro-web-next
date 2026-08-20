'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin, Download, ExternalLink, Globe } from 'lucide-react';
import { eventImageUrl } from '@/lib/eventImages';

const APP_STORE_URL = 'https://apps.apple.com/app/occuro/id6760317905';
const APP_SCHEME = 'occuro://';

interface PublicEvent {
  title: string;
  date: string;
  end_date: string | null;
  time: string | null;
  location: string | null;
  banner_url: string | null;
  image_url: string | null;
  category: string | null;
  description: string | null;
}

export default function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(`/app/event/${id}`);
      return;
    }
  }, [authLoading, user, router, id]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      // Aus der Gast-Sicht lesen, nicht aus der Tabelle. Diese Seite sehen
      // nur ABGEMELDETE Besucher (Angemeldete werden oben weggeleitet) — und
      // fuer anon hat `events` keine Leserechte: Die Abfrage lief fuer genau
      // die Empfaenger ins Leere, die ein geteilter Link anlocken soll, und
      // die Seite zeigte ein leeres Event. `public_events_guest` ist fuer
      // anon freigegeben, enthaelt per Bauart nur Oeffentliches (deshalb
      // entfaellt der visibility-Filter) und ist dieselbe Quelle, die der
      // Gastmodus der App nutzt.
      const { data } = await supabase
        .from('public_events_guest')
        .select('title, date, end_date, time, location, banner_url, image_url, category, description')
        .eq('id', id)
        .maybeSingle();
      setEvent(data as PublicEvent | null);
      setLoading(false);
    }
    load();
  }, [id]);

  if (authLoading || (!authLoading && user)) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /></div>;
  }

  // Gleiche Kette wie ueberall sonst: eigenes Banner, eigenes Bild, sonst
  // keins. Diese Seite erzeugt auch das Vorschaubild geteilter Links.
  const bannerUrl = event ? eventImageUrl(event) : null;
  const formattedDate = event?.date
    ? new Date(event.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {loading ? (
          <div className="w-full aspect-video rounded-2xl bg-gray-800 animate-pulse" />
        ) : bannerUrl ? (
          <img src={bannerUrl} alt="" className="w-full aspect-video rounded-2xl object-cover" />
        ) : (
          <div className="w-full aspect-video rounded-2xl bg-white/5 flex items-center justify-center">
            <Calendar size={40} className="text-gray-400" />
          </div>
        )}

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-white">
            {loading ? '...' : event?.title || 'Event'}
          </h1>
          {formattedDate && (
            <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
              <Calendar size={15} />
              <span>{formattedDate}{event?.time ? `, ${event.time} Uhr` : ''}</span>
            </div>
          )}
          {event?.location && (
            <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
              <MapPin size={15} />
              <span className="line-clamp-1">{event.location}</span>
            </div>
          )}
          {event?.description && (
            <p className="text-gray-500 text-sm mt-2 line-clamp-3 leading-relaxed">{event.description}</p>
          )}
        </div>

        <div className="space-y-3 pt-4">
          <a
            href={`${APP_SCHEME}event/${id}`}
            className="flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111114] font-semibold rounded-2xl transition-colors"
          >
            <ExternalLink size={18} />
            In der App öffnen
          </a>
          <a
            href={`/app/event/${id}`}
            className="flex items-center justify-center gap-2 w-full py-3 px-6 border border-white/25 text-gray-300 hover:text-white hover:border-white/50 hover:bg-white/5 font-medium rounded-2xl transition-colors text-sm"
          >
            <Globe size={16} />
            Im Browser öffnen
          </a>
          <a
            href={APP_STORE_URL}
            className="flex items-center justify-center gap-2 w-full py-3 px-6 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-medium rounded-2xl transition-colors text-sm"
          >
            <Download size={16} />
            App noch nicht installiert? Herunterladen
          </a>
        </div>

        <div className="pt-4">
          <p className="text-gray-600 text-xs">OutNow — Events entdecken, Momente teilen.</p>
        </div>
      </div>
    </div>
  );
}
