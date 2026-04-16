'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient, resetClient } from '@/lib/supabase/client';
import { purgeOldSchemas } from '@/lib/versioned-storage';
import type { Profile, Organization, UserType } from '@/types/occuro';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  organization: Organization | null;
  userType: UserType | null;
  loading: boolean;
  // True when the SDK reported the session as invalid AND we couldn't
  // recover it. Shown as a non-destructive modal so the user can
  // choose to re-authenticate instead of being silently redirected.
  sessionExpired: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  organization: null,
  userType: null,
  loading: true,
  sessionExpired: false,
  signOut: async () => {},
});

const RELOAD_GUARD_KEY = 'occuro:auth-reload-ts';
// 10s (down from 30s). Just long enough to prevent a tight reload loop
// on a genuinely-down Supabase, short enough that a transient wedge
// unsticks itself quickly. For the "I clicked the SOS button" path the
// guard is ignored anyway.
const RELOAD_GUARD_MS = 10_000;

function recentlyReloaded(): boolean {
  try {
    const ts = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    return ts > 0 && Date.now() - ts < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

function markReloadAttempt(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

// Nuclear recovery: wipe all sb-* auth storage so the next client mount
// starts from a blank slate. Used when the Supabase SDK is deadlocked on
// its own internal refresh.
//
// CRUCIALLY: the Supabase SSR client stores its session in httpOnly
// cookies, which JavaScript cannot delete via document.cookie. We HAVE
// to POST to /api/auth/wipe so the server clears them — otherwise the
// middleware immediately re-establishes the bad session on the next
// request and the reload loops back to the same deadlock, with the
// reload-guard then blocking any further recovery.
async function wipeAuthStorage(): Promise<void> {
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    });
  } catch {}
  try {
    document.cookie.split(';').forEach((c) => {
      const name = c.trim().split('=')[0];
      if (!name || !name.startsWith('sb-')) return;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
    });
  } catch {}
  // Server-side wipe of httpOnly sb-* cookies — timeout-guarded so a
  // hung endpoint can't block the reload we're about to trigger.
  try {
    await Promise.race([
      fetch('/api/auth/wipe', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      }),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [supabase] = useState(() => createClient());
  // Distinguishes user-initiated logouts from SDK-initiated ones. The
  // Supabase SDK fires SIGNED_OUT for both "user clicked logout" AND
  // "token refresh failed transiently" — the second case is what
  // produces the frustrating spontaneous-logout bug. When set to true
  // by our signOut(), the listener knows to clear state immediately;
  // otherwise it tries to recover the session before giving up.
  const intentionalSignOutRef = useRef(false);

  useEffect(() => {
    purgeOldSchemas();

    const forceReady = setTimeout(() => setLoading(false), 5000);

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T | null> =>
      Promise.race<T | null>([
        p.then((v) => v as T).catch((e) => {
          console.warn(`[auth] ${label} threw`, e);
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => {
          console.warn(`[auth] ${label} timed out after ${ms}ms`);
          resolve(null);
        }, ms)),
      ]);

    (async () => {
      // Fast path: getSession() reads from localStorage/cookies without
      // hitting the network, so it can't hang on Supabase-Auth latency.
      // Middleware (proxy.ts) already validates the session server-side on
      // every request, so the session we see here is trustworthy — we
      // don't need a network-verified getUser() on initial render.
      const sessRes = await withTimeout(supabase.auth.getSession(), 3000, 'getSession');
      // sessRes === null means getSession itself hung — getSession is a
      // pure localStorage read, so a hang here means the SDK is stuck in
      // an internal refresh lock (usually due to a corrupted sb-*-auth
      // token). The client is unrecoverable; wipe auth storage and reload
      // so the next mount starts clean.
      if (sessRes === null) {
        if (!recentlyReloaded()) {
          console.warn('[auth] getSession hung — wiping auth storage + reload');
          markReloadAttempt();
          await wipeAuthStorage();
          resetClient();
          window.location.reload();
          return;
        }
        // Already tried once within the guard window — fall through to
        // unauth state so the login page can handle it without looping.
        setUser(null);
        setLoading(false);
        return;
      }
      const verifiedUser = sessRes.data?.session?.user ?? null;
      if (!verifiedUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(verifiedUser);
      await fetchProfile(verifiedUser.id);
      setLoading(false);
      // Safety retry: profile fetch right after login occasionally
      // races with server-side cookie propagation and comes back empty
      // or with a transient auth error, leaving the sidebar on "User".
      // Kick a delayed refetch if that happened.
      setTimeout(() => {
        void (async () => {
          const { data } = await supabase.auth.getSession();
          const uid = data.session?.user?.id;
          if (uid) void fetchProfile(uid);
        })();
      }, 3000);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // INITIAL_SESSION is handled by the IIFE above via the secure
        // getUser() path. Skip it here to avoid a redundant profile fetch.
        if (event === 'INITIAL_SESSION') return;

        const u = session?.user ?? null;

        // If the SDK says we're signed out but the user didn't click
        // logout, try to recover the session before surfacing any UI
        // change. A transient SIGNED_OUT (failed refresh, network
        // blip, etc.) should never produce a visible logout.
        if (event === 'SIGNED_OUT' && !intentionalSignOutRef.current) {
          console.warn('[auth] SIGNED_OUT received without user intent — attempting recovery');
          const recovery = await Promise.race<'ok' | 'fail'>([
            supabase.auth.refreshSession().then((r) => (r.data.session ? 'ok' : 'fail')).catch(() => 'fail'),
            new Promise<'fail'>((r) => setTimeout(() => r('fail'), 4000)),
          ]);
          if (recovery === 'ok') {
            console.warn('[auth] recovery succeeded, keeping user state');
            setSessionExpired(false);
            return;
          }
          // Recovery failed → show the non-destructive modal instead
          // of silently clearing user state + redirecting. Keeping
          // user/profile populated means the sidebar still shows
          // their name etc. while the modal invites them to
          // re-authenticate. This replaces the previous "User"
          // fallback flash + auto-redirect.
          console.warn('[auth] recovery failed — flagging session as expired, leaving user state');
          setSessionExpired(true);
          return;
        }

        // Intentional logout or any other event (SIGNED_IN,
        // TOKEN_REFRESHED, USER_UPDATED): write state normally.
        setSessionExpired(false);
        setUser(u);
        if (u) {
          await fetchProfile(u.id);
        } else {
          setProfile(null);
          setOrganization(null);
        }
      },
    );

    // Tab-return recovery: background tabs get their setInterval callbacks
    // throttled by browsers, which means Supabase's autoRefreshToken
    // timer may not have fired while we were away. On tab-return, the
    // JWT can already be expired — queries 401 until the next refresh
    // cycle, the profile stays in React state but looks broken ("User"
    // fallback), and users end up manually reloading.
    //
    // Strategy: on visibility=visible, proactively kick a session
    // refresh AND a profile re-fetch. If the refresh fails (revoked on
    // another device, network dead), we leave the existing state alone
    // so the user isn't suddenly "logged out" — they can still see
    // their last known profile while deciding to manually reload. A
    // nuclear wipe on every tab-switch was producing false positives.
    let visibilityCheckInFlight = false;
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      if (visibilityCheckInFlight) return;
      visibilityCheckInFlight = true;
      try {
        // Refresh the JWT. If the tab was away long enough that the
        // token expired, this renews it. If there's no valid refresh
        // token (revoked), it fails quickly and we just return —
        // subsequent queries will surface a proper auth error and the
        // user can react.
        await Promise.race([
          supabase.auth.refreshSession().catch(() => null),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
        // Best-effort profile re-sync so the sidebar name / avatar
        // reflect any changes made in another tab.
        const { data } = await supabase.auth.getSession();
        const uid = data.session?.user?.id;
        if (uid) {
          void fetchProfile(uid);
        }
      } finally {
        visibilityCheckInFlight = false;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(forceReady);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProfile(userId: string, retries = 2) {
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T | null> =>
      Promise.race<T | null>([
        p.then((v) => v as T).catch((e) => {
          console.warn(`[auth] ${label} threw`, e);
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => {
          console.warn(`[auth] ${label} timed out after ${ms}ms`);
          resolve(null);
        }, ms)),
      ]);

    const profRes = await withTimeout(
      Promise.resolve(supabase.from('profiles').select('*').eq('id', userId).maybeSingle()),
      5000,
      'fetchProfile.profiles',
    );

    // profRes === null means the query itself failed (timeout / network /
    // expired JWT). Retry without overwriting the current profile — blowing
    // it away on a transient error is what caused the "User" fallback bug.
    if (!profRes) {
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return fetchProfile(userId, retries - 1);
      }
      // Out of retries — if we never had a profile to begin with, the
      // client is effectively dead (can't fetch anything). Wipe auth
      // storage + reset the singleton + hard-reload so the next mount
      // starts clean. If we already had a profile, keep it and hope it's
      // a transient blip; the visibility handler can still recover.
      // Guard against infinite reload loops if Supabase itself is down.
      if (!profile && !recentlyReloaded()) {
        console.warn('[auth] fetchProfile hard-failed with no prior profile — wiping + reload');
        markReloadAttempt();
        await wipeAuthStorage();
        resetClient();
        window.location.reload();
        return;
      }
      console.warn('[auth] fetchProfile failed — keeping previous profile state');
      return;
    }

    // supabase-js doesn't throw on HTTP / auth errors — it returns
    // { data: null, error: { ... } }. When the JWT is expired (e.g.
    // after returning from a backgrounded tab) this path kicks in:
    // profRes exists, profRes.data is null, but profRes.error is a
    // JWT-expired error. Previously the code treated this as "profile
    // doesn't exist" and setProfile(null) — which is what produced the
    // "User" fallback in the sidebar while the user was actually still
    // logged in. Treat any error as a transient failure and keep the
    // existing profile intact until a real answer comes back.
    const err = (profRes as { error?: { message?: string } | null }).error;
    if (err) {
      console.warn('[auth] fetchProfile returned error — keeping previous profile state:', err.message);
      return;
    }

    const prof = profRes.data ?? null;

    // Query succeeded but no row yet (DB replication lag on fresh signup).
    if (!prof && retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return fetchProfile(userId, retries - 1);
    }

    // Only overwrite with null if we reached here via "no row + no more
    // retries" AND we didn't already have a profile. Nulling a
    // previously-good profile after a transient failure is the exact
    // thing that caused the User-fallback regression.
    if (!prof && profile) {
      console.warn('[auth] fetchProfile returned no row after retries — keeping previous profile state');
      return;
    }

    setProfile(prof);

    if (prof?.user_type === 'organization') {
      const orgRes = await withTimeout(
        Promise.resolve(supabase.from('organizations').select('*').eq('owner_id', userId).maybeSingle()),
        5000,
        'fetchProfile.organizations',
      );
      if (orgRes && !(orgRes as { error?: unknown }).error) {
        setOrganization(orgRes.data ?? null);
      }
    }
  }

  const signOut = async () => {
    // Mark this as an intentional sign-out so the onAuthStateChange
    // listener clears state immediately instead of trying to recover
    // the session.
    intentionalSignOutRef.current = true;

    // Try the SDK signOut first, but RACE it against a 2s timeout so a
    // hung supabase client (the actual root cause of "kann mich nicht
    // ausloggen") can't block the cleanup. The cleanup below is the
    // real source of truth — wiping cookies + localStorage + redirecting
    // to / is what actually logs the user out from the app's POV.
    const withTimeout = <T,>(p: Promise<T>, ms: number) =>
      Promise.race<T | 'timeout'>([
        p as Promise<T>,
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
      ]);

    try {
      const result = await withTimeout(supabase.auth.signOut(), 2000);
      if (result === 'timeout') {
        console.warn('[auth] supabase signOut hung — moving on with local cleanup');
      }
    } catch (e) {
      console.warn('[auth] supabase signOut threw — moving on with local cleanup', e);
    }
    // Safety net: purge any leftover supabase tokens (cookies + localStorage).
    // This is the part that actually guarantees the user is logged out
    // from the browser's POV — even if the SDK above hung or no-op'd.
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') || k.startsWith('@occuro')) localStorage.removeItem(k);
      });
      sessionStorage.clear();
      document.cookie.split(';').forEach((c) => {
        const name = c.trim().split('=')[0];
        if (!name) return;
        // Clear on root path AND on the host (covers subdomain cookies)
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
      });
    } catch {}
    setUser(null);
    setProfile(null);
    setOrganization(null);
    // Hard navigate — guarantees every cached client/store is reset and
    // the user lands on the public landing page on a fresh bundle.
    window.location.href = '/';
  };

  const userType = profile?.user_type ?? null;

  return (
    <AuthContext.Provider
      value={{ user, profile, organization, userType, loading, sessionExpired, signOut }}
    >
      {children}
      {loading && <StuckLoadingRecovery />}
      {sessionExpired && <SessionExpiredModal onReAuth={signOut} />}
    </AuthContext.Provider>
  );
}

// Non-destructive "session expired" overlay. Shown instead of silently
// redirecting to /login when a refresh fails. Keeps the sidebar /
// current page rendered behind it so the user's context is preserved
// and they understand what's happening.
function SessionExpiredModal({ onReAuth }: { onReAuth: () => Promise<void> }) {
  const [working, setWorking] = useState(false);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 380,
          width: '100%',
          background: 'rgba(17,17,24,0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 18,
          padding: 22,
          color: '#fff',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          Deine Sitzung ist abgelaufen
        </p>
        <p style={{ margin: '8px 0 18px', fontSize: 13, lineHeight: 1.45, color: 'rgba(255,255,255,0.7)' }}>
          Aus Sicherheitsgründen musst du dich neu anmelden. Deine Daten sind nicht verloren — die App lädt dich gleich zum Login weiter.
        </p>
        <button
          onClick={async () => {
            if (working) return;
            setWorking(true);
            await onReAuth();
          }}
          disabled={working}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            background: working ? 'rgba(124,58,237,0.6)' : '#7c3aed',
            color: '#fff',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: working ? 'default' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {working ? 'Einen Moment…' : 'Neu anmelden'}
        </button>
      </div>
    </div>
  );
}

// Last-resort safety net: a visible "App zurücksetzen" button that
// appears after 6s of continuous loading. Gives users an escape from
// any stuck state (deadlocked Supabase client, invalidated refresh
// token cascade, etc.) without needing DevTools. Click = full wipe
// (localStorage + sessionStorage + client cookies + server sb-*
// cookies via /api/auth/wipe) + hard navigate to /. Bypasses the
// RELOAD_GUARD since the user explicitly asked to reset.
function StuckLoadingRecovery() {
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  const onClick = async () => {
    if (working) return;
    setWorking(true);
    try {
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith('sb-') || k.startsWith('@occuro') || k === RELOAD_GUARD_KEY) {
            localStorage.removeItem(k);
          }
        });
        sessionStorage.clear();
      } catch {}
      try {
        document.cookie.split(';').forEach((c) => {
          const name = c.trim().split('=')[0];
          if (!name || !name.startsWith('sb-')) return;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        });
      } catch {}
      try {
        await Promise.race([
          fetch('/api/auth/wipe', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
          }),
          new Promise((r) => setTimeout(r, 2500)),
        ]);
      } catch {}
      resetClient();
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        maxWidth: 420,
        width: 'calc(100% - 32px)',
        padding: 14,
        borderRadius: 16,
        background: 'rgba(17, 17, 24, 0.96)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
          Die App reagiert nicht?
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 11.5, opacity: 0.7, lineHeight: 1.35 }}>
          Klick hier, um die Sitzung zurückzusetzen und neu zu laden.
        </p>
      </div>
      <button
        onClick={onClick}
        disabled={working}
        style={{
          flexShrink: 0,
          padding: '8px 14px',
          borderRadius: 999,
          background: working ? 'rgba(255,255,255,0.2)' : '#7c3aed',
          color: '#fff',
          border: 'none',
          fontSize: 12,
          fontWeight: 600,
          cursor: working ? 'default' : 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {working ? 'Setzt zurück…' : 'Zurücksetzen'}
      </button>
    </div>
  );
}

export const useAuth = () => useContext(AuthContext);
