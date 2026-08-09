'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Landeseite für alle Bestätigungslinks, die keine Browser-Session herstellen
// können: entweder weil der Vorgang in der Mobile-App begonnen hat (der
// PKCE-Verifier liegt dann im App-Speicher, nicht im Browser), oder weil
// Supabase das Ergebnis nur als URL-Fragment liefert. Die Bestätigung selbst
// ist zu diesem Zeitpunkt bereits passiert — sie wird eine Station vorher in
// Supabases /auth/v1/verify eingelöst.
//
// Fragmente (#error=…) erreichen den Server nie, deshalb wird hier im Client
// ausgewertet. Ein beforeFiles-Rewrite in next.config.ts rendert diese Seite
// direkt unter /auth/callback, damit zwischen Supabase und dieser Auswertung
// kein Redirect liegt, der das Fragment verlieren könnte.

const FLOWS = ['signup', 'email_change', 'recovery', 'magiclink', 'invite'] as const;
type Flow = (typeof FLOWS)[number];

const isFlow = (v: string | null): v is Flow => !!v && (FLOWS as readonly string[]).includes(v);

const SUCCESS: Record<Flow, { title: string; body: string; cta: string; href: string }> = {
  signup: {
    title: 'E-Mail bestätigt!',
    body: 'Deine Registrierung ist abgeschlossen. Du kannst dich jetzt anmelden.',
    cta: 'Zur Anmeldung',
    href: '/auth/login',
  },
  email_change: {
    // Supabase verlangt bei aktiviertem "Secure email change" eine Bestätigung
    // von der alten UND der neuen Adresse. Nach dem ersten Klick ist der
    // Wechsel also noch nicht zwangsläufig durch — das darf die Seite nicht
    // verschweigen, sonst wundert sich der User über die zweite Mail.
    title: 'E-Mail-Adresse bestätigt',
    body: 'Falls du zwei Bestätigungsmails bekommen hast, öffne auch den Link in der zweiten — der Wechsel wird erst dann wirksam.',
    cta: 'Zu OutNow',
    href: '/app',
  },
  recovery: {
    // Der Reset läuft in der App über einen eingetippten Code, nicht über
    // diesen Link. Wer trotzdem hier landet, braucht den Hinweis darauf.
    title: 'Link bestätigt',
    body: 'Den Code zum Zurücksetzen deines Passworts findest du in derselben E-Mail. Gib ihn in der App ein, um ein neues Passwort zu setzen.',
    cta: 'Zur Anmeldung',
    href: '/auth/login',
  },
  magiclink: {
    title: 'Anmeldelink bestätigt',
    body: 'Du kannst dich jetzt anmelden.',
    cta: 'Zur Anmeldung',
    href: '/auth/login',
  },
  invite: {
    title: 'Einladung bestätigt',
    body: 'Deine Einladung wurde angenommen. Du kannst dich jetzt anmelden.',
    cta: 'Zur Anmeldung',
    href: '/auth/login',
  },
};

// Supabase liefert bekannte Fehler als error_code; alles andere fällt auf die
// mitgelieferte englische Beschreibung zurück.
const ERROR_TEXTS: Record<string, string> = {
  otp_expired:
    'Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet. Fordere eine neue Bestätigungsmail an.',
  access_denied: 'Der Bestätigungslink ist ungültig. Fordere eine neue Bestätigungsmail an.',
  email_change_token_invalid:
    'Der Link zum Ändern der E-Mail-Adresse ist ungültig oder abgelaufen.',
};

// Für abgelaufene Links ist der generische Text zu registrierungslastig — wer
// seine Adresse wechseln wollte, fordert keine "Bestätigungsmail" an.
const EXPIRED_BY_FLOW: Partial<Record<Flow, string>> = {
  email_change:
    'Der Link zum Ändern der E-Mail-Adresse ist abgelaufen oder wurde bereits verwendet. Starte den Wechsel in den Einstellungen erneut.',
  recovery:
    'Der Link ist abgelaufen oder wurde bereits verwendet. Fordere in der App einen neuen Code zum Zurücksetzen an.',
};

type Status =
  | { kind: 'pending' }
  | { kind: 'ok'; flow: Flow }
  | { kind: 'error'; message: string };

export default function ConfirmedPage() {
  const [status, setStatus] = useState<Status>({ kind: 'pending' });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const code = query.get('error_code') ?? hash.get('error_code');
    const description = query.get('error_description') ?? hash.get('error_description');
    const error = query.get('error') ?? hash.get('error');

    // `type` setzt Supabase selbst bei erfolgreichen Links, `flow` hängen wir
    // dort an, wo wir das redirectTo kontrollieren — im Fehlerfall liefert
    // Supabase kein `type`, dann ist unser eigener Hinweis die einzige Quelle.
    const fromSupabase = hash.get('type') ?? query.get('type');
    const fromUs = query.get('flow');
    const flow: Flow = isFlow(fromSupabase) ? fromSupabase : isFlow(fromUs) ? fromUs : 'signup';

    if (code || description || error) {
      setStatus({
        kind: 'error',
        message:
          (code === 'otp_expired' && EXPIRED_BY_FLOW[flow]) ||
          (code && ERROR_TEXTS[code]) ||
          description ||
          'Die Bestätigung konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
      });
    } else {
      setStatus({ kind: 'ok', flow });
    }
  }, []);

  if (status.kind === 'pending') {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-muted-fg">Einen Moment …</p>
      </div>
    );
  }

  const isError = status.kind === 'error';
  const success = status.kind === 'ok' ? SUCCESS[status.flow] : null;

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center space-y-5">
        <div
          className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-2xl ${
            isError ? 'bg-destructive/10 text-destructive' : 'bg-live/10 text-live'
          }`}
          aria-hidden="true"
        >
          {isError ? '✕' : '✓'}
        </div>

        <h1 className="text-2xl font-heading font-bold">
          {isError ? 'Bestätigung fehlgeschlagen' : success!.title}
        </h1>

        <p className="text-muted-fg">{isError ? status.message : success!.body}</p>

        <Link
          href={isError ? '/auth/login' : success!.href}
          className="inline-block w-full py-3.5 rounded-2xl text-base font-semibold bg-primary-bg text-primary-text hover:opacity-90 transition"
        >
          {isError ? 'Zur Anmeldung' : success!.cta}
        </Link>
      </div>
    </div>
  );
}
