'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
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

    let initialLoadDone = false;

    (async () => {
      const result = await withTimeout(supabase.auth.getUser(), 4000, 'getUser');
      const verifiedUser = result?.data?.user ?? null;
      if (!verifiedUser) {
        setUser(null);
        setLoading(false);
        initialLoadDone = true;
        return;
      }
      setUser(verifiedUser);
      await fetchProfile(verifiedUser.id);
      setLoading(false);
      initialLoadDone = true;
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          if (initialLoadDone) {
            await fetchProfile(u.id);
          }
        } else {
          setProfile(null);
          setOrganization(null);
        }
      },
    );

    return () => {
      clearTimeout(forceReady);
      subscription.unsubscribe();
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
    const prof = profRes?.data ?? null;

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
      setOrganization(orgRes?.data ?? null);
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
