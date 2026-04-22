// Entdecken page — renders the client component immediately with an
// empty event list. The client then fetches events from Supabase on
// mount. We intentionally don't prefetch events server-side any more
// because Vercel cold-starts were adding 10+ seconds of wait time
// before the page shell even painted. Users now see the full page
// structure (header, search bar, tabs) in < 300ms and skeleton cards
// swap in real events as soon as the client fetch completes.
import type { Event } from '@/types/occuro';
import DiscoverClient from './discover-client';

export default function DiscoverPage() {
  const initialEvents: Event[] = [];
  return <DiscoverClient initialEvents={initialEvents} />;
}
