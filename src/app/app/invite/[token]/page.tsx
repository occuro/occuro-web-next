'use client';

// Einladungslink fuer BEREITS ANGEMELDETE Nutzer.
//
// Die oeffentliche Seite unter /invite/[token] leitete Eingeloggte bisher
// hierher weiter — nur gab es die Route nicht, sie landeten also im 404.
//
// Warum keine simple Weiterleitung auf /app/event/[id]? Weil das Oeffnen
// eines Einladungslinks nur eine VORSCHAU ist. Das eigentliche Beitreten
// passiert ueber einen bewussten Klick, der accept_event_invite() aufruft.
// Ohne diesen Aufruf ist der Nutzer nicht eingeladen — und bei einem
// privaten Event darf er die Eventseite per RLS gar nicht sehen. Er haette
// statt eines 404 eine leere Seite bekommen.

import { use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Calendar, MapPin, Lock, Check } from 'lucide-react';

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

type State = 'loading' | 'ready' | 'invalid' | 'expired' | 'joined';

export default function AppInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<InviteEvent | null>(null);
  const [state, setState] = useState<State>('loading');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      // Dieselbe RPC wie die oeffentliche Seite: sie loest genau ein Token
      // auf und gibt nur die Anzeigedaten zurueck.
      const { data, error } = await supabase
        .rpc('resolve_invite_token', { p_token: token })
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setState('invalid');
        return;
      }
      const ev = data as InviteEvent;
      // Abgelaufene Einladungen abfangen, bevor der Nutzer auf Beitreten
      // tippt — dieselbe Pruefung wie in der App (EventInviteModal).
      if (ev.date < new Date().toISOString().slice(0, 10)) {
        setEvent(ev);
        setState('expired');
        return;
      }
      setEvent(ev);
      setState('ready');
    })();
    return () => { active = false; };
  }, [token]);

  const handleJoin = useCallback(async () => {
    if (!event) return;
    setJoining(true);
    setJoinError(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('accept_event_invite', { p_token: token });
    setJoining(false);
    if (error || !data?.success) {
      const code = data?.error ?? error?.message;
      if (code === 'event_expired') {
        setState('expired');
      } else {
        setJoinError('Beitreten hat nicht geklappt. Bitte versuch es noch einmal.');
      }
      return;
    }
    setState('joined');
    // Kurz die Bestaetigung zeigen, dann zum Event.
    setTimeout(() => router.replace(`/app/event/${event.id}`), 900);
  }, [event, token, router]);

  const bannerUrl = event?.banner_url ?? event?.image_url ?? null;
  const formattedDate = event?.date
    ? new Date(event.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {state === 'loading' ? (
          <div className="w-full aspect-video rounded-card bg-elevated animate-pulse" />
        ) : state === 'invalid' ? (
          <>
            <div className="w-full aspect-video rounded-card bg-elevated flex items-center justify-center">
              <Lock size={36} className="text-muted-fg" />
            </div>
            <div className="space-y-1">
              <h1 className="text-lg font-heading font-bold tracking-tight">Einladung nicht gefunden</h1>
              <p className="text-[13px] text-muted-fg">
                Dieser Link ist ungültig oder wurde zurückgezogen.
              </p>
            </div>
          </>
        ) : (
          <>
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bannerUrl}
                alt=""
                className="w-full aspect-video rounded-card object-cover border border-border"
              />
            ) : (
              <div className="w-full aspect-video rounded-card bg-elevated border border-border" />
            )}

            <div className="space-y-2">
              <h1 className="text-xl font-heading font-bold tracking-tight">{event?.title}</h1>
              <div className="space-y-1 text-[13px] text-muted-fg">
                {formattedDate && (
                  <p className="flex items-center justify-center gap-2">
                    <Calendar size={14} />
                    {formattedDate}{event?.time ? `, ${event.time} Uhr` : ''}
                  </p>
                )}
                {event?.location && (
                  <p className="flex items-center justify-center gap-2">
                    <MapPin size={14} />
                    {event.location}
                  </p>
                )}
              </div>
            </div>

            {state === 'expired' ? (
              <p className="text-[13px] text-muted-fg">
                Dieses Event ist bereits vorbei.
              </p>
            ) : state === 'joined' ? (
              <div className="flex items-center justify-center gap-2 text-[14px] font-medium">
                <Check size={16} className="text-live" />
                Du bist dabei
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="w-full rounded-btn bg-primary-bg text-primary-text py-3 text-[14px] font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
                >
                  {joining ? 'Einen Moment…' : 'Einladung annehmen'}
                </button>
                {joinError && (
                  <p className="text-[12px] text-danger">{joinError}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
