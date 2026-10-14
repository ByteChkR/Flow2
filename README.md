# Adam.Flow2 – Flow Engine PoC

**Phase 1 bis Phase 6 sind implementiert.**
Versionierte JSON-Schemas, rekursive Typprüfung und Flow-Validierung sind in
TypeScript und C# vorhanden. Dieselben Fixtures laufen unter Vitest, xUnit und
im Browser. Der Server erzeugt seinen Katalog aus Registrierungen und Contact-Metadaten;
der Playground kombiniert ihn mit lokalen Browser-Nodes. Versionierte Codecs sichern die JSON-Grenzen ab; eine feste HTTP-Demo verbindet
Browser, Jint und DTO-Projektion.

## Voraussetzungen und Einrichtung

- .NET 10 SDK; `global.json` erlaubt stabile SDKs der installierten .NET-10-Featurebänder.
- Node.js 26 (getestet mit 26.7.0, siehe `.nvmrc`) und npm 11 oder neuer.
- Alle folgenden Befehle im Repository-Stamm ausführen.

Mit nvm bei Bedarf zuerst `nvm install` und `nvm use` ausführen. Anschließend:

```bash
npm ci
dotnet restore Adam.Flow2.sln --locked-mode
npm run verify
```

`package-lock.json` und die .NET-`packages.lock.json`-Dateien gehören ins Repository.
Die lokale `NuGet.Config` verwendet ausschließlich öffentliche Pakete von nuget.org.
Es sind keine Adam-Zugangsdaten oder externen Dienste notwendig.

## Entwicklung

In zwei Terminals starten:

```bash
# Terminal 1: ASP.NET-API auf http://127.0.0.1:5080
npm run dev:api
```

```bash
# Terminal 2: Svelte-Playground auf http://127.0.0.1:5173
npm run dev
```

Der Playground lädt `/api/catalog`, `/api/types` und `/api/codecs`, zeigt den Gesamtkatalog aus
Server- und Browser-Definitionen und prüft editierbares Flow-JSON dagegen.
Mit „Flow starten“ wird das geladene JSON über den sessiongebundenen Orchestrator
ausgeführt. Der Playground bietet interaktive und Backend-Beispiele sowie das Öffnen
einer lokalen JSON-Datei. Ergebnisse und Ereignisse erscheinen neben dem Editor.
Vite leitet `/api` an den lokalen Server
weiter; `/api/health` liefert `{"status":"ok"}`. Die Ports sind in
`apps/playground/vite.config.ts` und `server/Flow.Api/Properties/launchSettings.json`
festgelegt. `vite preview` zeigt nur den Produktionsbuild; API-Proxying ist hier
nur für den Entwicklungsserver eingerichtet. `POST /api/demo/transport/contact` führt ausschließlich die feste Mock-Demo aus;
`/api/sessions` und `/api/executions` bieten zusätzlich die sessiongebundene Flow-Ausführung.

## Build und Tests

| Befehl | Zweck |
| --- | --- |
| `npm run check` | Strikte TypeScript-Prüfung und Svelte-Diagnostik |
| `npm run build` | Alle TS-Pakete, Playground und .NET-Solution bauen |
| `npm run test:ts` | Vitest ausführen |
| `npm run test:dotnet` | xUnit ausführen |
| `npm run verify` | Alle Prüfungen, Builds und Tests nacheinander |
| `dotnet run --project apps/Flow.Demo --configuration Release` | Jint-Durchstich ausführen |

Build und Tests setzen den oben beschriebenen Restore voraus. Die Befehlsfolge zur
Einrichtung kann unverändert in eine spätere CI übernommen werden.

## Projektgrenzen

```text
contracts/
  schemas/               Versionierte JSON-Schemas
  examples/              Versionierte gültige Beispiele
packages/
  flow-core/             Typmodell, Graph und Validator
  flow-compiler/         Boundary-Prüfung, DAG-Plan und JS-Codegenerierung
  runtime-browser/       Browser-Registry und synchrone Node-Ausführung
  nodes-browser/         Input-, Display- und Math-Nodes
server/
  Flow.Contracts/        C#-Modelle und Contract-Validierung
  Flow.Api/              ASP.NET-Host mit Health-, Katalog- und Typ-Endpunkten
  Flow.Runtime.Jint/     Vorhandener Jint-Durchstich
  Flow.Nodes.Server/     Contact-Metadaten, Factory und Mock-Repository
apps/
  playground/            Svelte + TypeScript + Vite
  Flow.Demo/             Ausführbarer Jint-Nachweis
Adam.Flow2/Runtime/      Internes C#-Modell des vorhandenen Durchstichs
tests/
  Flow.Tests/            xUnit inklusive Jint- und Fixture-Tests
  contracts/             Vitest für gemeinsame Contract-Fixtures
  fixtures/              Gemeinsame Dateien für beide Testumgebungen
```

