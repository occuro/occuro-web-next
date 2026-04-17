import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { RobustnessShell } from '@/components/robustness-shell';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Organization } from '@/types/occuro';
import type { User } from '@supabase/supabase-js';

const SITE_URL = 'https://app.occuroapp.com';
const SITE_TITLE = 'occuro — Entdecke Events in deiner Nähe';
const SITE_DESCRIPTION = 'Events entdecken, Tickets kaufen, Freunde treffen. Die Plattform für Veranstalter und Eventbesucher.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: '/manifest.webmanifest',
  applicationName: 'occuro',
  appleWebApp: {
    capable: true,
    title: 'occuro',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'occuro',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: 'de_DE',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Seed AuthProvider with server-resolved user/profile/organization so
  // the first paint after re-login or page nav already has the correct
  // identity — no "User" fallback flash while the client-side fetch
  // races against cookie propagation or transient 401s. All errors
  // swallowed: unauth pages and transient failures fall through to the
  // client bootstrap in AuthProvider.
  let initialUser: User | null = null;
  let initialProfile: Profile | null = null;
  let initialOrganization: Organization | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      initialUser = user;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      initialProfile = (profile ?? null) as Profile | null;
      if (initialProfile?.user_type === 'organization') {
        const { data: org } = await supabase
          .from('organizations')
          .select('*')
          .eq('owner_id', user.id)
          .maybeSingle();
        initialOrganization = (org ?? null) as Organization | null;
      }
    }
  } catch {
    // ignore — AuthProvider will bootstrap from the browser client
  }

  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/* RobustnessShell wraps the whole app so it survives deploys
            without leaving users stuck. Provides:
              - ChunkLoadError auto-recovery (hard reload on stale JS)
              - "Update verfügbar" banner via /api/version polling
              - ErrorBoundary with reset button as last-line fallback */}
        <RobustnessShell>
          <AuthProvider
            initialUser={initialUser}
            initialProfile={initialProfile}
            initialOrganization={initialOrganization}
          >
            {children}
          </AuthProvider>
        </RobustnessShell>
      </body>
    </html>
  );
}
