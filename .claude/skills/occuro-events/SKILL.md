---
name: occuro-events
description: >
  Sucht im Internet nach lokalen Events und importiert sie in die occuro-Datenbank.
  Verwende diesen Skill immer wenn der User nach Events suchen, Events importieren,
  Facebook Events hinzufügen, Events in die Datenbank eintragen, oder occuro mit
  neuen Veranstaltungen befüllen möchte — auch wenn er nicht explizit "/occuro-events"
  tippt. Trigger-Phrasen: "Events suchen", "Events importieren", "Veranstaltungen
  hinzufügen", "Events in occuro eintragen", "Facebook Events", "Events in der Nähe".
version: 1.0.0
---

# occuro Event-Import

Dieser Skill hilft dir dabei, lokale Events aus dem Internet zu finden und in die
occuro-Datenbank zu importieren. Gehe Schritt für Schritt vor.

## Konfiguration

- **Supabase URL:** `https://qtaydnsyzzqbbdlvyjwn.supabase.co`
- **Organisation:** `d9c33ed0-4dfc-472a-ab0d-9e6548dd1181`
- **Owner:** `ec40afa6-c627-4c7e-b587-8addd9162f8a`

Den Supabase Service Role Key musst du aus den Umgebungsvariablen lesen oder den User
danach fragen. Prüfe zuerst ob `$SUPABASE_SERVICE_ROLE_KEY` gesetzt ist.

---

## Schritt 1 — Suchanfrage stellen

Frag den User nach folgenden Informationen (auf Deutsch, eine Frage nach der anderen):

1. **Postleitzahl und Ort** — z. B. "80331 München"
2. **Umkreis in Kilometern** — z. B. 25
3. **Datum ab** — z. B. 2026-06-01 (Format: YYYY-MM-DD; wenn der User ein anderes Format
   angibt, konvertiere es)
4. **Eventtyp (optional)** — z. B. Konzert, Sport, Kultur, Party, Messe, Festival,
   Theater, Markt. Erkläre, dass man auch mehrere angeben kann oder diesen Schritt
   überspringen kann.

Fasse am Ende die eingegebenen Parameter zusammen und bestätige mit dem User, bevor du
weiter machst.

---

## Schritt 2 — Events im Internet suchen

Suche mit WebSearch nach Events. Nutze mehrere gezielte Suchanfragen, um ein breites
Ergebnis zu bekommen. Beispiele für Suchanfragen (passe Ort, Datum und Typ an):

- `site:facebook.com/events "[Ort]" "[Eventtyp]" "[Monat Jahr]"`
- `"[Ort]" Events "[Eventtyp]" "[Datum ab]" Ticketvorverkauf`
- `Eventbrite "[Ort]" "[Eventtyp]" [Jahr]`
- `Meetup "[Ort]" [Jahr]`
- `"[Ort]" Veranstaltungen [Monat] [Jahr]`
- Lokale Event-Portale (z. B. `events.de`, `reservix.de`, `muenchen.de/veranstaltungen`,
  stadtspezifische Portale)

**Wichtig bei der Suche:**
- Berücksichtige den Umkreis: Suche auch in Nachbarstädten/Stadtteilen innerhalb des
  angegebenen Radius
- Filtere Events die vor dem "Datum ab" stattfinden heraus
- Bevorzuge Events mit konkreten Datum, Ort und Beschreibungsangaben
- Extrahiere pro Event: Titel, Datum, Uhrzeit, Ort/Adresse, Beschreibung, Kategorie,
  Website-URL, Ticket-URL (falls vorhanden)

Sammle mindestens 10–20 potenzielle Events, bevor du weiter machst.

---

## Schritt 3 — Gegen Datenbank prüfen

Hole den Supabase Service Role Key. Prüfe zuerst ob er als Umgebungsvariable
`SUPABASE_SERVICE_ROLE_KEY` verfügbar ist:

```bash
echo $SUPABASE_SERVICE_ROLE_KEY
```

Falls leer, frag den User: "Bitte gib deinen Supabase Service Role Key ein (zu finden
im Supabase Dashboard unter Project Settings → API):"

Dann frage die bestehenden Events der Organisation aus der Datenbank ab:

```bash
curl -s "https://qtaydnsyzzqbbdlvyjwn.supabase.co/rest/v1/events?organizer_org_id=eq.d9c33ed0-4dfc-472a-ab0d-9e6548dd1181&select=title,date&limit=1000" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

Vergleiche die gefundenen Online-Events mit den existierenden DB-Events:
- Duplikat-Erkennung: Ein Event gilt als bereits vorhanden wenn **Titel ähnlich** UND
  **Datum gleich** (Fuzzy-Match: Titelübereinstimmung > 80%, Groß-/Kleinschreibung und
  Sonderzeichen ignorieren)
- Filtere erkannte Duplikate aus der Liste heraus

---

## Schritt 4 — Neue Events anzeigen

Zeige dem User die **neuen** Events (nicht in der DB vorhanden) als nummerierte Tabelle:

```
Nr. | Titel                    | Datum      | Ort              | Kategorie | Quelle
----|--------------------------|------------|------------------|-----------|---------------------------
1   | Rock im Park             | 2026-06-07 | Nürnberg         | Konzert   | https://facebook.com/...
2   | Münchner Stadtlauf       | 2026-06-14 | München          | Sport     | https://eventbrite.de/...
```

Wenn keine neuen Events gefunden wurden, teile das mit und biete an, die Suche mit
anderen Suchbegriffen oder einem größeren Radius zu wiederholen.

---

## Schritt 5 — Freigabe durch den User

Frag den User: "Welche Events möchtest du importieren? Gib die Nummern kommagetrennt an
(z. B. `1,3,5`) oder tippe `alle` für alle Events."

Warte auf die Antwort und bestätige die Auswahl bevor du weitermachst.

---

## Schritt 6 — Events in die Datenbank eintragen

Für jedes ausgewählte Event führe einen INSERT via Supabase REST API durch.

**Geo-Koordinaten ermitteln:** Versuche Latitude/Longitude über die Nominatim-API zu
ermitteln (kein API-Key nötig):

```bash
curl -s "https://nominatim.openstreetmap.org/search?q=[URL-kodierte+Adresse]&format=json&limit=1" \
  -H "User-Agent: occuro-event-import/1.0"
```

Extrahiere `lat` und `lon` aus dem ersten Ergebnis. Falls kein Ergebnis, setze beide
auf `null`.

**INSERT-Befehl** (ersetze Platzhalter mit den echten Event-Daten):

```bash
curl -s -X POST "https://qtaydnsyzzqbbdlvyjwn.supabase.co/rest/v1/events" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "title": "[TITEL]",
    "slogan": null,
    "date": "[YYYY-MM-DD]",
    "end_date": null,
    "time": "[HH:MM oder null]",
    "location": "[ORT/ADRESSE]",
    "description": "[BESCHREIBUNG]",
    "category": "[KATEGORIE]",
    "subcategory": null,
    "event_type": "[TYP]",
    "max_participants": 0,
    "organizer_org_id": "d9c33ed0-4dfc-472a-ab0d-9e6548dd1181",
    "organizer_profile_id": null,
    "organizer_name": "occuro",
    "latitude": [LAT oder null],
    "longitude": [LNG oder null],
    "visibility": "public",
    "website": "[URL oder null]",
    "ticket_shop_url": "[TICKET-URL oder null]",
    "requires_ticket": false,
    "banner_url": null
  }'
```

**Wichtige Regeln:**
- `organizer_profile_id` muss immer `null` sein (DB-Constraint: entweder org ODER
  profile, nie beides)
- `organizer_org_id` ist immer `"d9c33ed0-4dfc-472a-ab0d-9e6548dd1181"`
- `visibility` ist immer `"public"`
- Leere Strings als `null` übergeben, nie als `""`
- Datum immer im Format `YYYY-MM-DD`
- Uhrzeit im Format `HH:MM` (24h) oder `null`

---

## Schritt 7 — Ergebnis bestätigen

Prüfe die HTTP-Antwort jedes Inserts:
- HTTP 201: Erfolgreich → notiere die generierte `id`
- HTTP 4xx/5xx: Fehler → zeige die Fehlermeldung und biete an, das Event manuell zu
  korrigieren

Gib dem User abschließend eine Zusammenfassung:

```
Import abgeschlossen!

✓ 3 Events erfolgreich importiert:
  - Rock im Park (2026-06-07)
  - Münchner Stadtlauf (2026-06-14)
  - Jazz am See (2026-06-21)

✗ 1 Event fehlgeschlagen:
  - Stadtfest Maxvorstadt → Fehler: [Fehlermeldung]
```

---

## Hinweise

- **Kategorie-Werte:** Verwende konsistente Kategorien die in der App verwendet werden.
  Gängige Werte: `Konzert`, `Sport`, `Kultur`, `Party`, `Messe`, `Festival`, `Theater`,
  `Markt`, `Kunst`, `Gastronomie`, `Outdoor`, `Networking`.
- **Beschreibung:** Kürze sehr lange Beschreibungen auf max. 500 Zeichen. Entferne
  HTML-Tags und überflüssige Whitespaces.
- **Datenschutz:** Speichere keine persönlichen Daten von Veranstaltern — nur öffentlich
  zugängliche Event-Infos.