Die vorhandene Solution und ihre Projektpfade bleiben erhalten; deshalb liegt das
xUnit-Projekt unter `tests/Flow.Tests` statt unter `server/Flow.Tests` wie in der
beispielhaften Struktur des Plans.

Die TS-Pakete sind private Workspace-Pakete mit Quell-Exports für interne Imports
und Builds nach `dist`. `flow-core` enthält Vertrags- und Katalogvalidierung, `runtime-browser` und
`nodes-browser` die Browser-Ausführung. Der Flow-Compiler prüft jetzt alle Environment-Grenzen. `Flow.Contracts`
ist unabhängig von Jint und ASP.NET.

## Phase 1 verwenden

Siehe [Vertrag v1](contracts/README.md) für Typsemantik, Dateiformate und Fehlercodes.

```typescript
import { parseContract, validateFlow } from '@adam-flow/flow-core';

const flow = parseContract('flow', flowJson);
const catalog = parseContract('catalog', catalogJson);
const types = parseContract('types', typesJson);
const diagnostics = validateFlow(flow, catalog, types);
```

C# lädt dieselben Dokumente über `ContractSchemas.Parse<T>` und prüft sie über
`FlowValidator.Validate`. Beispiele liegen unter `contracts/examples/v1`, die
sprachübergreifenden Erwartungen unter `tests/fixtures/v1`.

Für die echte Browser-Prüfung `npm run test:browser:serve` starten und
`http://127.0.0.1:5174/tests/browser/` öffnen. Die 109 gemeinsamen Fälle werden
in der Browser-JS-Engine ausgeführt und mit den erwarteten Ergebnissen verglichen.

## Phase 2: Katalog und Implementierungen

- `server/Flow.Nodes.Server/Metadata/contact.metadata.json` liefert die beim Start
  geladenen Test-Metadaten. `EntityNodeFactory` erzeugt die Entity-Definition und
  `crm.contact.get`; der Delegate verwendet ein In-Memory-Repository.
- `GET /api/catalog` liefert einen v1-Node-Katalog, `GET /api/types` das zugehörige
  Typdokument. CLR-Typen, Encoder, Delegates und Repository-Inhalte bleiben lokal.
- Die C#-Registry registriert nur Server-Implementierungen. Lookup enthält
  `(type, version, environment)`; ein Browser-Aufruf löst dort nichts auf.
  Der Jint-Host führt weiterhin ausschließlich aus geprüften Plänen generierten Code aus.
- Die Browser-Registry prüft Metadaten sowie Ein- und Ausgaben mit `flow-core` und
  führt registrierte synchrone Funktionen aus. UI-Zugriffe werden als Callbacks
  injiziert; die Pakete sind unabhängig von Svelte. Browser-Entities als native
  Objekte sind noch nicht angebunden; die Beispiel-Nodes verwenden JSON-Typen.
- `mergeCatalogs` vereinigt Environments nur bei gleichen Portverträgen derselben
  Node-Version. Doppelte Implementierungen und widersprüchliche Porttypen werden abgelehnt.
- Katalogfehler werden im Playground angezeigt; es gibt keinen stillen Rückfall
  auf den statischen Testkatalog. Ohne Server-Katalog bleibt Flow-Validierung deaktiviert.

Der Browser-Harness umfasst zusätzlich zu den 109 Phase-1-Fällen elf Registry-/Katalog-
Tests. HTTP-Tests prüfen die realen API-Routen; Jint-Tests prüfen registrierte Versionen,
Environment-Abweisung, optionale Eingänge und erhaltene C#-Objektidentität.

Die eingebetteten Test-Metadaten werden zur Laufzeit eingelesen. Änderungen an dieser
Datei erfordern einen Neubuild/Neustart; Live-Reload und Adam-Metadatenzugriff sind nicht
Teil dieses PoC-Schritts. Lokale Entities werden anhand ihres registrierten CLR-Typs
geprüft, ohne sie für die Prüfung zu serialisieren. JSON-Portwerte verwenden das
Phase-1-Typsystem. Die zusätzliche Boundary-Prüfung ist in Phase 3 implementiert.

