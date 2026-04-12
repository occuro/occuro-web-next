'use client';

import { use, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin, Download, Smartphone } from 'lucide-react';

const APP_STORE_URL = 'https://apps.apple.com/app/occuro/id6760317905';

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
  visibility: string;
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
      const { data } = await supabase
        .from('events')
        .select('title, date, end_date, time, location, banner_url, image_url, category, description, visibility')
        .eq('id', id)
        .eq('visibility', 'public')
        .maybeSingle();
      setEvent(data as PublicEvent | null);
      setLoading(false);
    }
    load();
  }, [id]);

  if (authLoading || (!authLoading && user)) {
    return <div className="min-h-screen bg-black flex items-center justify-center"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
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
        ) : bannerUrl ? (
          <img src={bannerUrl} alt="" className="w-full aspect-video rounded-2xl object-cover" />
        ) : (
          <div className="w-full aspect-video rounded-2xl bg-violet-600/10 flex items-center justify-center">
            <Calendar size={40} className="text-violet-400" />
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
            href={APP_STORE_URL}
            className="flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl transition-colors"
          >
            <Download size={20} />
            occuro App herunterladen
          </a>
          <p className="text-gray-500 text-xs flex items-center justify-center gap-1.5">
            <Smartphone size={14} />
            Event in der App ansehen
          </p>
        </div>

        <div className="pt-4">
          <p className="text-gray-600 text-xs">occuro — Entdecke Events & triff echte Menschen</p>
        </div>
      </div>
    </div>
  );
}
