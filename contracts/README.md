# Gemeinsamer Vertrag v1

Die Schemas unter `schemas/v1` sind die Vertragsquelle (JSON Schema Draft 2020-12).
TypeScript/Ajv und C#/JsonSchema.Net laden dieselben Dateien ohne Netzwerkzugriff.
Die `$id`-URLs sind Bezeichner, keine abzurufenden Endpunkte.

## Typsemantik

| Typ | JSON-Form | Bedeutung |
| --- | --- | --- |
| Primitive | `{"kind":"string"}` / `number` / `boolean` / `null` | Keine implizite Konvertierung |
| Array | `{"kind":"array","items":{"kind":"string"}}` | Rekursive Elementprüfung |
| Objekt | `{"kind":"object","fields":{"id":{"kind":"string"}}}` | Strukturelle Kompatibilität |
| Optional | `{"kind":"optional","inner":{"kind":"string"}}` | Fehlendes Feld / unverbundener Port erlaubt |
| Entity | `{"kind":"entity","name":"crm.Contact@1"}` | Nominale lokale Runtime-Identität |
| EntityRef | `{"kind":"entityRef","name":"crm.Contact@1"}` | JSON-Referenz mit `type` und nichtleerer String-`id` |

`optional<T>` ist die einzige Schreibweise für Optionalität; das frühere schematische
`optional: true` aus dem Plan wird damit eindeutig ersetzt. Optional bedeutet nicht
nullable: `null` passt nur auf `null` oder `optional<null>`. Ein erforderlicher Wert
passt auf einen optionalen Zieltyp, ein optionaler Quelltyp nicht auf einen erforderlichen.
Arrays enthalten JSON-Werte, keine ausgelassenen Elemente. Zahlen sind endliche
IEEE-754-Double-Werte; dezimale Präzisionsgarantien und spezielle Zahlentypen sind nicht Teil von v1.

Objekte sind offen: zusätzliche Quellfelder und zusätzliche JSON-Felder sind erlaubt,
aber alle Ziel-Pflichtfelder müssen vorhanden und rekursiv kompatibel sein.
Optionale, vorhandene Felder müssen ebenfalls zum Zieltyp passen. Arrays sind für die
Verbindungsprüfung kovariant; diese Prüfung erteilt keine Rechte, upstream-Werte zu mutieren.

Entities und EntityRefs sind ausschließlich bei identischer Art und vollständiger Typ-ID
kompatibel. Unterschiedliche Versionen sind unterschiedliche Typen. Eine Entity wird
nicht automatisch zu einem strukturell passenden Objekt oder zu einer EntityRef.
Alle referenzierten Entities müssen registriert sein, auch innerhalb von Arrays,
Objekten und optionalen Feldern. Rekursive Entity-Metadaten sind über nominale Referenzen
möglich; die Kompatibilitätsprüfung expandiert sie nicht unendlich.

`types.schema.json` definiert ein versioniertes Dokument mit Entity-Definitionen
(`id`, `kind: entity`, `fields`). Anonyme strukturelle Typen werden in dessen Feldern
und in Node-Ports verwendet. Die Registry verbietet doppelte Typ-IDs.

## Flow und Katalog

`flow.schema.json` verlangt `schemaVersion: 1`, ID, positive ganzzahlige Version,
Modus, Nodes und Verbindungen. Versionen sind auf positive Int32-Werte begrenzt,
sodass C# und JavaScript denselben Wertebereich haben. Node-IDs und Portnamen bestehen
aus ASCII-Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich; die erste Stelle
muss ein Buchstabe oder Unterstrich sein. Node-IDs sind innerhalb des Flows eindeutig.
Unbekannte Vertragsfelder werden abgelehnt. `config` ist ein JSON-Objekt und bleibt
beim Roundtrip erhalten; seine node-spezifische Semantik folgt mit den Implementierungen.

Der Katalog identifiziert einen Node über `(type, version)` und deklariert seine
Environments und typisierten Ports. Eine Definition kann mehrere Environments erlauben;
der Flow legt das konkrete Environment fest. Backend-Flows enthalten keine Browser-Nodes.

Eine Verbindung enthält `source` und `target`, jeweils mit `nodeId` und `port`.
Jeder erforderliche Eingangsport benötigt genau eine Verbindung; optionale Ports höchstens
eine. Ausgänge dürfen mehrere Ziele versorgen. Externe Startwerte werden im Beispiel
über einen Quell-Node ohne Eingangsports modelliert. Node-Konfiguration ersetzt keine
Eingangsverbindung. Der optionale `entryNodeId` muss eine existierende Wurzel ohne
eingehende Verbindungen bezeichnen; ohne ihn werden die Wurzeln aus dem DAG abgeleitet.
Er filtert keine anderen Graphteile aus. Getrennte Teilgraphen sind erlaubt.

