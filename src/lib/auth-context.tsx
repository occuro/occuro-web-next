'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  organization: null,
  userType: null,
  loading: true,
  signOut: async () => {},
});

const RELOAD_GUARD_KEY = 'occuro:auth-reload-ts';
const RELOAD_GUARD_MS = 30_000;

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
// its own internal refresh — the usual cause is a corrupt/half-written
// sb-<ref>-auth-token in localStorage that the SDK tries to refresh on
// construction and then hangs forever, queueing every subsequent call
// (getSession, from().select(), everything) behind the stuck refresh.
function wipeAuthStorage(): void {
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
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

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
          wipeAuthStorage();
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
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // INITIAL_SESSION is handled by the IIFE above via the secure
        // getUser() path. Skip it here to avoid a redundant profile fetch.
        if (event === 'INITIAL_SESSION') return;

        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          await fetchProfile(u.id);
        } else {
          setProfile(null);
          setOrganization(null);
        }
      },
    );

    // Stuck-client recovery: after a long tab suspend / laptop sleep the
    // Supabase client can deadlock on an internal token refresh, which
    // hangs every subsequent query (profile *and* events). When the tab
    // becomes visible again, probe the session with a short timeout; if
    // the probe doesn't return, the client is stuck — drop the singleton
    // and hard-reload so we come back on fresh cookies via middleware.
    let stuckCheckInFlight = false;
    const onVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      if (stuckCheckInFlight) return;
      stuckCheckInFlight = true;
      try {
        const probe = await Promise.race<'ok' | 'stuck'>([
          supabase.auth.getSession().then(() => 'ok' as const).catch(() => 'ok' as const),
          new Promise<'stuck'>((r) => setTimeout(() => r('stuck'), 3000)),
        ]);
        if (probe === 'stuck' && !recentlyReloaded()) {
          console.warn('[auth] supabase client stuck after tab focus — resetting + reloading');
          markReloadAttempt();
          resetClient();
          window.location.reload();
        }
      } finally {
        stuckCheckInFlight = false;
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
        wipeAuthStorage();
        resetClient();
        window.location.reload();
        return;
      }
      console.warn('[auth] fetchProfile failed — keeping previous profile state');
      return;
    }

    const prof = profRes.data ?? null;

    // Query succeeded but no row yet (DB replication lag on fresh signup).
    if (!prof && retries > 0) {
      await new Promise((r) => setTimeout(r, 1000));
      return fetchProfile(userId, retries - 1);
    }

    setProfile(prof);

    if (prof?.user_type === 'organization') {
      const orgRes = await withTimeout(
        Promise.resolve(supabase.from('organizations').select('*').eq('owner_id', userId).maybeSingle()),
        5000,
        'fetchProfile.organizations',
      );
      if (orgRes) setOrganization(orgRes.data ?? null);
    }
  }

  const signOut = async () => {
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
    <AuthContext.Provider value={{ user, profile, organization, userType, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
