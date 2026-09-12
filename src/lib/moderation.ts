import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Inhaltsprüfung für Texte — Port von occuroapp/src/lib/contentModeration.ts
 * und remoteModeration.ts.
 *
 * Zwei Stufen wie in der App: erst die lokale Wortliste (sofort, ohne
 * Netz), dann die Edge Function `content-moderation`. Die Web-App hatte
 * bisher keine von beiden — Namen und Beschreibungen, die die App ablehnt,
 * gingen hier durch.
 */

/**
 * Begriffsliste und Erkennung — Spiegel von
 * occuroapp/supabase/functions/_shared/moderation.ts. Der Server prueft
 * dasselbe noch einmal (und ist die eigentliche Absicherung, weil ein Client
 * sich umgehen laesst); hier geht es um die sofortige Rueckmeldung.
 */
const BLOCKED_TERMS = [
  // Sexuelles / Erwachsenenangebote
  'porn', 'porno', 'pornos', 'pornhub', 'onlyfans', 'sexcam', 'camgirl',
  'callgirl', 'sexdate', 'escort service', 'escortservice', 'bordell',
  'blowjob', 'titten', 'muschi', 'nudes', 'ficken', 'fick', 'fickt', 'gefickt',
  'wichsen', 'wichser',
  // Beleidigungen
  'fotze', 'fotzen', 'schlampe', 'schlampen', 'nutte', 'nutten', 'hure', 'huren',
  'hurensohn', 'hurensoehne', 'arschloch', 'arschloecher', 'missgeburt',
  'spasti', 'drecksau', 'fuck', 'fucking', 'fucker', 'motherfucker', 'bitch',
  'whore', 'slut', 'asshole', 'cunt',
  // Rassismus, Hass, Extremismus
  'heil hitler', 'sieg heil', 'hakenkreuz', 'nsdap', 'judensau', 'untermensch',
  'rassenschande', 'whitepower', 'white power', 'neger', 'nigger', 'nigga',
  'kanake', 'kanaken', 'faggot', 'auslaender raus', 'auslander raus',
];

const LEET: Record<string, string> = {
  a: 'a4@àáâäåа',
  b: 'b8',
  c: 'cç(',
  e: 'e3€éèêë',
  g: 'g9',
  i: 'i1íìîï',
  l: 'l1',
  n: 'nñ',
  o: 'o0öøóòô',
  s: 's5$š',
  t: 't7',
  u: 'uüúùû',
  z: 'z2',
};

const TRENNER = "[\\s._\\-*'\"`~,;:+|/\\\\]{0,2}";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Ein Muster je Begriff: Ersatzschreibweisen ('p0rno', 'b1tch') und bis zu
 * zwei Trennzeichen zwischen den Buchstaben ('f.u.c.k') fallen mit auf,
 * Wortgrenzen schuetzen 'Analyse', 'Marsch' und 'Hurlach'.
 */
function baueMuster(term: string): RegExp {
  const teile = [...term].map((zeichen) => {
    if (zeichen === ' ') return '\\s+';
    const klasse = LEET[zeichen];
    return klasse ? `[${escapeRegex(klasse)}]` : escapeRegex(zeichen);
  });
  return new RegExp(`(?<![\\p{L}\\p{N}])${teile.join(TRENNER)}(?![\\p{L}\\p{N}])`, 'iu');
}

const umschrift = (value: string) =>
  value.replace(/ä/gi, 'ae').replace(/ö/gi, 'oe').replace(/ü/gi, 'ue').replace(/ß/g, 'ss');

export const MODERATION_BLOCKED_TEXT =
  'Dieser Inhalt verstößt gegen unsere Richtlinien. Bitte ändere Name/Beschreibung und versuche es erneut.';
export const MODERATION_UNAVAILABLE =
  'Die Inhaltsprüfung ist aktuell nicht erreichbar. Bitte versuche es in wenigen Minuten erneut.';

const MUSTER = BLOCKED_TERMS.map((term) => baueMuster(term));

export const containsBlockedContent = (value?: string | null) => {
  const raw = value?.trim();
  if (!raw) return false;
  const varianten = [raw, umschrift(raw)];
  return MUSTER.some((regex) => varianten.some((text) => regex.test(text)));
};

export const assertNoBlockedContent = (values: Array<string | null | undefined>) => {
  if (values.some((value) => containsBlockedContent(value))) {
    throw new Error(MODERATION_BLOCKED_TEXT);
  }
};

/**
 * Serverseitige Prüfung. Scheitert der Dienst, bricht die Aktion ab — außer
 * bei der Registrierung, wo es noch keine Sitzung gibt (wie in der App).
 */
export async function enforceRemoteTextModeration(
  supabase: SupabaseClient,
  values: Array<string | null | undefined>,
  context = 'general',
) {
  const texts = values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((value) => (value.length > 3000 ? value.slice(0, 3000) : value));
  if (texts.length === 0) return;

  const failOpen = context === 'sign_up';
  const { data, error } = await supabase.functions.invoke('content-moderation', {
    body: { texts, context },
  });
  if (error) {
    if (!failOpen) throw new Error(MODERATION_UNAVAILABLE);
    return;
  }

  const payload = (data ?? {}) as { ok?: boolean; blocked?: boolean; providerConfigured?: boolean; error?: string };
  if (payload.ok === false) {
    if (!failOpen) throw new Error(payload.error?.trim() || MODERATION_UNAVAILABLE);
    return;
  }
  if (payload.blocked) throw new Error(MODERATION_BLOCKED_TEXT);
  if (payload.providerConfigured === false && !failOpen) throw new Error(MODERATION_UNAVAILABLE);
}

/** Moderationsfehler aus Datenbank-Triggern in die bekannte Meldung übersetzen. */
export const mapModerationError = (error: unknown): Error => {
  const value = (error ?? {}) as { message?: string; details?: string; hint?: string };
  const text = [value.message, value.details, value.hint].filter(Boolean).join(' ').toLowerCase();
  if (
    text.includes('content moderation') ||
    text.includes('moderation blocked') ||
    text.includes('blocked term') ||
    text.includes('offensive content')
  ) {
    return new Error(MODERATION_BLOCKED_TEXT);
  }
  if (error instanceof Error) return error;
  return new Error(value.message?.trim() || 'Unbekannter Fehler');
};
