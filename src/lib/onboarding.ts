import type { SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '@/types/occuro';

/**
 * Einrichtung nach der Registrierung — dieselbe Weiche wie in der App
 * (occuroapp/app/index.tsx): ohne Kontotyp erst die Typwahl, danach die
 * Profil-Einrichtung, erst dann die eigentliche App.
 *
 * Die Web-App kannte keins von beidem. Kontotyp und Name standen im
 * Registrierungsformular, der Datenbank-Trigger übernimmt aber nur
 * full_name und username — der Kontotyp aus dem Formular ging verloren, und
 * wer sich hier als Veranstalter registrierte, wurde nie einer. Konten über
 * Google hatten gar keinen Benutzernamen.
 */
export const ONBOARDING_PATH = '/auth/onboarding';

type ProfilAusschnitt = Pick<
  Profile,
  'full_name' | 'username' | 'avatar_url' | 'bio' | 'location' | 'interests' | 'event_types'
>;

/**
 * Gilt ein Profil als eingerichtet? Wörtlich die Regel aus der App
 * (istProfilEingerichtet): Der Benutzername ist das verlässlichste
 * Kennzeichen, aber Bestandskonten ohne ihn, die sonst schon Spuren einer
 * Einrichtung tragen, dürfen nicht zurück in die Einrichtung — die startet
 * mit leeren Feldern und würde ihr Profil überschreiben.
 */
export function istProfilEingerichtet(profil: ProfilAusschnitt): boolean {
  if (!profil.full_name || !profil.full_name.trim()) return false;
  if (profil.username && profil.username.trim()) return true;
  return Boolean(
    (profil.avatar_url && profil.avatar_url.trim()) ||
      (profil.bio && profil.bio.trim()) ||
      (profil.location && profil.location.trim()) ||
      (profil.interests && profil.interests.length > 0) ||
      (profil.event_types && profil.event_types.length > 0),
  );
}

export function brauchtEinrichtung(profil: Profile | null | undefined): boolean {
  if (!profil) return false;
  return !profil.user_type || !istProfilEingerichtet(profil);
}

/** Wohin nach Anmeldung, Bestätigung oder Einrichtung. */
export function zielFuerProfil(profil: Profile | null | undefined): string {
  if (brauchtEinrichtung(profil)) return ONBOARDING_PATH;
  return profil?.user_type === 'organization' ? '/organizer' : '/app';
}

export const TWO_FACTOR_PATH = '/auth/2fa';

/** Hat das Konto einen zweiten Faktor, den diese Sitzung noch nicht erfüllt? */
export async function brauchtZweitenFaktor(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return Boolean(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2');
  } catch {
    return false;
  }
}

/**
 * Das komplette Ziel nach einer frischen Anmeldung: erst der zweite Faktor
 * (die App prüft das auch beim Start, damit ein Neuladen ihn nicht
 * überspringt), dann die Einrichtung, dann die App. Die Web-App fragte den
 * zweiten Faktor bisher gar nicht ab — Konten mit 2FA kamen hier mit dem
 * Passwort allein hinein.
 */
export async function zielNachAnmeldung(supabase: SupabaseClient, userId: string): Promise<string> {
  if (await brauchtZweitenFaktor(supabase)) return TWO_FACTOR_PATH;
  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    return zielFuerProfil((data ?? null) as Profile | null);
  } catch {
    return '/app';
  }
}

/** Nur relative Pfade dieser App — `?next=https://…` darf nicht umleiten. */
export const sichererPfad = (value: string | null | undefined): string | null =>
  value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : null;
