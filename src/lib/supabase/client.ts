'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// Singleton — we want exactly ONE browser client across the whole app so
// the auth state listener and the cookie storage stay in sync. Without
// this, every component that calls createClient() gets its own instance,
// which means onAuthStateChange listeners fire on the wrong instance and
// the session can desync between tabs/components.
let cachedClient: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cachedClient;
}
