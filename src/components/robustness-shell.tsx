'use client';

import { Component, useEffect, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * RobustnessShell wraps the entire app with several layers of protection
 * against deploy-time breakage. Vercel's built-in Skew Protection is
 * Pro-only ($20/mo) so we roll our own with a service worker + polling.
 *
 * 1. **Service Worker** (`/sw.js`): intercepts fetches to /_next/static/*
 *    chunks. If any returns 404 (file no longer exists on the new
 *    deploy), the SW posts a CHUNK_GONE message to every open tab.
 *    The shell listens and triggers a hard reload. Catches the race
 *    where the user clicks a link that loads a chunk from the old
 *    build that's already gone.
 *
 * 2. **ChunkLoadError window listener** (ChunkErrorRecovery): catches
 *    the same condition from a different angle — if React/Next surfaces
 *    a ChunkLoadError directly to window.onerror, we hard-reload.
 *
 * 3. **Deploy-detect-and-bounce**: polls /api/version every 30s + on
 *    every tab focus + on every click. When a newer deploy is detected
 *    we IMMEDIATELY sign the user out and bounce them to the landing
 *    page. Re-login on the new bundle is a clean restart that resolves
 *    the "stuck app, can't even log out" state we kept seeing.
 *
 * 4. **Error boundary**: if a React component throws, we render a
 *    "something went wrong" screen with a Reset button.
 */
export function RobustnessShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ServiceWorkerInstaller />
      <ChunkErrorRecovery />
      <DeployBouncer />
      {children}
    </ErrorBoundary>
  );
}

// ────────────────────────────────────────────────────────────────────
// 0. Service worker installer
// ────────────────────────────────────────────────────────────────────

const SW_RELOAD_COOLDOWN_KEY = '__occuro_sw_reload_at';
const SW_RELOAD_COOLDOWN_MS = 30 * 1000;

function ServiceWorkerInstaller() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let active = true;

    // Register the worker. updateViaCache='none' makes the browser
    // revalidate sw.js on every navigation, so SW updates roll out
    // basically immediately instead of after the browser's default
    // 24h cache window.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        if (!active) return;
        // Force an update check on register so we always have the
        // freshest worker.
        void reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('[robustness] SW register failed:', err);
      });

    // Handle CHUNK_GONE messages from the SW. Cooldown prevents reload
    // loops if the new build is also broken.
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== 'CHUNK_GONE') return;
      try {
        const last = sessionStorage.getItem(SW_RELOAD_COOLDOWN_KEY);
        if (last && Date.now() - parseInt(last, 10) < SW_RELOAD_COOLDOWN_MS) return;
        sessionStorage.setItem(SW_RELOAD_COOLDOWN_KEY, String(Date.now()));
      } catch {}
      console.warn('[robustness] SW reported chunk gone — hard reload');
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener('message', onMessage);

    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, []);
  return null;
}

// ────────────────────────────────────────────────────────────────────
// 1. ChunkLoadError recovery
// ────────────────────────────────────────────────────────────────────

const RELOAD_COOLDOWN_KEY = '__occuro_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 30 * 1000; // 30s — prevents reload loops