Validierung akzeptiert DAGs inklusive Verzweigungen und weist Zyklen zurück.
Ausführungsreihenfolge, Parallelität und Segmentbildung gehören in spätere Phasen.
Ebenso prüft Phase 1 **keine** Codecs, Transportfähigkeit oder Browser-Sessions.
Ein für Phase 1 gültiger Flow ist daher noch keine Ausführungsfreigabe.

## APIs und Fehler

TypeScript (`@adam-flow/flow-core`): `parseContract`, `validateSchema`, `TypeRegistry`,
`isAssignable`, `validateFlow` und `validateValue`. `validateFlow` nimmt untrusted
JSON-Werte entgegen und prüft vor der semantischen Validierung ihre Schemas.
C# bietet dieselben Aufgaben über `ContractSchemas`, `TypeRegistry` und `FlowValidator`.
Typisierte Hilfsfunktionen werden mit zuvor schema-validierten Typen aufgerufen.

Fehler enthalten `code`, `path` und `message`. Schema-Diagnostik darf je Bibliothek
unterschiedlich ausführlich sein; ihre Fehlerklasse lautet `schema`. Semantische
Fehlercodes und Gültigkeit werden über dieselben Fixtures in allen Umgebungen geprüft.

`validateValue` / `ValidateValue` prüft JSON-Portwerte rekursiv. Es ist kein Serializer
für CLR-Objekte: `entity` wird bewusst abgelehnt. Für ein fehlendes Feld wird intern
`undefined` (TS) bzw. `default(JsonElement)` (C#) verwendet, niemals JSON `null`.
Die Phase-2-Registries prüfen ihre JSON-Ein-/Ausgaben damit. Die Server-Registry prüft
lokale Entities über den registrierten CLR-Typ und erhält die Referenz. Boundary-Codecs
prüfen zusätzlich das Wire-Schema und den dekodierten Zielwert.

## Nachweis und Wiederholung

- `npm run test:ts`: gemeinsame Fixtures unter Vitest.
- `npm run test:dotnet`: dieselben Fixtures mit C#-Modellen und eigenständigem Validator.
- `npm run test:browser:serve`, dann `http://127.0.0.1:5174/tests/browser/` öffnen:
  dieselben TypeScript-Fixtures in der tatsächlichen Browser-Engine, mit sichtbarem Ergebnis.
- `npm run verify`: Typprüfung, Produktionsbuild und automatisierte Tests.

Die 109 gemeinsamen Fälle prüfen Schemas, Zuweisbarkeit, Laufzeitwerte, Flows und
Roundtrips der vier versionierten Beispieldateien. Im Browser wurden alle 109 Fälle
am 09.10.2026 erfolgreich ausgeführt. Neue Fälle immer in den gemeinsamen JSON-Dateien
unter `tests/fixtures/v1` ergänzen, damit C# und Browser dieselben Erwartungen prüfen.

## Phase-2-Kataloge

`/api/catalog` und `/api/types` liefern diese unveränderten v1-Formate aus der laufenden
Server-Registry. `mergeCatalogs` verbindet sie mit Browser-Definitionen; gleiche
Node-Versionen dürfen Environments nur bei identischen Portverträgen teilen.
Die Browser-Testseite führt zusätzlich elf Runtime-/Katalogfälle aus (insgesamt 120).

## Phase-3-Transport

Environmentübergreifende Verbindungen benötigen `codec: {typeId, version}`.
Lokale Verbindungen benötigen keinen Codec. Die grundlegenden `validateFlow` /
`FlowValidator.Validate` bleiben Phase-1-Prüfungen; vollständige Boundary-Prüfung
leisten `compileBoundaries` aus `@adam-flow/flow-compiler` beziehungsweise
`TransportContracts.ValidateFlow` in C#. `compileFlow` beziehungsweise `FlowCompiler.Compile` bauen darauf den DAG-Plan auf.

`codecs.schema.json` beschreibt Capability-Kataloge je Environment; registrierte
Implementierungen müssen Encode und Decode anbieten. Beide Endpunkte vergleichen
ID, Version, logischen Werttyp und Wire-Schema auf deklarative Gleichheit
(Objekt-Schlüsselreihenfolge ist unerheblich). Semantische Äquivalenz beliebiger
unterschiedlich formulierter JSON-Schemas wird nicht hergeleitet.

`envelope.schema.json` definiert `{schemaVersion, typeId, codecVersion, payload}`.
Empfänger erwarten einen festgelegten Codec und akzeptieren keine freie Auswahl durch
den Absender. Wire-Payloads werden vor Decode, logische Werte danach geprüft.
Die logischen Objekttypen bleiben offen; das ContactDTO-Wire-Schema ist geschlossen
und weist zusätzliche Felder zurück. Diese Strukturprüfung ersetzt keine Authentifizierung.

Wire-Schemas sind eigenständig (Draft 2020-12), ohne `$ref` oder `$dynamicRef`.
Native Entities sind rekursiv nicht transportierbar. EntityRefs können über einen
expliziten Codec transportiert werden, lösen aber keine automatische Rehydration aus.
Optionale DTO-Felder sind unterstützt; ein optionaler Wurzelwert wird nicht als
Codec-Werttyp registriert, da Abwesenheit kein JSON-Wert ist.

Die zusätzlichen 18 Boundary- und 12 Payload-Fixtures werden in beiden Sprachen
geprüft. Der Browser-Harness umfasst einschließlich Registry- und Transporttests 157 Fälle.

## Phase-4-Ausführungsplan

`contact.plan.json` ist der gemeinsame Golden für die TS-/C#-Planer. Dieser Plan
ist ein abgeleitetes internes Datenmodell mit Nodes, typisierten Kanten und Segmenten;
es gibt noch keinen vertrauenswürdigen Plan-Import. Runtime-Konstruktoren nehmen
Flow-Deklarationen entgegen und kompilieren sie erneut. Segment-IDs sind nur innerhalb
dieses deterministischen Plans eindeutig; Boundary-Nachrichten werden per
Verbindungsindex zugeordnet. Ausführungen besitzen eine eigene `executionId`.
Native lokale Werte werden über Node-/Portadressen im Ausführungskontext referenziert,
nicht als JSON-Nachrichten ausgegeben. Das Session-/Nachrichtenprotokoll ist im folgenden Abschnitt beschrieben.

## Phase-5-HTTP-Protokoll

Alle Routen liegen unter `/api`. Nachrichten enthalten deklarative Daten und
Wire-Envelopes als JSON-Strings, niemals ausführbaren Quelltext.

- `POST /sessions`: `{browserCatalog, browserCodecs}` → `{sessionId, leaseSeconds}`
  und ein HttpOnly-Browser-Cookie. Capabilities werden für diese Session eingefroren.
- `POST /executions`: `{flow, sessionId?}` → `ExecutionSnapshot`. Der vollständige
  versionierte Inline-Flow ersetzt im PoC eine persistente Flow-ID-Registry; seine
  Konfiguration bzw. der Browser-Input-Node liefern Startwerte.
- `GET /executions/{id}/next`: `{execution, segment, attemptId, wires}`. Bei terminalem
  Status sind die letzten drei Felder `null`. Sonst enthält `segment` den geplanten
  Browser-Abschnitt und `wires` exakt seine eingehenden Environment-Grenzen.
- `POST /executions/{id}/result`: `{segmentId, attemptId, wires, error?}` → Snapshot.
  `wires` muss exakt die ausgehenden Environment-Grenzen enthalten. Ein Browser-Fehler
  ist `{code, message, nodeId}`; der Server meldet ihn als `browser_failed`.
- `DELETE /sessions/{id}` beendet die Session. Aktive Ausführungen werden `failed`.

Ein Snapshot enthält `{executionId, state, error, completedSegments, events}`; `error` ist
`null` oder `{code, message, nodeId}`. Session-Fehler haben keine Node-ID. Fehlende
Start-Sessions und falsche Auftrags-IDs liefern HTTP 409, fremde Browser HTTP 403,
unbekannte Executions HTTP 404 und ungültige Deklarationen HTTP 400. Fachliche
Ausführungsfehler stehen im terminalen Snapshot. Abgelehnte Starts enthalten
`state: "rejected"` und keine Execution-ID.

Interaktive Polling-/Ergebnisaufrufe benötigen das ursprüngliche Browser-Cookie und
`X-Flow-Session`. Session- und Auftrags-IDs werden mit kryptografischem Zufall erzeugt.
Die doppelte Bindung isoliert Browser im PoC; sie ist keine Produktionsauthentifizierung.
Nach 30 Sekunden Session-Inaktivität oder 30 Sekunden ohne Browser-Ergebnis wird
terminal fehlgeschlagen. Autorisiertes Polling verlängert nur die Session-Frist.

## Phase-6-Diagnoseereignisse

Execution-Snapshots enthalten `events` als vollständige bisherige Server-Ereignisliste.
Ein Ereignis enthält `id`, `timestamp`, `environment`, `kind`, `status` und optional
`segmentId`, `nodeId`, `connectionIndex`, `message`, `durationMs`. `kind` ist
`session`, `execution`, `segment`, `node` oder `boundary`. IDs sind innerhalb einer
Ausführung stabil; der Browser übernimmt jede Server-ID nur einmal. Lokale Browser-
Node-Ereignisse haben eigene `browser-`-IDs und werden nicht als vertrauenswürdige
Ausführungsdaten an den Server zurückgeschickt.

Die Timeline ist ein Diagnoseverlauf in Beobachtungsreihenfolge. Uhrzeiten stammen
von der jeweiligen Runtime; Dauerangaben werden dort monoton gemessen. Boundary-
Ereignisse referenzieren die geplanten Verbindungsindizes, Ports und Codec-Versionen.
Sie enthalten keine serialisierten nativen Entities. Ein optionales Feld kann in
Server-JSON `null` sein; ältere Snapshot-Leser dürfen die zusätzliche Ereignisliste ignorieren.
