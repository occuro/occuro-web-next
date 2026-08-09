'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Landeseite für Bestätigungslinks, die keine Browser-Session herstellen können:
// entweder weil die Registrierung in der Mobile-App begonnen hat (der
// PKCE-Verifier liegt dann im App-Speicher, nicht im Browser), oder weil
// Supabase das Ergebnis nur als URL-Fragment liefert. Die E-Mail-Bestätigung
// selbst ist zu diesem Zeitpunkt bereits passiert — sie wird eine Station
// vorher in Supabases /auth/v1/verify eingelöst.
//
// Fragmente (#error=…) erreichen den Server nie, deshalb wird hier im Client
// ausgewertet. Ein Fragment überlebt den Redirect von /auth/callback hierher,
// weil das Redirect-Ziel selbst keins mitbringt.

const ERROR_TEXTS: Record<string, string> = {
  otp_expired:
    'Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet. Fordere eine neue Bestätigungsmail an.',
  access_denied: 'Der Bestätigungslink ist ungültig. Fordere eine neue Bestätigungsmail an.',
  email_change_token_invalid:
    'Der Link zum Ändern der E-Mail-Adresse ist ungültig oder abgelaufen.',
};

type Status = { kind: 'pending' } | { kind: 'ok' } | { kind: 'error'; message: string };

export default function ConfirmedPage() {
  const [status, setStatus] = useState<Status>({ kind: 'pending' });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const code = query.get('error_code') ?? hash.get('error_code');
    const description = query.get('error_description') ?? hash.get('error_description');
    const error = query.get('error') ?? hash.get('error');

    if (code || description || error) {
      setStatus({
        kind: 'error',
        message:
          (code && ERROR_TEXTS[code]) ||
          description ||
          'Die Bestätigung konnte nicht abgeschlossen werden. Bitte versuche es erneut.',
      });
    } else {
      setStatus({ kind: 'ok' });
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
          {isError ? 'Bestätigung fehlgeschlagen' : 'E-Mail bestätigt!'}
        </h1>

        <p className="text-muted-fg">
          {isError
            ? status.message
            : 'Deine Registrierung ist abgeschlossen. Du kannst dich jetzt anmelden.'}
        </p>

        <Link
          href="/auth/login"
          className="inline-block w-full py-3.5 rounded-2xl text-base font-semibold bg-primary-bg text-primary-text hover:opacity-90 transition"
        >
          Zur Anmeldung
        </Link>
      </div>
    </div>
  );
}
