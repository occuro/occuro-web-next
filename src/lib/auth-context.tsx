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
    // Drop any stored prefs from older schema versions before we read
    // anything else — guarantees no stale localStorage shape can crash
    // a downstream component this session.
    purgeOldSchemas();

    // Immediately set loading false after a short delay no matter what
    const forceReady = setTimeout(() => setLoading(false), 1500);

    // Use getUser() for the initial check rather than getSession() so we
    // detect a stale/expired session immediately. getSession() reads
    // straight from the cookie without server validation, so a broken
    // session would look "logged in" until the first failing API call —
    // which is exactly the bug where the user couldn't log out.
    // The proxy.ts middleware refreshes cookies on every navigation, so
    // by the time we get here the cookies should be valid; if getUser()
    // still rejects, the session truly is dead and we treat it as logged out.
    supabase.auth.getUser().then(({ data: { user: verifiedUser }, error }) => {
      if (error || !verifiedUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      setUser(verifiedUser);
      fetchProfile(verifiedUser.id).finally(() => setLoading(false));
    }).catch(() => {
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
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

    return () => {
      clearTimeout(forceReady);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchProfile(userId: string) {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      setProfile(prof);

      if (prof?.user_type === 'organization') {
        const { data: org } = await supabase
          .from('organizations')
          .select('*')
          .eq('owner_id', userId)
          .single();
        setOrganization(org);
      }
    } catch {
      // Profile fetch failed — user exists but profile might not
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
