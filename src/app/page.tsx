'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { OccuroRingLogo } from '@/components/occuro-ring-logo';
import { InteractiveGrid } from '@/components/interactive-grid';
import { useEffect } from 'react';

export default function LandingPage() {
  const { user, userType, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace(userType === 'organization' ? '/organizer' : '/app');
    }
  }, [loading, user, userType, router]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="animate-pulse text-3xl font-heading font-bold tracking-tight">occuro</div>
        <button
          onClick={() => { localStorage.clear(); window.location.reload(); }}
          className="mt-4 px-4 py-2 text-xs text-muted-fg hover:text-foreground transition-colors"
        >
          Laden hängt? Hier klicken zum Zurücksetzen
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Interactive Background Grid */}
      <InteractiveGrid />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 lg:px-12 py-5" data-grid-exclude>
        <h1 className="text-xl font-heading font-bold tracking-tight">occuro</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="px-5 py-2.5 rounded-full text-[13px] font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            Anmelden
          </Link>
          <Link
            href="/auth/register"
            className="px-5 py-2.5 rounded-full text-[13px] font-medium bg-primary-bg text-primary-text hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            Registrieren
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-8">
        <div className="max-w-xl text-center space-y-8" data-grid-exclude>
          <div className="space-y-6">
            <OccuroRingLogo size={64} className="mx-auto text-foreground" />
            <h2 className="text-[3.2rem] leading-[1.1] font-heading font-bold tracking-tight">
              Entdecke Events.<br />
              <span className="text-muted-fg">Verbinde dich.</span><br />
              <span className="text-muted-fg/60">Teile Momente.</span>
            </h2>
            <p className="text-base text-muted-fg max-w-sm mx-auto leading-relaxed">
              Finde Events in deiner Nähe, triff neue Leute und erlebe unvergessliche Momente.
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Link
              href="/auth/register"
              className="px-8 py-3.5 rounded-full text-sm font-semibold bg-primary-bg text-primary-text hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-sm"
            >
              Registrieren
            </Link>
            <Link
              href="/auth/login"
              className="px-8 py-3.5 rounded-full text-sm font-semibold border border-border-strong text-foreground hover:bg-muted/50 active:scale-[0.98] transition-all"
            >
              Anmelden
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 text-[12px] text-muted-fg">
        &copy; {new Date().getFullYear()} occuro
      </footer>
    </div>
  );
}
