import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { eventImageUrl } from '@/lib/eventImages';
import EinladungAnsicht from './EinladungAnsicht';

/**
 * Linkvorschau für einen Einladungslink zu einem PRIVATEN Event.
 *
 * Dieselbe Sache wie bei /event/[id] (die Begründung steht dort ausführlich):
 * Der geteilte Link ging nackt raus, WhatsApp fand nichts und zeigte eine
 * graue Zeile mit einer URL.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * VERRÄT DIE VORSCHAU ETWAS, DAS SIE NICHT DARF?
 * ═══════════════════════════════════════════════════════════════════════
 * Diese Frage muss man bei einem privaten Event stellen — die Antwort ist
 * nein, und zwar aus einem strukturellen Grund: Das Token IST der Schlüssel.
 * Wer den Link hat, sieht beim Öffnen ohnehin Titel, Termin, Ort und Banner;
 * genau dafür ist er gedacht. Die Vorschau zeigt nichts anderes und nichts
 * mehr. Sie wird zudem von den Servern des Messengers geholt, also von
 * derselben Stelle, an die der Absender den Link bewusst geschickt hat.
 *
 * Bewusst NICHT in die Vorschau kommt die Beschreibung des Events — sie ist
 * der Teil, in dem Veranstalter erfahrungsgemäss Adressdetails, Türcodes und
 * Absprachen unterbringen. Termin und Ort genügen, um zu erkennen, worum es
 * geht. Genau dieselbe Zeile wie bei einem öffentlichen Event.
 *
 * `resolve_invite_token` ist für anon freigegeben (Migration
 * 20260906200000) — die Vorschau braucht keine Sitzung und bekommt auch
 * keine (persistSession: false).
 */

const SITE_URL = 'https://app.occuroapp.com';

/**
 * Auch der Rueckfall traegt noindex. Ein Einladungslink gehoert NIE in eine
 * Suchmaschine — sonst waere das Token ueber eine Suche auffindbar, und damit
 * der Zugang zum Event. Das gilt unabhaengig davon, ob das Token gerade
 * aufloest: Ein abgelaufenes oder falsches Token liegt unter derselben
 * Adressform, und Suchmaschinen sollen die ganze Form meiden.
 */
const FALLBACK: Metadata = { robots: { index: false, follow: false } };

function datumsZeile(datum?: string | null, uhrzeit?: string | null): string | null {
  if (!datum) return null;
  const [j, m, t] = String(datum).split('-');
  if (!j || !m || !t) return null;
  const zeit = uhrzeit ? `, ${String(uhrzeit).slice(0, 5)} Uhr` : '';
  return `${t}.${m}.${j}${zeit}`;
}

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !token) return FALLBACK;

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase.rpc('resolve_invite_token', { p_token: token });
    const event = Array.isArray(data) ? data[0] : data;
    if (!event?.title) return FALLBACK;

    const beschreibung = [datumsZeile(event.date, event.time), event.location]
      .filter(Boolean)
      .join(' · ') || undefined;
    const bild = eventImageUrl(event);
    const seite = `${SITE_URL}/invite/${encodeURIComponent(token)}`;

    return {
      title: event.title,
      description: beschreibung,
      openGraph: {
        type: 'website',
        url: seite,
        title: event.title,
        description: beschreibung,
        images: bild ? [{ url: bild, alt: event.title }] : undefined,
      },
      twitter: {
        card: bild ? 'summary_large_image' : 'summary',
        title: event.title,
        description: beschreibung,
        images: bild ? [bild] : undefined,
      },
      // Ein Einladungslink gehoert NICHT in Suchmaschinen. Das Token waere
      // sonst ueber eine Suche auffindbar, und damit der Zugang zum Event.
      robots: { index: false, follow: false },
    };
  } catch {
    return FALLBACK;
  }
}

export default async function InvitePage(
  { params }: { params: Promise<{ token: string }> },
) {
  return <EinladungAnsicht params={params} />;
}
