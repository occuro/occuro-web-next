// Server component wrapper for the Entdecken page. Prefetches the
// public event feed so the user sees real content on first paint
// even if the browser's Supabase client is in a bad refresh state.
// The interactive layer (search, filters, personal sections, RSVP
// etc.) lives in DiscoverClient.
import { createClient } from '@/lib/supabase/server';
import type { Event } from '@/types/occuro';
import DiscoverClient from './discover-client';

export default async function DiscoverPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('events')
    .select('*')
    .eq('visibility', 'public')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(60);

  const initialEvents = (data ?? []) as Event[];

  return <DiscoverClient initialEvents={initialEvents} />;
}