## Phase 3: Objektidentität und JSON-Transport

- `compileBoundaries` (TypeScript) und `TransportContracts.ValidateFlow` (C#)
  prüfen jede Environment-Grenze. Verbindungen nennen explizit ihren Codec
  mit `typeId` und `version`; beide Endpunkte müssen kompatible Definitionen melden.
- Codec-Registries verlangen Encode- und Decode-Implementierungen. Der Vertrag
  enthält den logischen Werttyp und ein eigenständiges Wire-Schema; nur Metadaten
  werden über `/api/codecs` veröffentlicht.
- Der Empfänger prüft Envelope, erwartete Codec-ID/-Version, Wire-Payload und
  dekodierten Zielwert. Lokale Entities bleiben auch in verschachtelten Typen
  nicht transportierbar. `toDto` erzeugt ausdrücklich einen JSON-fähigen Wert.
- Die frühere feste DTO-Demo sendet die Contact-ID per HTTP; ihr API-Nachweis bleibt verfügbar.
  Jint führt `get → inspect → toDto` aus; der Browser dekodiert und zeigt das DTO.
  Die Registry erzwingt auch ohne HTTP einen Serialize/Parse-Roundtrip.
- Gemeinsame Fixtures prüfen fehlende/abweichende Codecs und manipulierte Payloads.
  Ein C#-Testobjekt mit absichtlich fehlschlagendem Property-Getter beweist, dass
  lokale Jint-Verbindungen weder serialisieren noch die Instanz ersetzen.

Verifiziert: 161 Vitest-Tests, 166 xUnit-Tests und 157 Browser-Prüfungen.
Die Oberfläche mit Ausführungsverlauf ist in Phase 6 umgesetzt (siehe unten).

## Vorhandener Jint-Nachweis

Die Demo führt `crm.contact.get → crm.contact.inspect → crm.contact.toDto` tatsächlich
in Jint aus und zeigt Referenzgleichheit, Wire-JSON und generiertes JavaScript an.

Der Runner nimmt ausschließlich einen Plan an, keinen JavaScript-Quelltext.
Er prüft Node-Versionen, Portmengen, Typen, Abhängigkeiten und Transportfähigkeit vor
Ausführung. Das ist ein erstes internes C#-Planmodell, noch kein importierbarer Flow-Vertrag.

C#-Werte bleiben im Value Store. JavaScript erhält ausschließlich zufällige Handles;
deren JSON-Verpackung serialisiert keine Contact-Instanzen. Die Host-Funktion löst
Handles auf und prüft Node-Ein- und -Ausgaben gegen die registrierten CLR-Typen.
`inspect` prüft ausdrücklich `ReferenceEquals`. Nach der Ausführung wird der Store
auch bei Fehlern freigegeben. Erst der registrierte DTO-Codec erzeugt das versionierte Wire-Envelope,
das einen echten Serialize/Parse-Roundtrip durchläuft.

Der Host veröffentlicht nur einen Delegate. Allgemeine CLR-Interop ist nicht aktiviert.
Statements, Ausführungszeit, Speicher und Rekursion sind begrenzt; Fehler enthalten
Execution-ID und, soweit zuordenbar, Node-ID. Jint-Limits können laufende C#-Callbacks
nicht unterbrechen. Die Mock-Nodes sind deshalb synchron und kurz; dies ist keine
Sandbox für beliebigen fremden Code. Siehe [Jint-Ausführungsgrenzen](https://sebastienros.github.io/jint/guide/constraints).

Die Orchestrierung und Session-Bindung sind jetzt in Memory implementiert; Persistenz, Resume und Reconnect bleiben außerhalb des PoC. Der lokale Server-Plan verwendet
zusätzlich zur gemeinsamen Typkompatibilität seine CLR-Adaptertypen.

## Lokaler Prüfhinweis

Bei der Verifikation trat auf diesem Rechner zeitweise ein interner CLR-Abbruch
(`0x80131506`) im Build-Prozess auf. Der abschließende Gesamtlauf bestand mit frischen
Build-Prozessen und begrenzter Parallelität, ohne Änderungen an globalen Einstellungen:

```bash
DOTNET_CLI_USE_MSBUILD_SERVER=0 MSBUILDDISABLENODEREUSE=1 DOTNET_PROCESSOR_COUNT=2 npm run verify
```

## Phase 4: Kompilierte Ausführung

„Flow starten“ verarbeitet das editierte Flow-JSON vollständig:
Validierung, deterministische DAG-Sortierung, Segmentbildung, JavaScript-Generierung
und Ausführung. Der Contact-Flow ergibt `browser(input) → server(get, inspect,
project) → browser(display)`. Eingaben und Ergebnisse passieren HTTP als Codec-Envelopes.
Die generierten Segmente werden unter dem Editor angezeigt.

- `compileFlow` und C# `FlowCompiler.Compile` erstellen denselben deklarativen Plan;
  `contracts/examples/v1/contact.plan.json` wird in beiden Sprachen als Golden geprüft.
  Der Plan enthält Node-IDs, Abhängigkeiten, Konfiguration, Porttypen und Verbindungen
  mit Quell-/Zieltypen und Codec-Verweisen. Segmente benennen Ein-/Ausgangskanten.
- Bereite Nodes werden stabil in Dokumentreihenfolge ausgewählt, bevorzugt aus dem
  aktuellen Environment. Verzweigungen, Zusammenführungen und getrennte Teilgraphen
  bleiben erhalten. `entryNodeId` filtert keine anderen Wurzeln aus.
- `BrowserExecution` und `CompiledExecution` halten lokale Werte bis `dispose` /
  `Dispose` oder bis zu einem Fehler. Native C#-Referenzen überleben auch einen
  dazwischenliegenden Browser-Abschnitt. Nur grenzüberschreitende Ausgänge werden encodiert.
- JavaScript besteht ausschließlich aus generierten Host-Aufrufen mit numerischen
  Planindizes und einem Abschlussaufruf. Daten und Konfiguration gelangen nie in den
  Quelltext. Der Browser verwendet `new Function` ausschließlich für diesen generierten
  Text; Jint erhält zwei Delegates und einen reinen JS-Wrapper, keine CLR-Objekte.
- Der Server kompiliert eingehende Flow-Deklarationen selbst gegen seine Registry.
  Browser-Metadaten können keine Server-Berechtigung vergeben. Porttypen, CLR-Adapter,
  Boundary-Eingaben und Node-Ausgaben werden erneut geprüft. Ausführbarer Quelltext
  oder ein vom Client behaupteter Plan wird nicht angenommen.
- C#-Nodes können über `ExecuteConfigured` Konfigurationsdaten erhalten; bestehende
  Implementierungen ohne Konfiguration bleiben verwendbar.

Seit Phase 5 laufen diese Segmente über den zentralen Orchestrator. Der frühere
Endpunkt `/api/demo/compiled` ist entfernt: Er darf keine interaktiven Flows ohne
Session starten. Mehrere Server-Abschnitte werden im selben Ausführungskontext ausgeführt.

Fehler enthalten `executionId`, nach Zuordenbarkeit `nodeId` und einen Code
(`failed`, `cancelled`, auf dem Server zusätzlich `timeout` und `limit`). Ein Fehler
verwirft lokale Werte; wiederholte Aufrufe abgeschlossener Segmente sind unzulässig.
Jint begrenzt standardmäßig 10.000 Statements, zwei Sekunden, 16 MB und Rekursion 64.
Cancellation wird vor Node-Aufrufen und von Jint geprüft. Synchrone vertrauenswürdige
Host-Callbacks können weder Jint noch die Browser-Runtime während ihres Aufrufs
unterbrechen; Browser-Abbruch greift zwischen Nodes. Kein Sandbox-Versprechen für
beliebige Node-Implementierungen. CSP muss die gewählte Browser-Codegenerierung erlauben.

Nachweis: 175 Vitest-Tests, 176 xUnit-Tests, 164 Prüfungen in der echten Browser-Engine
und der vollständige HTTP-Durchlauf im Playground.

## Phase 5: Session und Orchestrierung

Der Playground delegiert den Ablauf an `runOrchestratedFlow` in `runtime-browser`.
Der Helper legt für interaktive Flows eine Session an, startet die Ausführung, pollt
Browser-Aufträge, prüft sie gegen den lokalen Plan und meldet typisierte Ergebnisse.
Nach Abschluss, Fehler oder Abbruch schließt er die Session und räumt lokale Werte auf.
Backend-Flows benötigen keine Session; der serverseitige `input.contactId` verwendet
`config.initialValue` (Standard: `contact-1`).

| Route | Aufgabe |
| --- | --- |
| `POST /api/sessions` | Browser-Katalog und Codec-Capabilities binden; Session-ID zurückgeben |
| `POST /api/executions` | Inline-Flow mit seiner ID/Version und optionaler Session-ID starten |
| `GET /api/executions/{id}/next` | Status und gegebenenfalls genau den nächsten Browser-Auftrag lesen |
| `POST /api/executions/{id}/result` | Ergebnis oder Browser-Fehler für den aktuellen Auftrag melden |
| `DELETE /api/sessions/{id}` | Session schließen; noch aktive gebundene Ausführungen fehlschlagen lassen |

Interaktive Starts brauchen bereits vor dem ersten Node eine aktive Session, auch
wenn ihr erster Abschnitt auf dem Server liegt. Die Session ist an ein zufälliges
HttpOnly-/SameSite-Strict-Cookie gebunden; unter HTTPS wird es Secure gesetzt.
Polling und Ergebnisse brauchen zusätzlich `X-Flow-Session`. Eine Session-ID allein
reicht einem anderen Browser nicht. Dies bleibt ein temporärer PoC-Testmechanismus,
keine Benutzeranmeldung oder produktive Autorisierung.

Der Server hält `created → running → waiting_for_browser → running → completed | failed`
in Memory. Bei synchronen Schritten werden kurze Zwischenzustände vom Client nicht
notwendigerweise beobachtet. Abgelehnte Starts liefern `rejected` und legen keine
Execution an. Jeder Browser-Auftrag besitzt eine zufällige `attemptId`; fremde,
verspätete und doppelte Ergebnisse werden vor einer Zustandsänderung abgewiesen.
Gültige Ergebnisse werden erneut decodiert und typgeprüft, bevor Server-Nodes laufen.

Sessions verfallen nach 30 Sekunden ohne autorisierte Aktivität. Ein Browser-Auftrag
hat unabhängig davon eine Frist von 30 Sekunden: Polling hält keinen hängenden Schritt
unbegrenzt offen. Ein Hintergrunddienst prüft jede Sekunde und meldet `session_lost`
oder `browser_timeout`. Abbruch im Playground schließt die Session; bei Netzverlust
übernimmt der Ablauf der Frist. Terminale Zustände bleiben fünf Minuten abrufbar;
Neustart verliert alle In-Memory-Zustände. Native Runtime-Werte werden bei Abschluss
oder Fehler freigegeben. Zustandsübergänge sind für diesen synchronen PoC serialisiert.

Nachweis: 178 TypeScript-Tests, 192 .NET-Tests und 167 Browser-Prüfungen. Tests decken
Backend-Starts, fehlende/fremde/abgelaufene Sessions, fünf Environment-Segmente,
konkurrierende doppelte Ergebnisse, manipulierte Payloads und Browser-Cleanup ab.

## Phase 6: Playground und Timeline

Der Playground zeigt oben den grafischen Editor, darunter die aufklappbare JSON-Definition sowie Ergebnis und Ausführungsverlauf.
Die Beispielauswahl lädt `contact.flow.json` oder `backend.flow.json` (jeweils v1).
„JSON-Datei öffnen“ liest eine lokale Datei im Browser; sie wird erst beim Start als
Flow an die API übergeben. Der dynamische Katalog ist aufklappbar und zeigt Version,
Environments sowie Portnamen. Bei einem Ladefehler bleibt Starten gesperrt.

„Flow prüfen“ zeigt Diagnosecode, Pfad und – soweit zuordenbar – Node, Port,
Porttyp und Environment. „Flow starten“ validiert ebenfalls vor dem Start. Ergebnisse
werden beim Wechsel der Definition oder Browser-Contact-ID zurückgesetzt. Während
einer Ausführung sind Eingaben gesperrt; „Abbrechen“ verwendet den Session-Cleanup.
Das Browser-Contact-ID-Feld gilt für interaktive Flows; Backend-Eingaben stammen aus
`config.initialValue`. Generiertes JavaScript bleibt zur Inspektion aufklappbar.

`FlowWorkspace` in `runtime-browser` lädt/vereinigt Kataloge, prüft JSON, ergänzt
Diagnosekontext und delegiert die Ausführung an `runOrchestratedFlow`. Die Svelte-
Komponente verwaltet ausschließlich Eingaben und Darstellung. `client.ts` verbindet
die Beispiel-Nodes über injizierte UI-Callbacks; keine fachliche Flow-Logik liegt in Svelte.

Die Timeline zeigt echte Runtime-Ereignisse: Session-Bindung, Segmentzustände,
Node-Start/-Abschluss/-Fehler und JSON-Übergaben mit Quell-/Zielport und Codec.
Server-Ausgaben werden als „Bereitgestellt“ erfasst; Browser-Ergebnisse als „Übertragen“,
sobald der Server sie validiert angenommen hat.
Server-Ereignisse kommen mit dem autorisierten Execution-Snapshot; Browser-Node-
Ereignisse werden lokal während der Ausführung ergänzt. IDs verhindern doppelte
Einträge durch wiederholtes Polling. Die Anzeige folgt der Beobachtungsreihenfolge,
nicht einer Sortierung unsynchronisierter Browser-/Server-Uhren. Node-Laufzeiten
werden lokal mit monotonen Timern gemessen. Server-Segmentlaufzeiten schließen den
Jint-Aufwand ein. Browser-Ereignisse dienen der lokalen Diagnose und sind kein
serverseitiger Ausführungsbeweis. Native Entity-Werte werden für die Timeline nicht
serialisiert. Ein Lauf zeigt bei Fehlern nur tatsächlich begonnene/abgeschlossene Schritte.

Verifiziert: 183 TypeScript-Tests, 192 .NET-Tests, 172 Browser-Prüfungen. Zusätzlich im
Playground geprüft: erfolgreicher interaktiver Lauf, unbekannte Contact-ID mit
Node-Fehler, Backend-Beispiel, lokaler Dateiimport und Diagnose eines falschen Ports.


### Grafischer Editor

Nodes werden über den dynamischen Katalog mit Typversion und Environment hinzugefügt.
Ein neuer Flow beginnt mit dem ausgewählten Node-Typ. Der Kopf einer Node dient zum
Auswählen und Verschieben (Maus oder Pfeiltasten); die Seitenleiste bearbeitet `config`
als JSON-Objekt. Die letzte Node bleibt erhalten, da der Flow-Vertrag mindestens eine
Node verlangt. Flow-ID und Modus sind direkt bearbeitbar.

Zum Verbinden zuerst den Ausgang und dann den Eingang anklicken. `connectPorts` in
`runtime-browser` prüft dabei die vorhandenen Graphregeln; nur fehlende Pflicht-Inputs
sind während des Bearbeitens erlaubt. An Environment-Grenzen wird genau ein gemeinsamer,
typkompatibler Codec automatisch eingetragen. Fehlt er oder ist die Wahl mehrdeutig,
bleibt die Verbindung unverändert; bei Mehrdeutigkeit ist die explizite Wahl im JSON
möglich. Die vollständige Compilerprüfung bleibt vor jedem Start verpflichtend.

„Verbindungen bearbeiten“ entfernt einzelne Kanten. Beim Entfernen einer Node werden
auch ihre Verbindungen und gegebenenfalls die Entry-Referenz gelöscht. Rückgängig und
Wiederholen erfassen bis zu 50 grafische Definitionsänderungen, nicht Verschiebungen
oder direkte JSON-Eingaben. Der Export lädt die aktuelle Flow-Definition herunter;
Layout-Koordinaten bleiben nur in der Ansicht und gehen beim Neuladen verloren.

Editor-Verifikation: 190 TypeScript-Tests inklusive sieben Editor-Tests; TypeScript-/
Svelte-Prüfung und Produktionsbuild. Im Browser geprüft: Entfernen und erneutes
Verbinden einer Boundary mit anschließendem vollständigen Demo-Lauf, Maus-/Tastatur-
Verschieben, Node hinzufügen, Konfiguration und Rückgängig.

### Nodes entwickeln: Klassen und typisierte Definitionen

Server-Nodes implementieren `IFlowNode`. `FlowNode`, `FlowInput`, `FlowOutput` und
`FlowConfig` beschreiben stabile IDs und optionale Labels/Beschreibungen. Kategorien
stehen an der Node, `Order` an Ports und Konfigurationsfeldern. Beispiele stehen in
`server/Flow.Nodes.Server/ContactNodes.cs`.

```csharp
[FlowNode("example.scale", Label = "Skalieren", Category = "Mathematik")]
public sealed class ScaleNode : IFlowNode
{
    [FlowInput("value", Label = "Eingang")]
    public double Value { get; set; }

    [FlowConfig("factor", 2d, Label = "Faktor")]
    public double Factor { get; set; }

    [FlowOutput("result", Label = "Ergebnis")]
    public double Result { get; private set; }

    public void Execute() => Result = Value * Factor;
}
// using Adam.Flow2.Runtime;
// registry.Register<ScaleNode>();
```

Metadaten werden einmal beim Registrieren reflektiert; Properties werden pro Aufruf
gebunden. `registry.Register(() => new MyNode(service), typeMap)` ermöglicht
Konstruktor-Injektion ohne Abhängigkeit von einem konkreten DI-Container. Die Factory
muss pro Aufruf eine frische Node liefern. Die Node wird anschließend, auch bei Fehlern,
über `IDisposable` freigegeben; die Lebensdauer injizierter Services verantwortet der
aufrufende Scope. Keine Node-Instanzen als Singleton teilen.

Automatisch unterstützt sind `string`, `double` und `bool`. Native Entities, DTOs
und weitere CLR-Typen werden zentral über `NodeTypeMap.Add<T>(PortType)` zugeordnet.
Es gibt keine implizite Objektserialisierung oder numerische Verengung. Optionale
Ports markieren `Optional = true`; Werttypen verwenden dafür `Nullable<T>`. Fehlende
Werte werden ausgelassen, nicht als JSON-null gesendet. Explizites null bleibt eine
andere Vertragseigenschaft. Eingänge/Konfiguration brauchen öffentliche Setter,
Ausgänge öffentliche Getter. Doppelte IDs und ungeeignete Properties werden abgelehnt.
`Execute` bleibt in diesem PoC synchron; asynchrone Nodes sind noch nicht unterstützt.

Browser-Nodes verwenden `defineNode`, `port` und `field` aus `runtime-browser`:

```typescript
const scaleNode = defineNode({
  type: 'example.scale', version: 1,
  label: 'Skalieren', category: 'Mathematik',
  inputs: { value: port.number({ label: 'Eingang' }) },
  outputs: { result: port.number({ label: 'Ergebnis' }) },
  config: { factor: field.number(2, { label: 'Faktor' }) },
  execute: ({ value }, { config }) => ({ result: value * config.factor }),
});
registry.register(scaleNode);
```

`port.object`, `port.array` und `port.optional` leiten auch zusammengesetzte
TypeScript-Typen ab. `PortValue<typeof descriptor>` exportiert einen DTO-Typ ohne
separates Interface. `port.custom<T>` ist ein expliziter Adapter für bereits
registrierte Domänentypen; dabei verantwortet der Autor die Übereinstimmung von T
und Laufzeitvertrag. UI und Services werden über Closures injiziert. Die bestehende
Registrierung mit Definition und Ausführungsfunktion bleibt nutzbar.

Beide Wege erzeugen denselben Katalogvertrag mit optionalem `metadata` und `config`.
Konfiguration unterstützt String, Number und Boolean, jeweils mit explizitem Default;
String-Felder können `Options`/`options` haben. Der Editor erzeugt daraus Felder,
sortiert nach `order` und erhält unbekannte Konfigurationsschlüssel für bestehende
Flows. Bekannte Felder werden beim Prüfen und Ausführen validiert; fehlende Werte
nutzen Defaults. Labels verändern keine Verbindungs-IDs. Bei demselben Node-Typ und
derselben Version müssen Port- und vorhandene Konfigurationsverträge der Umgebungen
übereinstimmen; Beschriftungen dürfen abweichen (erster Katalog hat Vorrang).

Bestehende v1-Flows und Kataloge ohne diese optionalen Angaben bleiben lesbar.
Ältere Clients mit dem bisherigen strikten Katalogschema müssen für neue Kataloge
aktualisiert werden. Der reine Flow-JSON-Vertrag bleibt unverändert.

Die vorhandenen Contact-Nodes sind umgestellt. Zusätzliche Browser-Nodes `input.number`
und `input.text` demonstrieren die Formularfelder. Die Browser-Contact-ID im Playground
ist jetzt ein optionaler Test-Override; leer verwendet sie `config.initialValue`.

Verifikation dieser Erweiterung: `npm run verify` erfolgreich mit 196 TypeScript-
und 198 .NET-Tests, einschließlich Compile-Time-Negativtests für TypeScript-Inferenz,
Factory-Lebensdauer, optionalen Ports, Defaults und ungültiger Konfiguration.
