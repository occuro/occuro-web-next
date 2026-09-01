/**
 * Wohin ein Besucher OHNE App geschickt wird.
 *
 * WAS FALSCH WAR: Alle drei Landeseiten (Event, Einladung, Profil) trugen
 * denselben fest verdrahteten App-Store-Link. Ein Android-Nutzer, dem
 * jemand einen Event-Link geschickt hat, landete also bei Apple — wo er
 * die App nicht bekommt. Genau die Haelfte der Empfaenger, die man mit
 * einem geteilten Link erreichen will, lief damit ins Leere.
 *
 * WARUM ERST IM BROWSER ENTSCHIEDEN WIRD: Der Server sieht zwar den
 * User-Agent, aber die Seiten sind statisch ausgeliefert (und werden von
 * einem CDN zwischengespeichert). Eine serverseitige Weiche wuerde dem
 * naechsten Besucher die Antwort des vorigen zeigen. Deshalb entscheidet
 * der Browser, und bis er es tut, steht der neutrale Text da.
 */

export const APP_STORE_URL = 'https://apps.apple.com/app/occuro/id6760317905';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.occuro.app';
/** Wenn wir das System nicht kennen: die Homepage, die beides anbietet. */
export const DOWNLOAD_URL = 'https://www.occuroapp.com';

export type Plattform = 'ios' | 'android' | 'unbekannt';

export function erkennePlattform(): Plattform {
  if (typeof navigator === 'undefined') return 'unbekannt';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  // iPadOS meldet sich seit Version 13 als Macintosh — der Touchpunkt
  // verraet es trotzdem. Ohne diese Zeile bekaemen iPad-Nutzer die
  // Homepage statt des App Store.
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document) return 'ios';
  return 'unbekannt';
}

export function storeLinkFuer(plattform: Plattform): string {
  if (plattform === 'ios') return APP_STORE_URL;
  if (plattform === 'android') return PLAY_STORE_URL;
  return DOWNLOAD_URL;
}
