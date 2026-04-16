// Server component wrapper — prefetches the event row using the
// server-side Supabase client (backed by the middleware-refreshed
// cookies) so the page renders with real event data even if the
// browser's Supabase session is in a borked / refreshing state. The
// interactive parts (RSVP, feed, invitations, friend participation)
// still live in the client component below.
import { createClient } from '@/lib/supabase/server';
import type { Event } from '@/types/occuro';
import EventDetailClient from './event-detail-client';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch the event on the server. RLS restricts access the same way
  // as the client would — if the user can't see the event, data is
  // null and the client component renders the not-found state.
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();

  const initialEvent = (data as Event | null) ?? null;

  return <EventDetailClient id={id} initialEvent={initialEvent} />;
}
