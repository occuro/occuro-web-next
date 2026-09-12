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

const BLOCKED_TERMS = [
  'porn', 'porno', 'xxx', 'onlyfans', 'sexcam', 'escort',
  'nazi', 'hitler', 'whitepower', 'terrorist',
  'ficken', 'fotze', 'schlampe', 'nutte', 'hure',
  'fuck', 'fucking', 'bitch', 'whore', 'slut', 'asshole',
];

export const MODERATION_BLOCKED_TEXT =
  'Dieser Inhalt verstößt gegen unsere Richtlinien. Bitte ändere Name/Beschreibung und versuche es erneut.';
export const MODERATION_UNAVAILABLE =
  'Die Inhaltsprüfung ist aktuell nicht erreichbar. Bitte versuche es in wenigen Minuten erneut.';

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');

const NORMALIZED_TERMS = BLOCKED_TERMS.map(normalize).filter(Boolean);

// Ortsnamen wie "Pörndorf" oder "Hurlach" dürfen nicht anschlagen.
const PLACE_SUFFIXES = ['dorf', 'burg', 'berg', 'heim', 'stadt', 'feld', 'ing', 'ach', 'au', 'eck', 'wald', 'hausen', 'kirchen', 'hofen'];

const matchesAsWord = (text: string, term: string) => {
  const idx = text.indexOf(term);
  if (idx === -1) return false;
  const before = idx > 0 ? text[idx - 1] : ' ';
  const after = idx + term.length < text.length ? text[idx + term.length] : ' ';
  const boundaryBefore = !/[a-z0-9]/.test(before);
  const boundaryAfter = !/[a-z0-9]/.test(after);
  if (!boundaryBefore && !boundaryAfter) return false;
  const afterWord = text.slice(idx + term.length).match(/^[a-z]+/)?.[0] ?? '';
  if (afterWord && PLACE_SUFFIXES.some((s) => afterWord.startsWith(s))) return false;
  return true;
};

export const containsBlockedContent = (value?: string | null) => {
  const raw = value?.trim();
  if (!raw) return false;
  const lowered = raw.toLowerCase();
  if (BLOCKED_TERMS.some((term) => matchesAsWord(lowered, term))) return true;
  const normalized = normalize(raw);
  if (!normalized) return false;
  return NORMALIZED_TERMS.some((term) => matchesAsWord(normalized, term));
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
