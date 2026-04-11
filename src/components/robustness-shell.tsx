'use client';

import { Component, useEffect, useState, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, X, Sparkles } from 'lucide-react';

/**
 * RobustnessShell wraps the entire app with several layers of protection
 * against deploy-time breakage:
 *
 * 1. **ChunkLoadError auto-recovery** (window-level): when Next.js fails
 *    to load a JS chunk because the file no longer exists on the new
 *    deploy, we trigger a single hard reload (with a cooldown so we
 *    can't get into a reload loop).
 *
 * 2. **Update-available banner**: polls /api/version every 30s + on
 *    every tab focus + on every click. Compares against the build the
 *    user is running. When a newer deploy is detected, an unobtrusive
 *    bottom-right toast lets the user actively update with one tap.
 *    After 5 minutes of being shown, it auto-reloads to prevent stale
 *    sessions from staying broken indefinitely.
 *
 * 3. **Error boundary**: if a React component throws, we render a
 *    "something went wrong" screen with a Reset button instead of a
 *    blank page. Reset clears auth + localStorage + reloads.
 */
export function RobustnessShell({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ChunkErrorRecovery />
      <UpdateAvailableBanner />
      {children}
    </ErrorBoundary>
  );
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
// 2. Update available banner
// ────────────────────────────────────────────────────────────────────

const VERSION_POLL_INTERVAL_MS = 30 * 1000; // 30s — was 60s, now more aggressive
const FORCE_RELOAD_AFTER_MS = 5 * 60 * 1000; // 5min — auto-reload if user ignores
const BANNER_DISMISS_KEY = '__occuro_update_dismissed_for';

function UpdateAvailableBanner() {
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Build-time deployment ID baked into the bundle the user is running.
    const myDeploymentId = process.env.NEXT_PUBLIC_DEPLOYMENT_ID;
    // 'dev' means VERCEL_DEPLOYMENT_ID wasn't set at build time. This
    // happens locally and SHOULD also happen on Vercel — if it does,
    // there's a misconfiguration we want to surface.
    const isDev = !myDeploymentId || myDeploymentId === 'dev';
    if (isDev) {
      console.warn('[robustness] NEXT_PUBLIC_DEPLOYMENT_ID is "dev" — skew detection disabled. On Vercel this means VERCEL_DEPLOYMENT_ID was not present at build time.');
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let forceReloadTimer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { deploymentId: string };
        if (cancelled) return;
        if (data.deploymentId && data.deploymentId !== myDeploymentId) {
          // A newer build is live!
          let dismissedFor: string | null = null;
          try { dismissedFor = sessionStorage.getItem(BANNER_DISMISS_KEY); } catch {}

          // If the user already dismissed THIS specific version, respect
          // it but still schedule a force-reload after 5 minutes.
          if (dismissedFor === data.deploymentId) {
            scheduleForceReload();
            return;
          }
          setUpdateAvailable(data.deploymentId);
          scheduleForceReload();
        }
      } catch {
        // Network errors are fine — we just retry on the next tick
      }
    }

    function scheduleForceReload() {
      if (forceReloadTimer) return;
      forceReloadTimer = setTimeout(() => {
        // After 5 min the user almost certainly wants to be on the
        // new build. Hard reload — they can always re-dismiss if a
        // newer-newer build comes after.
        console.warn('[robustness] auto-reload after 5min — newer build has been live');
        window.location.reload();
      }, FORCE_RELOAD_AFTER_MS);
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
      if (forceReloadTimer) clearTimeout(forceReloadTimer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
    };
  }, []);

  function applyUpdate() {
    try { sessionStorage.removeItem(BANNER_DISMISS_KEY); } catch {}
    window.location.reload();
  }

  function dismiss() {
    if (updateAvailable) {
      try { sessionStorage.setItem(BANNER_DISMISS_KEY, updateAvailable); } catch {}
    }
    setDismissed(true);
  }

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm z-[100] animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-2xl border border-violet-500/30 bg-surface shadow-2xl shadow-black/40 p-4 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center flex-shrink-0">
            <Sparkles size={18} className="text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[14px] font-semibold">Neue Version verfügbar</h3>
            <p className="text-[12px] text-muted-fg mt-0.5">
              Bitte aktualisiere die App, sonst funktionieren manche Aktionen nicht mehr.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={applyUpdate}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors flex items-center gap-1.5"
              >
                <RefreshCw size={12} />
                Jetzt aktualisieren
              </button>
              <button
                onClick={dismiss}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium border border-border-subtle hover:bg-elevated transition-colors"
              >
                Später
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="p-1 -m-1 text-muted-fg hover:text-foreground transition-colors flex-shrink-0"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
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
