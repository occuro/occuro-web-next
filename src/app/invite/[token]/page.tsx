'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin, Download, ExternalLink, Lock } from 'lucide-react';

const APP_STORE_URL = 'https://apps.apple.com/app/occuro/id6760317905';
const APP_SCHEME = 'occuro://';

interface InviteEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  banner_url: string | null;
  image_url: string | null;
  description: string | null;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [event, setEvent] = useState<InviteEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace(`/app/invite/${token}`);
      return;
    }
  }, [authLoading, user, router, token]);

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      // Eine `security definer`-RPC statt zwei direkter Tabellenabfragen.
      //
      // Vorher wurde erst `event_invite_links` nach dem Token gefragt und
      // danach `events` nach der id. Das hatte zwei Probleme: die Tabelle
      // musste dafuer fuer JEDEN lesbar sein (damit waren alle Tokens
      // auflistbar), und der zweite Schritt schlug fuer nicht angemeldete
      // Besucher ohnehin fehl — `events` ist per RLS auf `authenticated`
      // beschraenkt. Einladungslinks funktionierten dadurch nur fuer Leute,
      // die bereits eingeloggt waren.
      //
      // Die RPC nimmt genau ein Token entgegen und gibt ausschliesslich die
      // Anzeigedaten des zugehoerigen Events zurueck.
      const { data: ev, error } = await supabase
        .rpc('resolve_invite_token', { p_token: token })
        .maybeSingle();
      if (error || !ev) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setEvent(ev as InviteEvent);
      setLoading(false);
    }
    load();
  }, [token]);

  if (authLoading || (!authLoading && user)) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const bannerUrl = event?.banner_url ?? event?.image_url ?? null;
  const formattedDate = event?.date
    ? new Date(event.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-black flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {loading ? (
          <div className="w-full aspect-video rounded-2xl bg-gray-800 animate-pulse" />
        ) : notFound ? (
          <div className="w-full aspect-video rounded-2xl bg-red-950/30 flex items-center justify-center">
            <Lock size={40} className="text-red-400" />
          </div>
        ) : bannerUrl ? (
          <img src={bannerUrl} alt="" className="w-full aspect-video rounded-2xl object-cover" />
        ) : (
          <div className="w-full aspect-video rounded-2xl bg-white/5 flex items-center justify-center">
            <Calendar size={40} className="text-gray-400" />
          </div>
        )}

        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 border border-white/15">
            <Lock size={12} className="text-gray-400" />
            <span className="text-gray-200 text-xs font-medium">Private Einladung</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {loading ? '...' : notFound ? 'Einladung nicht gefunden' : event?.title || 'Event'}
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
          {notFound && (
            <p className="text-gray-500 text-sm mt-2">
              Dieser Einladungs-Link ist ungültig oder wurde zurückgezogen.
            </p>
          )}
        </div>

        {!notFound && (
          <div className="space-y-3 pt-4">
            <a
              href={`${APP_SCHEME}invite/${token}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-[#F4F4F5] hover:bg-[#E4E4E7] text-[#111114] font-semibold rounded-2xl transition-colors"
            >
              <ExternalLink size={18} />
              In der App öffnen
            </a>
            <a
              href={APP_STORE_URL}
              className="flex items-center justify-center gap-2 w-full py-3 px-6 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 font-medium rounded-2xl transition-colors text-sm"
            >
              <Download size={16} />
              App noch nicht installiert? Herunterladen
            </a>
          </div>
        )}

        <div className="pt-4">
          <p className="text-gray-600 text-xs">occuro — Events entdecken, Momente teilen.</p>
        </div>
      </div>
    </div>
  );
}
