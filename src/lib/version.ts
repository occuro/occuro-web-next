/**
 * Version der Web-App.
 *
 * Sie laeuft mit der Mobil-App mit (`occuroapp/app.json` → `expo.version`),
 * damit ein Nutzer, der beides benutzt, nicht zwei verschiedene Nummern fuer
 * dasselbe Produkt sieht. Bei einer neuen App-Version wird sie hier von Hand
 * nachgezogen — die Web-App hat keinen Zugriff auf app.json.
 *
 * Vorher stand "1.0.6" doppelt im Code (Einstellungsliste und Über-Seite).
 * Beim Nachziehen wurde erfahrungsgemaess eine der beiden Stellen vergessen.
 */
export const APP_VERSION = '1.2.1';
