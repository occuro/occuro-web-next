'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';
import { ONBOARDING_PATH, TWO_FACTOR_PATH, brauchtEinrichtung, brauchtZweitenFaktor } from '@/lib/onboarding';

/**
 * Zugang zu /app und /organizer — die Layouts riefen das bisher jeweils
 * selbst ab und prüften nur „angemeldet?". Jetzt dieselbe Reihenfolge wie
 * in der App: nicht angemeldet → Login, offener zweiter Faktor → 2FA,
 * Einrichtung offen → Einrichtung.
 */
export function useAuthGate({ nurVeranstalter = false }: { nurVeranstalter?: boolean } = {}) {
  const { user, profile, userType, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    if (brauchtEinrichtung(profile)) {
      router.replace(ONBOARDING_PATH);
      return;
    }
    if (nurVeranstalter && userType && userType !== 'organization') router.replace('/app');
  }, [loading, user, profile, userType, nurVeranstalter, router]);

  // Auch hier und nicht nur beim Login: Sonst genügte ein Neuladen oder ein
  // direkt aufgerufener Link, um die 2FA-Abfrage zu umgehen.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let aktiv = true;
    void brauchtZweitenFaktor(createClient()).then((offen) => {
      if (aktiv && offen) router.replace(TWO_FACTOR_PATH);
    });
    return () => {
      aktiv = false;
    };
  }, [userId, router]);
}
