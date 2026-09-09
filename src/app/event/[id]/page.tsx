import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { eventImageUrl } from '@/lib/eventImages';
import EventAnsicht from './EventAnsicht';

/**
 * Die Vorschaukarte, die WhatsApp & Co. aus einem geteilten Eventlink bauen.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WARUM ES DIESE DATEI GIBT
 * ═══════════════════════════════════════════════════════════════════════
 * Gemeldet wurde: "Extern teilen mit dem Event-Banner möglich? Als Anzeige
 * dann in WhatsApp, dass die Person gleich sieht, welches Event es ist."
 *
 * Bisher ging der geteilte Link nackt raus. Weder /event/[id] noch
 * /invite/[token] hatte `generateMetadata` oder OpenGraph-Tags — WhatsApp,
 * Signal, iMessage und Telegram fanden also nichts Eventbezogenes und zeigten
 * bestenfalls den seitenweiten Standard aus dem Wurzel-Layout. Der Empfänger
 * sah eine graue Zeile mit einer URL und musste sie öffnen, um überhaupt zu
 * erfahren, worum es geht.
 *
 * KEIN BILDANHANG, SONDERN EINE LINKVORSCHAU. Der naheliegende Weg wäre,
 * das Banner als Datei mit ins Teilen-Blatt zu geben. Das wurde verworfen:
 * Aus einem Link würde dann ein Foto plus Text, die WhatsApp als zwei
 * getrennte Nachrichten verschickt; der Link verliert seine Vorschau, das
 * Bild seinen Bezug. Eine echte Linkvorschau ist das, was Messenger von sich
 * aus richtig machen — sie muss nur etwas zu holen finden.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WARUM DIE SEITE GETEILT WURDE
 * ═══════════════════════════════════════════════════════════════════════
 * `generateMetadata` läuft nur in einer Server-Komponente. Die bisherige
 * Seite war komplett `'use client'` (sie braucht Auth-Kontext und Router).
 * Sie liegt deshalb jetzt unverändert in EventAnsicht.tsx; diese Datei ist
 * die Server-Hülle davor und tut sonst nichts.
 *
 * EIGENER SUPABASE-CLIENT OHNE COOKIES: Die Vorschau wird von den Servern
 * der Messenger abgerufen, nicht vom Empfänger — es gibt dort keine Sitzung
 * und darf auch keine geben. `public_events_guest` ist genau dafür da: für
 * anon freigegeben und per Bauart nur Öffentliches. Dieselbe Quelle nutzt
 * EventAnsicht.tsx (siehe die Begründung dort).
 */

const SITE_URL = 'https://app.occuroapp.com';

/**
 * Ohne Event — gelöscht, privat oder falsche Kennung — bleibt es beim
 * seitenweiten Standard des Wurzel-Layouts. Eine erfundene Vorschau wäre
 * schlimmer als keine.
 */
const FALLBACK: Metadata = {};

function datumsZeile(datum?: string | null, uhrzeit?: string | null): string | null {
  if (!datum) return null;
  const [j, m, t] = String(datum).split('-');
  if (!j || !m || !t) return null;
  const zeit = uhrzeit ? `, ${String(uhrzeit).slice(0, 5)} Uhr` : '';
  return `${t}.${m}.${j}${zeit}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return FALLBACK;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase
      .from('public_events_guest')
      .select('title, date, time, location, banner_url, image_url')
      .eq('id', id)
      .maybeSingle();
    if (!data?.title) return FALLBACK;

    // Genau die Zeile, die auch die Karte zeigt: Termin und Ort, sonst nichts.
    const beschreibung = [datumsZeile(data.date, data.time), data.location]
      .filter(Boolean)
      .join(' · ') || undefined;
    const bild = eventImageUrl(data);
    const seite = `${SITE_URL}/event/${encodeURIComponent(id)}`;

    return {
      title: data.title,
      description: beschreibung,
      openGraph: {
        type: 'website',
        url: seite,
        title: data.title,
        description: beschreibung,
        // Grosse Karte statt kleinem Vorschaubild — das Banner IST die
        // Information, an der man das Event erkennt.
        images: bild ? [{ url: bild, alt: data.title }] : undefined,
      },
      twitter: {
        card: bild ? 'summary_large_image' : 'summary',
        title: data.title,
        description: beschreibung,
        images: bild ? [bild] : undefined,
      },
      alternates: { canonical: seite },
    };
  } catch {
    // Ist Supabase nicht erreichbar, darf die SEITE trotzdem laden.
    return FALLBACK;
  }
}

export default async function PublicEventPage(
  { params }: { params: Promise<{ id: string }> },
) {
  return <EventAnsicht params={params} />;
}
