/**
 * Eingaberegeln für Registrierung und neues Passwort — dieselben wie in
 * occuroapp/src/screens/LoginPage.tsx. Supabase selbst verlangt nur 6
 * Zeichen; die strengere Regel gilt in beiden Apps clientseitig.
 */

export const TERMS_URL = 'https://www.occuroapp.com/impressum';
export const PRIVACY_URL = 'https://www.occuroapp.com/datenschutz';

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());

export const PASSWORD_RULES: ReadonlyArray<{ label: string; test: (value: string) => boolean }> = [
  { label: 'Mindestens 8 Zeichen', test: (v) => v.length >= 8 },
  { label: 'Mindestens ein Buchstabe', test: (v) => /[A-Za-z]/.test(v) },
  { label: 'Mindestens eine Zahl', test: (v) => /\d/.test(v) },
  { label: 'Mindestens ein Sonderzeichen', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const isStrongPassword = (value: string) => PASSWORD_RULES.every((rule) => rule.test(value));

export const PASSWORD_TOO_WEAK =
  'Passwort zu schwach. Nutze mindestens 8 Zeichen inkl. Buchstabe, Zahl und Sonderzeichen.';
