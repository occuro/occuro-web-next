'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EventForm } from '@/components/events/event-form';

export default function OrganizerCreateEventPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <Link
          href="/organizer"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-fg hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft size={13} /> Zurück zur Übersicht
        </Link>
        <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
          Event erstellen
        </h1>
        <p className="text-sm text-muted-fg mt-1">
          Lege ein neues öffentliches Event an.
        </p>
      </div>

      {/* Info hint */}
      <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] px-4 py-3.5">
        <p className="text-[12px] text-violet-200/90 leading-relaxed">
          <strong className="font-semibold text-violet-300">Wie funktioniert das?</strong>{' '}
          Als verifizierter Veranstalter erstellst du immer öffentliche Events — sie
          erscheinen in der Entdecken-Seite und auf der Karte für alle Nutzer in der Nähe.
          Deine Follower bekommen automatisch eine Benachrichtigung. Im Event-Chat kannst
          du Ankündigungen an alle Teilnehmer senden.
        </p>
      </div>

      <EventForm mode="organizer" redirectAfterSave="/organizer" />
    </div>
  );
}
