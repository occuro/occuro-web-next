'use client';

import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { EventForm } from '@/components/events/event-form';

export default function CreatePrivateEventPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <Link
          href="/app"
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-fg hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft size={13} /> Zurück
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-heading font-bold tracking-tight">
            Privates Event erstellen
          </h1>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xl text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <Lock size={9} /> Privat
          </span>
        </div>
        <p className="text-sm text-muted-fg mt-1">
          Erstelle ein Event für deine Freunde — nur eingeladene Personen sehen es.
        </p>
      </div>

      {/* Info hint */}
      <div className="rounded-2xl border border-border-subtle bg-elevated px-4 py-3.5">
        <p className="text-[12px] text-secondary-fg leading-relaxed">
          <strong className="font-semibold text-foreground">Wie funktioniert das?</strong>{' '}
          Private Events sind nur für eingeladene Personen sichtbar. Du kannst Freunde
          schon beim Erstellen einladen und auch jederzeit danach noch weitere hinzufügen
          und mit allen im Event-Chat schreiben. Öffentliche Events können nur
          verifizierte Veranstalter erstellen.
        </p>
      </div>

      <EventForm mode="individual" />
    </div>
  );
}
