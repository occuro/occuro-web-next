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
          Lege ein neues Event an — öffentlich oder privat.
        </p>
      </div>

      <EventForm mode="organizer" redirectAfterSave="/organizer" />
    </div>
  );
}
