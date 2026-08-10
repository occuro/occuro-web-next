/**
 * Die Kategorienachse — identisch zu occuroapp/src/i18n/taxonomy.ts.
 *
 * EINE ACHSE STATT DREI: Die Kategorie sagt, WAS ein Event ist, und ist
 * überschneidungsfrei. Die Unterkategorie verfeinert nur innerhalb der
 * Kategorie. Der frühere Event-Typ ist abgeschafft — er hat die Kategorie
 * dupliziert und war die Hauptquelle widersprüchlicher Daten.
 *
 * Vorher lagen die Kategorien in dieser App dreifach inline verstreut: im
 * Filter, im Event-Formular und in der Banner-Platzhalter-Logik. Alle drei
 * mit unterschiedlichen Listen. Hier ist jetzt die einzige Quelle.
 *
 * Die Werte müssen exakt zu denen der Mobile-App passen — sie stehen so in
 * der Datenbank (siehe Migration 20260810120000).
 */

export const TAXONOMY_CATEGORIES = [
  'Funfair',
  'Market',
  'Concert',
  'Festival',
  'Nightlife',
  'Stage',
  'Art',
  'Sports',
  'Food & Drink',
  'Community',
  'Education',
  'Outdoor',
] as const;

export type TaxonomyCategory = (typeof TAXONOMY_CATEGORIES)[number];

export const TAXONOMY_SUBCATEGORIES: Record<string, readonly string[]> = {
  Funfair: ['Volksfest', 'Dult', 'Kirchweih', 'Schützenfest', 'Erntedank', 'Messe'],
  Market: ['Christkindlmarkt', 'Flohmarkt', 'Handwerkermarkt', 'Wochenmarkt', 'Streetfood'],
  Concert: ['Rock', 'Pop', 'Metal', 'Jazz', 'Klassik', 'Schlager', 'Volksmusik', 'Hip Hop', 'Indie'],
  Festival: ['Musikfestival', 'Kulturfestival', 'Filmfestival'],
  Nightlife: ['Techno', 'House', 'Clubnacht', 'Tanzabend'],
  Stage: ['Theater', 'Kabarett', 'Comedy', 'Musical', 'Oper', 'Lesung'],
  Art: ['Ausstellung', 'Galerie', 'Museum', 'Vernissage'],
  Sports: ['Lauf', 'Turnier', 'Fußball', 'Radsport', 'Motorsport'],
  'Food & Drink': ['Weinfest', 'Bierfest', 'Kulinarik', 'Verkostung'],
  Community: ['Vereinsfest', 'Nachbarschaft', 'Kinderfest', 'Ehrenamt'],
  Education: ['Seminar', 'Workshop', 'Konferenz', 'Vortrag', 'Netzwerken'],
  Outdoor: ['Wanderung', 'Radtour', 'Camping', 'Picknick'],
};

/** Deutsche Beschriftung. Die Web-App ist einsprachig, deshalb ohne i18n. */
const LABELS: Record<string, string> = {
  Funfair: 'Volksfest & Brauchtum',
  Market: 'Markt',
  Concert: 'Konzert',
  Festival: 'Festival',
  Nightlife: 'Party & Club',
  Stage: 'Theater & Bühne',
  Art: 'Kunst & Ausstellung',
  Sports: 'Sport',
  'Food & Drink': 'Essen & Trinken',
  Community: 'Familie & Gemeinschaft',
  Education: 'Bildung & Business',
  Outdoor: 'Outdoor & Natur',
};

export const categoryLabel = (value: string | null | undefined) =>
  (value && LABELS[value]) || value || '';
