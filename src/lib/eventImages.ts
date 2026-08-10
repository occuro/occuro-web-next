/**
 * Welches Bild ein Event zeigt — dieselbe Regel wie in der Mobile-App, damit
 * dasselbe Event in App und Browser gleich aussieht.
 *
 * ES GIBT KEINE ERSATZBILDER. Zeigt ein Event ein Bild, dann hat der
 * Veranstalter es selbst hochgeladen. Sonst zeigt es keins.
 *
 * Begruendung und die beiden verworfenen Ansaetze (Stimmungsbilder je
 * Kategorie, echte Fotos je Veranstaltung): occuroapp/src/lib/eventImages.ts
 */

type EventLike = {
  id?: string | null;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  banner_url?: string | null;
  image_url?: string | null;
};

/** Eigenes Banner, ersatzweise eigenes Bild, sonst keins. */
export function eventImageUrl(event: EventLike): string | null {
  return event.banner_url ?? event.image_url ?? null;
}
