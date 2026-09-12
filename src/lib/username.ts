/**
 * Benutzernamen-Regeln — identisch zu occuroapp/src/lib/username.ts.
 *
 * 3–30 Zeichen, Kleinbuchstaben, Zahlen, Punkt und Unterstrich. Der Punkt
 * nur in der Mitte und nie doppelt; der Unterstrich überall. Die Länge wird
 * getrennt vom Muster geprüft, damit Hinweistext und Prüfung nicht
 * auseinanderlaufen. Beide Apps müssen dieselbe Regel haben, sonst lehnt die
 * eine ab, was die andere angelegt hat.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

const USERNAME_PATTERN = /^[a-z0-9_](?:[a-z0-9_]|\.(?!\.))*[a-z0-9_]$/;

export const USERNAME_HINT = '3–30 Zeichen · Kleinbuchstaben, Zahlen, Punkt oder Unterstrich';
export const USERNAME_INVALID = 'Ungültiger Benutzername. Erlaubt sind 3–30 Zeichen: a–z, 0–9, . und _';
export const USERNAME_TAKEN = 'Dieser Benutzername ist bereits vergeben.';
export const USERNAME_REQUIRED = 'Bitte wähle einen Benutzernamen.';

export const normalizeUsernameInput = (value?: string | null) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '');

export const isValidUsername = (value?: string | null) => {
  const name = normalizeUsernameInput(value);
  if (name.length < USERNAME_MIN_LENGTH || name.length > USERNAME_MAX_LENGTH) return false;
  return USERNAME_PATTERN.test(name);
};

/** Postgres 23505 auf dem Benutzernamen-Index. */
export const isUsernameUniqueViolation = (error: unknown) => {
  const value = (error ?? {}) as { code?: string; message?: string; details?: string };
  const text = `${value.message ?? ''} ${value.details ?? ''}`.toLowerCase();
  return value.code === '23505' && text.includes('username');
};
