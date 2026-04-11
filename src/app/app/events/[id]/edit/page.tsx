'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { EventForm } from '@/components/events/event-form';
import type { Event } from '@/types/occuro';
import { ArrowLeft, Loader2, AlertCircle, Lock } from 'lucide-react';

export default function UserEventEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id]);

  async function load() {
    setLoading(true);
    const { data, error: loadErr } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();
    if (loadErr || !data) {
      setError(loadErr?.message ?? 'Event nicht gefunden.');
      setLoading(false);
      return;
    }
    // Authorization: only the creator can edit, and it must be their own
    // private event (individuals can't edit public events).
    if (data.organizer_profile_id !== user!.id) {
      setError('Du hast keine Berechtigung, dieses Event zu bearbeiten.');
      setLoading(false);
      return;
    }
    if (data.visibility !== 'private') {
      setError('Nur private Events können hier bearbeitet werden.');
      setLoading(false);
      return;
    }
    setEvent(data as Event);
    setLoading(false);
  }

  async function handleDelete() {
    if (!event) return;
    const { error: deleteErr } = await supabase.from('events').delete().eq('id', event.id);
    if (deleteErr) {
      setError(`Löschen fehlgeschlagen: ${deleteErr.message}`);
      return;
    }
    router.push('/app/profile');
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <Link
          href="/app/profile"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-fg hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft size={13} /> Zurück zum Profil
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
            Privates Event bearbeiten
          </h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Lock size={9} /> Privat
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-muted-fg" />
        </div>
      ) : error || !event ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 px-5 py-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-semibold text-red-300">
              {error ?? 'Etwas ist schiefgelaufen.'}
            </p>
            <Link
              href="/app/profile"
              className="inline-block mt-2 text-[12px] text-violet-400 hover:underline"
            >
              Zurück zum Profil
            </Link>
          </div>
        </div>
      ) : (
        <EventForm
          mode="individual"
          initialEvent={event}
          redirectAfterSave="/app/profile"
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
