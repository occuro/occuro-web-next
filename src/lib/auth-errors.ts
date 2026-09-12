/**
 * Supabase-Auth-Fehler → deutsche Meldung.
 *
 * Portiert aus occuroapp/src/lib/authErrorMapping.ts, damit Web und App
 * dieselben Sätze zeigen. Vorher reichten Login und Registrierung hier den
 * englischen Servertext unverändert durch — gemeldet wurde genau das:
 * "Error sending confirmation email" mitten in der deutschen Oberfläche.
 */

export type AuthErrorContext = 'sign_in' | 'sign_up' | 'generic';

const rohText = (error: unknown): string => {
  if (error instanceof Error) return error.message?.trim() ?? '';
  if (typeof error === 'string') return error.trim();
  if (error && typeof error === 'object') {
    const value = error as { message?: string | null };
    return value.message?.trim() ?? '';
  }
  return '';
};

/** Wartezeit aus Texten wie "you can only request this after 42 seconds". */
export const wartezeitAusFehler = (error: unknown): number | null => {
  const lower = rohText(error).toLowerCase();
  const sekunden = lower.match(/(\d+)\s*(seconds?|sekunden?|secs?|s)\b/);
  if (sekunden) {
    const n = Number(sekunden[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const minuten = lower.match(/(\d+)\s*(minutes?|minuten?|mins?|m)\b/);
  if (minuten) {
    const n = Number(minuten[1]);
    if (Number.isFinite(n) && n > 0) return n * 60;
  }
  return null;
};

export const istRateLimit = (error: unknown): boolean => {
  const lower = rohText(error).toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('over_email_send_rate_limit') ||
    lower.includes('over_request_rate_limit') ||
    lower.includes('too many') ||
    lower.includes('for security purposes')
  );
};

export const istUnbestaetigt = (error: unknown): boolean =>
  rohText(error).toLowerCase().includes('email not confirmed');

export function authFehlerText(error: unknown, context: AuthErrorContext = 'generic'): string {
  const raw = rohText(error);
  const lower = raw.toLowerCase();

  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'Diese E-Mail ist bereits registriert. Bitte melde dich an.';
  }
  if (lower.includes('signup is disabled') || lower.includes('signups not allowed')) {
    return 'Registrierung ist aktuell deaktiviert. Bitte versuche es später erneut.';
  }
  if (lower.includes('database error saving new user') || lower.includes('failed to create user')) {
    return 'Registrierung aktuell nicht möglich. Bitte versuche es in 1–2 Minuten erneut.';
  }
  if (istRateLimit(error)) {
    return `Zu viele Versuche. Bitte warte ${wartezeitAusFehler(error) ?? 60} s und versuche es erneut.`;
  }
  // SMTP-Versand gescheitert — NICHT das Mengenlimit, das fängt der Zweig
  // darüber. Am 11.09.2026 lag es an einem ungültigen Resend-Key in den
  // SMTP-Einstellungen von Supabase (Auth-Log: 535 "Authentication
  // credentials invalid"). Nur bei der Registrierung, sonst würde jeder
  // Serverfehler beim Anmelden zur Mailmeldung.
  if (context === 'sign_up' && lower.includes('error sending') && lower.includes('email')) {
    return 'Die Bestätigungsmail konnte gerade nicht verschickt werden. Bitte versuche es in ein paar Minuten noch einmal.';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid credentials')) {
    return 'E-Mail, Benutzername oder Passwort ist falsch.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Bitte bestätige zuerst deine E-Mail.';
  }
  if (
    lower.includes('invalid email') ||
    lower.includes('email address is invalid') ||
    lower.includes('unable to validate email')
  ) {
    return 'Bitte gib eine gültige E-Mail-Adresse ein.';
  }
  if (lower.includes('password') && (lower.includes('at least') || lower.includes('weak') || lower.includes('should contain'))) {
    return 'Passwort zu schwach. Nutze mindestens 8 Zeichen inkl. Buchstabe, Zahl und Sonderzeichen.';
  }
  if (lower.includes('captcha')) {
    return 'Sicherheitsprüfung fehlgeschlagen. Bitte versuche es erneut.';
  }
  if (lower === 'aborted' || (error as { name?: string } | null)?.name === 'AbortError' || lower.includes('timed out')) {
    return 'Der Server hat zu lange nicht geantwortet. Bitte versuche es noch einmal.';
  }
  if (lower.includes('failed to fetch') || lower.includes('fetch failed') || lower.includes('load failed') || lower.includes('networkerror')) {
    return 'Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.';
  }

  // Unbekannter Text: nicht roh zeigen (meist Englisch, oft technisch), aber
  // für die Fehlersuche in der Konsole lassen.
  if (raw) console.warn('[auth] unübersetzter Fehler:', raw);
  if (context === 'sign_up') return 'Registrierung fehlgeschlagen. Bitte versuche es erneut.';
  if (context === 'sign_in') return 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';
  return 'Aktion fehlgeschlagen. Bitte versuche es erneut.';
}
