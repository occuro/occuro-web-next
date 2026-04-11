import { redirect } from 'next/navigation';

// Wallet page removed from the WebApp — tickets are managed in the
// mobile app where you actually present the ticket image at the door.
// Old bookmarks redirect back to discover instead of 404'ing.
export default function WalletRedirect() {
  redirect('/app');
}