function ChunkErrorRecovery() {
  useEffect(() => {
    function shouldReload(): boolean {
      try {
        const last = sessionStorage.getItem(RELOAD_COOLDOWN_KEY);
        if (!last) return true;
        return Date.now() - parseInt(last, 10) > RELOAD_COOLDOWN_MS;
      } catch {
        return true;
      }
    }
    function markReload() {
      try { sessionStorage.setItem(RELOAD_COOLDOWN_KEY, String(Date.now())); } catch {}
    }
    function recover() {
      if (!shouldReload()) {
        console.error('[robustness] Chunk load failed twice within cooldown — manual reload required');
        return;
      }
      console.warn('[robustness] Chunk load failed — triggering hard reload');
      markReload();
      window.location.reload();
    }

    function onError(event: ErrorEvent) {
      const msg = event.message || '';
      if (
        /loading chunk .* failed/i.test(msg) ||
        /failed to fetch dynamically imported module/i.test(msg) ||
        /ChunkLoadError/i.test(msg)
      ) {
        event.preventDefault();
        recover();
      }
    }
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const msg = reason?.message || String(reason || '');
      if (
        reason?.name === 'ChunkLoadError' ||
        /loading chunk .* failed/i.test(msg) ||
        /failed to fetch dynamically imported module/i.test(msg)
      ) {
        event.preventDefault();
        recover();
      }
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);
  return null;
}

// ────────────────────────────────────────────────────────────────────
// 2. Deploy bouncer — sign out + bounce on new deployment
// ────────────────────────────────────────────────────────────────────

const VERSION_POLL_INTERVAL_MS = 30 * 1000; // 30s

/**
 * Detects when a new deployment is live and forces the current user
 * out completely. The previous version showed a "Neue Version
 * verfügbar" banner the user could dismiss — but in practice users
 * would dismiss it, the old bundle would slowly degrade as APIs
 * shifted shape, and they'd end up on a screen where they couldn't
 * even click "Abmelden". So now we don't ask: we sign out and bounce
 * to the landing page the moment we see a newer deploymentId. The
 * re-login on the fresh bundle is the clean reset.
 *
 * Auth pages are exempt — bouncing someone mid-login would be
 * confusing and they're already on a fresh bundle anyway.
 */
function DeployBouncer() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Build-time deployment ID baked into the bundle the user is running.
    const myDeploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
    const isDev = !myDeploymentId || myDeploymentId === 'dev';
    if (isDev) {
      console.warn('[robustness] NEXT_PUBLIC_DEPLOYMENT_ID is "dev" — skew detection disabled. On Vercel this means VERCEL_DEPLOYMENT_ID was not present at build time.');
      return;
    }

    let cancelled = false;
    let bouncing = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function bounce(newDeploymentId: string) {
      if (bouncing) return;
      bouncing = true;
      console.warn(`[robustness] new deployment detected (${newDeploymentId}) — signing out and bouncing`);
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('[robustness] supabase signOut failed during bounce:', e);
      }
      try {
        // Belt-and-suspenders cleanup of any leftover storage that
        // could survive signOut and bind the user to the old bundle.
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('sb-') || k.startsWith('@occuro')) {
            localStorage.removeItem(k);
          }
        });
        sessionStorage.clear();
      } catch {}
      // Hard navigate (not reload!) to / so we drop ALL React state and
      // load the new bundle from scratch. The landing page will show
      // login/register prompts.
      window.location.href = '/';
    }

    async function check() {
      try {
        // Skip the check if the user is already on an auth screen — they
        // shouldn't get yanked mid-login.
        if (window.location.pathname.startsWith('/auth')) return;

        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { deploymentId: string };
        if (cancelled) return;
        if (data.deploymentId && data.deploymentId !== myDeploymentId) {
          await bounce(data.deploymentId);
        }
      } catch {
        // Network errors are fine — we just retry on the next tick
      }
    }

    // First check immediately, then poll every 30s.
    void check();
    const schedule = () => {
      pollTimer = setTimeout(async () => {
        await check();
        if (!cancelled) schedule();
      }, VERSION_POLL_INTERVAL_MS);
    };
    schedule();

    // Also check on tab focus + on click anywhere (most common moments
    // a user would notice a stale build).
    const onFocus = () => { void check(); };
    const onClick = () => { void check(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('click', onClick, { capture: true });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
    };
  }, []);

  return null;
}

// ────────────────────────────────────────────────────────────────────
// 3. Error boundary with reset button
// ────────────────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, errorInfo: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error);
    console.error('[ErrorBoundary] componentStack:', errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  reset = () => {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') || k.startsWith('@occuro')) {
          localStorage.removeItem(k);
        }
      });
      sessionStorage.clear();
      document.cookie.split(';').forEach((c) => {
        const name = c.trim().split('=')[0];
        if (name.startsWith('sb-')) {
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        }
      });
    } catch {}
    window.location.href = '/';
  };

  retry = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const { error, errorInfo, showDetails } = this.state;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-lg w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} className="text-red-400" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-2xl font-heading font-bold tracking-tight">Etwas ist schiefgelaufen</h1>
            <p className="text-sm text-muted-fg mt-2">
              Die App ist auf einen unerwarteten Fehler gestoßen. Versuche es mit einem Neuladen — falls das nicht hilft, setz die App zurück.
            </p>
          </div>

          <div className="text-left">
            <button
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="text-[11px] text-muted-fg hover:text-foreground transition-colors mb-2"
            >
              {showDetails ? '▾' : '▸'} Technische Details
            </button>
            {showDetails && (
              <pre className="text-[10px] bg-elevated border border-border-subtle rounded-xl p-3 overflow-auto max-h-48 text-red-400 whitespace-pre-wrap break-words">
                <strong className="text-red-300">{error.name}: {error.message}</strong>
                {errorInfo?.componentStack && (
                  <>
                    {'\n\n'}
                    <span className="text-muted-fg">Stack:</span>
                    {errorInfo.componentStack}
                  </>
                )}
              </pre>
            )}
          </div>

          <div className="flex gap-2 justify-center">
            <button
              onClick={this.retry}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold border border-border-subtle hover:bg-elevated transition-colors flex items-center gap-2"
            >
              <RefreshCw size={13} /> Neuladen
            </button>
            <button
              onClick={this.reset}
              className="px-5 py-2.5 rounded-full text-[13px] font-semibold bg-red-600 text-white hover:bg-red-500 transition-colors"
            >
              App zurücksetzen
            </button>
          </div>
        </div>
      </div>
    );
  }
}
