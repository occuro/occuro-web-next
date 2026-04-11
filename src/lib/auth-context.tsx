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
    // Try a full signOut first (invalidates the session server-side too).
    // If the local session is already broken (which is what causes the
    // "kann mich nicht ausloggen" bug), the call throws — fall back to a
    // local-scope signOut so we at least clear the browser state.
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[auth] global signOut failed, falling back to local scope', e);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (innerErr) {
        console.error('[auth] local signOut also failed', innerErr);
      }
    }
    // Safety net: purge any leftover supabase tokens (cookies + localStorage).
    // This guarantees the user is fully logged out even if the SDK calls
    // above silently no-op'd because of stale state.
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-')) localStorage.removeItem(k);
      });
      document.cookie.split(';').forEach((c) => {
        const name = c.trim().split('=')[0];
        if (name.startsWith('sb-')) {
          // Clear on root and on all higher-level paths just in case
          document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        }
      });
    } catch {}
    setUser(null);
    setProfile(null);
    setOrganization(null);
    // Hard reload — guarantees every cached client/store is reset and the
    // user lands on the public landing page in a clean state.
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
