import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { RobustnessShell } from '@/components/robustness-shell';

export const metadata: Metadata = {
  title: 'occuro — Entdecke Events in deiner Nähe',
  description: 'Events entdecken, Tickets kaufen, Freunde treffen. Die Plattform für Veranstalter und Eventbesucher.',
  manifest: '/manifest.webmanifest',
  applicationName: 'occuro',
  appleWebApp: {
    capable: true,
    title: 'occuro',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
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
        {/* RobustnessShell wraps the whole app so it survives deploys
            without leaving users stuck. Provides:
              - ChunkLoadError auto-recovery (hard reload on stale JS)
              - "Update verfügbar" banner via /api/version polling
              - ErrorBoundary with reset button as last-line fallback */}
        <RobustnessShell>
          <AuthProvider>{children}</AuthProvider>
        </RobustnessShell>
      </body>
    </html>
  );
}
