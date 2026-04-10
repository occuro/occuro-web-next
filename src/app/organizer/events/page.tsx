import { redirect } from 'next/navigation';

// /organizer/events has been merged into /organizer (the new home page).
// Redirect any old links so we don't break bookmarks or stale navigation.
export default function OrganizerEventsRedirect() {
  redirect('/organizer');
}
