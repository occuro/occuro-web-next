import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'occuro — Entdecke Events in deiner Nähe',
  description: 'Events entdecken, Tickets kaufen, Freunde treffen. Die Plattform für Veranstalter und Eventbesucher.',
  appleWebApp: {
    capable: true,
    title: 'occuro',
    statusBarStyle: 'black-translucent',
  },
};

// Mobile-first viewport with iOS notch support. `viewportFit: cover`
// lets us draw under the status bar / home indicator and use the
// safe-area-inset-* CSS env vars to keep content out of those zones.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0A0A0B' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
