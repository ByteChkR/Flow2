# Flow Engine – Proof of Concept

**Zielarchitektur:** C#/.NET + Jint (Server), Svelte + TypeScript (Browser)  
**Status:** Implementierungsplan für einen eigenständigen Proof of Concept  
**Ziel:** Nachweisen, dass dynamisch definierte, typisierte Nodes und environmentübergreifende Flows mit einer gemeinsamen serialisierten Definition zuverlässig funktionieren.

## 1. Ziel und Umfang

Wir bauen ein unabhängiges Flow-System, das später in Adam integriert werden kann.

Der PoC soll nachweisen, dass:

1. Ein Flow in einem gemeinsamen, JSON-serialisierbaren Format gespeichert werden kann.
2. Server und Browser eigene Node-Kataloge und Implementierungen bereitstellen können.
3. Node-Ein- und Ausgänge anhand eines plattformunabhängigen Typsystems geprüft werden.
4. Node-Definitionen aus einem zur Laufzeit bekannten Entity-Schema erzeugt werden können.
5. Innerhalb einer Runtime echte Objektinstanzen ohne JSON-Roundtrip weitergereicht werden können.
6. An Environment-Grenzen ausschließlich explizit transportierbare Werte übergeben werden.
7. Derselbe Flow zunächst validiert, dann als Execution Plan aufbereitet und schließlich in JavaScript ausgeführt wird: im Browser durch die JS-Engine, auf dem Server durch **Jint**.
8. Ein interaktiver Flow **nur mit einer beim Start gebundenen Browser-Session** beginnt.

### Nicht-Ziele

- Produktiver visueller Flow-Editor
- Adam-Integration, echte Datenbank oder ORM
- Verteilte Ausführung mit Persistenz, Retry und Reconnect
- Produktive Authentifizierung und Autorisierung (im PoC durch klar gekennzeichneten Testmechanismus ersetzt)
- Vollständige Unterstützung aller JavaScript-/Browser-APIs in Jint
- Freie Ausführung beliebigen nutzergelieferten JavaScripts

> **Leitprinzip:** Die Flow-Datei enthält ausschließlich deklarative Struktur, Typverweise und Konfiguration – **keine Node-Implementierungen oder ausführbaren Quelltexte**.

---

## 2. Architektur

```text
                  Gemeinsamer JSON-Flow
                          │
                     Schema-Check
                          │
                    Node Resolution
                          │
                Type-/Boundary-Check
                          │
                     Execution Plan
                          │
               JavaScript-Generierung
                          │
                  Flow-Orchestrierung
                    ┌─────┴──────┐
                    │            │
            Browser/Svelte    .NET Server
            JavaScript        Jint JavaScript
            Node Registry     Node Registry
                    │            │
                    └── JSON ────┘
                    Boundary-Transport
```

**Verantwortlichkeiten**

- **Shared Contract:** JSON-Schemas, Typmodell, Flow-Dateiformat, Node-Metadaten, Execution- und Transport-Nachrichten.
- **Compiler/Validator:** löst Node-Typen auf, prüft Port-Typen, Environments, Transportfähigkeit und erstellt einen Execution Plan. Für den PoC kann diese Logik zunächst vollständig in TypeScript implementiert und vom Server als vorvalidierter Plan genutzt werden. **Der Server validiert importierte Pläne, Node-Berechtigungen und jeden Boundary-Input trotzdem eigenständig.**
- **Browser-Runtime:** führt Browser-Nodes in JavaScript aus; Svelte stellt Eingaben, Ergebnisse und Debugging dar.
- **Server-Runtime:** führt generierte, Jint-kompatible JavaScript-Segmente aus. Server-Nodes werden über eine eng definierte Host-API an **C#-Implementierungen** gebunden.
- **Orchestrator:** hält die Reihenfolge, den Execution-Status und den Wechsel zwischen Environments zusammen. Für den PoC reicht ein kleiner zentraler .NET-Orchestrator mit In-Memory-Status.

### Technische Schlüsselentscheidung

**Nicht versuchen, Svelte-/Browser-Code unverändert in Jint auszuführen.** Der Compiler erzeugt eine möglichst kleine gemeinsame JavaScript-Teilmenge. Browser- und Server-Segmente referenzieren registrierte Runtime-Funktionen; Browser-APIs, Node.js-Module und bundlerspezifische Importe sind im generierten Server-Code verboten. Prüfen, welche ECMAScript-Funktionen die konkret verwendete Jint-Version unterstützt.

---

## 3. Technologie und Projektstruktur

### Stack

| Bereich | Technologie |
|---|---|
| Shared Contract & Browser | TypeScript, JSON Schema, Svelte (idealerweise SvelteKit oder Svelte + Vite) |
| Browser-Tests | Vitest |
| Server | C# / ASP.NET Core |
| Server-JavaScript-Runtime | Jint |
| Server-Tests | xUnit oder NUnit |
| Transport | HTTP + JSON, im PoC zunächst Request/Response oder Polling; später optional WebSocket/SignalR |
| Flow-Codegenerierung | Zunächst TypeScript-Compiler mit browser-/Jint-kompatiblem JavaScript-Output |

### Empfohlene Struktur

```text
flow-engine/
├── contracts/
│   ├── schemas/                  # JSON Schema: Flow, Types, Catalog, Messages
│   └── examples/                 # Versionierte Testdateien / Golden Fixtures
├── packages/
│   ├── flow-core/                # Typen, Graph, Validator, Execution Plan (TS)
│   ├── flow-compiler/            # JS-Codegenerierung (TS)
│   ├── runtime-browser/          # Browser Node Registry und Executor
│   └── nodes-browser/            # Beispiel-Browser-Nodes
├── server/
│   ├── Flow.Api/                 # ASP.NET Core, Execution/Session/Transport
│   ├── Flow.Runtime.Jint/        # Jint-Host und JS-Host-API
│   ├── Flow.Nodes.Server/        # C#-Node-Implementierungen
│   ├── Flow.Contracts/           # C#-Modelle / Contract-Validierung
│   └── Flow.Tests/
├── apps/
│   └── playground/               # Svelte-App
└── tests/
    └── fixtures/                 # Gute und bewusst ungültige Flows
```

**Hinweis zur Vertragspflege:** JSON Schema ist der plattformübergreifende Vertrag. TypeScript- und C#-Modelle werden möglichst daraus abgeleitet oder mit Conformance-Tests gegen dieselben Fixtures geprüft. Es darf nicht unbemerkt zwei verschiedene Semantiken für Typkompatibilität geben.

---

## 4. Phase 1 – Gemeinsames Typsystem und Flow-Dateiformat

### 4.1 Typsystem

Ein deklaratives, unabhängig von TypeScript und C# interpretierbares Modell implementieren:

- `string`, `number`, `boolean`, `null`
- `array<T>`, `object{...}`, `optional<T>`
- `entity<name>` und `entityRef<name>`
- Versionierte Typ-IDs (`crm.Contact@1`)

Beispiel:

```json
{
  "id": "crm.Contact@1",
  "kind": "entity",
  "fields": {
    "id": { "kind": "string" },
    "name": { "kind": "string" },
    "age": { "kind": "number", "optional": true }
  }
}
```

**Trennung:** Ein `entity`-Typ beschreibt die Struktur beziehungsweise fachliche Identität. Ein tatsächliches C#-`Contact`-Objekt ist **kein** JSON-Wert. Ein `entityRef<Contact>` kann dagegen ein serialisierbarer Schlüssel sein.

### 4.2 Typkompatibilität

`isAssignable(source, target)` prüft beispielsweise:

- `string → string`: erlaubt
- `string → number`: abgelehnt
- `entity<crm.Contact@1> → entity<crm.Company@1>`: abgelehnt
- Objekt-Felder und Array-Elemente rekursiv
- `optional`-Semantik explizit

**Grenze der statischen Prüfung:** Die Flow-Validierung prüft das deklarierte Runtime-Typsystem. Für dynamisch aus Adam-Metadaten erzeugte Typen kann C# oder TypeScript keine statische Compile-Time-Garantie versprechen. Deshalb werden Node-Outputs und Boundary-Payloads **zusätzlich zur Laufzeit** gegen ihre Schemas geprüft.

### 4.3 Flow-Schema

Ein Flow enthält:

- `schemaVersion`, `id`, `version`, `mode` (`backend` oder `interactive`)
- `nodes` mit `id`, `type`, `typeVersion`, `environment`, `config`
- `connections` mit Quell-/Ziel-Node und Ports
- Optionalen `entryNodeId`, später Trigger und Kontrollfluss

Für den PoC reichen **gerichtete azyklische Flows (DAG)**; Schleifen, parallele Pfade und asynchrone Wartezustände werden erst danach erweitert.

**Akzeptanzkriterien**

- [ ] Versionierte Typ- und Flow-Schemas vorhanden
- [ ] JSON-Roundtrip mit gleichen Inhalten
- [ ] Typprüfung erkennt inkompatible Ports
- [ ] Browser und .NET validieren gemeinsame Fixtures konsistent

---

## 5. Phase 2 – Deklarative Node-Kataloge und Implementierungen

### 5.1 Node-Definition

```json
{
  "type": "crm.contact.get",
  "version": 1,
  "environments": ["server"],
  "inputs": {
    "id": { "kind": "string" }
  },
  "outputs": {
    "contact": { "kind": "entity", "name": "crm.Contact@1" }
  }
}
```

Die **Definition** ist als JSON transportierbar. Die **Implementierung** bleibt im Environment.

### 5.2 C#-Implementierung und Jint-Binding

Beispiel einer C#-seitigen Registry (schematische API):

```csharp
serverNodes.Register(
    type: "crm.contact.get",
    version: 1,
    execute: (context, inputs) =>
    {
        var id = inputs.GetString("id");
        var contact = context.Contacts.GetById(id);
        return NodeResult.From("contact", contact);
    });
```

Der generierte JavaScript-Code ruft **nur eine erlaubte Host-Funktion** auf, etwa:

```javascript
const result = host.invokeNode("crm.contact.get", 1, { id: inputId });
```

`host.invokeNode` ist ein von C# bereitgestellter, eng begrenzter Adapter. Er löst erlaubte Node-IDs auf und ruft ihre C#-Implementierungen auf. **Keine generische Reflexion, keine beliebigen .NET-Objektzugriffe aus Flow-JavaScript.** Falls Node-Funktionen asynchron sind, muss die Schnittstelle an Jints tatsächliches Ausführungsmodell angepasst werden; für den PoC zunächst synchrone Mock-Implementierungen verwenden.

### 5.3 Browser-Implementierungen

```typescript
browserNodes.register("ui.display", 1, ({ value }) => {
  // Übergabe an einen Playground-State, den Svelte rendert
  playgroundStore.set(value);
  return {};
});
```

Der Node-Katalog im Editor/Playground entsteht aus beiden Umgebungen. Ein `math.add`-Node kann in beiden Umgebungen registriert sein; `ui.display` nur im Browser.

### 5.4 Dynamische Entity-Nodes

Der Server erzeugt beim Start aus Test-Metadaten ein Schema für `Contact` und daraus `crm.contact.get`. Ein Endpoint liefert den **deklarativen** Node-Katalog an das Frontend. Der Browser kann deshalb Typen und erlaubte Verbindungen kennen, ohne Zugriff auf die C#-Implementierung zu haben.

**Akzeptanzkriterien**

- [ ] Node-Definition und Implementierung sind entkoppelt
- [ ] C#-Nodes sind über eine kontrollierte Jint-Host-API aufrufbar
- [ ] Browser-Nodes können in JavaScript ausgeführt werden
- [ ] Der Server liefert dynamisch erzeugte Definitionen als JSON-Katalog
- [ ] Registry-Lookup berücksichtigt Node-Version und Environment

---

## 6. Phase 3 – Transportfähigkeit und Objektidentität

### Innerhalb des Servers

```text
C# GetContact → echtes Contact-Objekt → C# InspectContact
```

Die Server-Runtime hält Resultate in einem **serverseitigen Value Store**, beispielsweise `Dictionary<PortKey, object>`. Zwei Server-Nodes innerhalb derselben Execution erhalten dieselbe Referenz, sofern der Flow das vorgibt.

> **Wichtig:** Ein Aufruf über `host.invokeNode` darf dieses Objekt nicht versehentlich zu JSON oder einem simplen JS-Objekt konvertieren. Für serverinterne komplexe Werte besser einen undurchsichtigen Handle im Jint-Kontext verwenden; der C#-Host löst ihn gegen den Value Store auf. Referenzgleichheit und Laufzeittyp werden ausdrücklich getestet.

### Zwischen Server und Browser

```text
C# Contact → explizite Projektion/Codec → JSON → Browser ContactDTO
```

Für den PoC wird die Grenze **tatsächlich durch `JSON.stringify`/`JSON.parse` beziehungsweise HTTP-JSON** erzwungen; ein In-Memory-Objekt wird nie direkt übergeben.

Mögliche Verträge:

- `ContactRuntimeObject`: nur serverlokal, **nicht** transportierbar
- `ContactDTO@1`: transportierbar, Schema + Codec
- `EntityRef<Contact>@1`: transportierbar als ID + Typreferenz; empfangende Runtime löst bei Bedarf neu auf

### Codec-Vertrag

Ein Codec besitzt `typeId`, `version`, `encode`, `decode` und Schema-Validierung. Registrierte Codecs müssen **auf beiden Seiten kompatibel** sein; ein Codec allein auf dem Server reicht nicht.

Der Compiler überprüft für jede environmentübergreifende Verbindung:

1. Port-Typkompatibilität
2. Transportfähigkeit des Quelltyps
3. Verfügbarkeit eines passenden Wire-Formats/Codecs
4. Rekonstruierbarkeit/Verarbeitbarkeit auf der Zielseite

Eine Verbindung `ContactRuntimeObject → ui.display` wird **abgewiesen**. Erst über `toContactDTO` ist sie zulässig.

**Akzeptanzkriterien**

- [ ] C#-Objektidentität bleibt bei serverinternen Node-Verbindungen erhalten
- [ ] Fehlender Codec führt vor der Ausführung zu einem Validierungsfehler
- [ ] DTO-Roundtrip funktioniert über echtes JSON
- [ ] Manipulierte oder inkompatible Payloads werden am Ziel verworfen

---

## 7. Phase 4 – Validator, Execution Plan und JavaScript-Generierung

### Pipeline

```text
Flow JSON
  → JSON-Schema-Validierung
  → Node Catalog auflösen
  → Ports & Typen prüfen
  → Execution Modes/Environments prüfen
  → Boundary-Transport prüfen
  → Execution Plan aufbauen
  → pro Environment JS-Segmente erzeugen
  → Runtime-Ausführung
```

Der **Execution Plan** enthält Node-IDs, Reihenfolge/Abhängigkeiten, Environment-Zuordnung, erwartete Typen und explizite Transport-Grenzen.

Für den PoC sollte die JS-Codegenerierung besonders klein gehalten werden:

```javascript
// Schematisches generiertes Server-Segment:
const contact = host.invokeNode("crm.contact.get", 1, { id: inputs.id });
const dto = host.invokeNode("crm.contact.toDto", 1, { contact });
host.completeSegment({ dto });
```

Dabei ist `contact` bei Bedarf ein **opak verwalteter Handle** auf ein echtes C#-Objekt. `host.completeSegment` darf nur Werte ausgeben, die für die geplante Boundary validiert und encodiert wurden.

**Sicherheits- und Kompatibilitätsgrenzen für Jint**

- Nur generierten, zuvor validierten JavaScript-Code ausführen.
- Keine unkontrollierte .NET-Interop und keine Freigabe allgemeiner Host-Objekte.
- Jint-Execution-Limits konfigurieren: Zeit, Statements und Speicher soweit von der verwendeten Version unterstützt.
- Node-Berechtigungen, Eingaben und Ausgaben auf dem Server erneut prüfen.
- Kein `eval` aus Flow-Konfiguration, keine frei importierbaren Module.
- Festlegen, wie Fehler, Timeouts und abgebrochene Segmente zurückgemeldet werden.

**Akzeptanzkriterien**

- [ ] Ungültige Flows werden vor dem Kompilieren abgelehnt
- [ ] Compiler erkennt alle Runtime-Grenzen
- [ ] Server-Segment läuft tatsächlich in Jint
- [ ] Browser-Segment läuft tatsächlich in der Browser-JS-Engine
- [ ] Ergebnis eines Segments wird typisiert ans nächste übergeben
- [ ] Fehler lassen sich auf `executionId` und `nodeId` zurückführen

---

## 8. Phase 5 – Orchestrierung und interaktive Ausführung

### Startvarianten

**`mode: backend`**

- Enthält keine Browser-only-Nodes.
- Kann ohne Browser-Session ausgeführt werden.

**`mode: interactive`**

- Benötigt **beim Start** eine aktive, gebundene Browser-Session.
- Ohne Session wird die Startanforderung abgelehnt; der Flow beginnt nicht.
- Jeder Browser-Schritt wird an genau diese Session adressiert.

### Minimaler Handshake

```text
Svelte Playground                 ASP.NET Core
      |                                 |
      | POST /sessions                  |
      |-------------------------------->|
      | sessionId                       |
      |<--------------------------------|
      |                                 |
      | POST /executions                |
      | {flowId, sessionId, input}       |
      |-------------------------------->|
      | executionId                     |
      |<--------------------------------|
      |                                 |
      | GET /executions/{id}/next       |
      |-------------------------------->|
      | Browser-Segment + Inputs        |
      |<--------------------------------|
      |                                 |
      | POST /executions/{id}/result    |
      |-------------------------------->|
```

Für den PoC reichen einfache HTTP-Endpunkte und Polling. `sessionId` ist ein **temporärer Test-Mechanismus, keine Produktionsauthentifizierung**. In der produktiven Umsetzung muss sie kryptographisch geschützt und an einen authentifizierten Client gebunden sein.

### Minimaler Execution State

`created → running → waiting_for_browser → running → completed | failed`

Bei fehlender Session am Start: `rejected` ohne begonnene Execution. Bei Abbruch während des Flows: zunächst `failed` mit eindeutiger Fehlermeldung. Resume und Reconnect sind Folgeschritte.

**Akzeptanzkriterien**

- [ ] Backend-Flow startet ohne Browser
- [ ] Interaktiver Flow startet nur mit gebundener Session
- [ ] Browser-/Server-Segmente wechseln korrekt
- [ ] Ein anderer Browser kann kein Resultat für diese Session abgeben
- [ ] Verlorene Session führt zu definiertem Fehler, nicht zu Endlos-Warten

---

## 9. Phase 6 – Svelte Playground

Der Playground ist **kein grafischer Flow-Editor**. Er ist eine kleine Oberfläche zum Testen und Debuggen.

Er bietet:

- Laden einer versionierten Beispiel-Flow-JSON-Datei
- Anzeigen des dynamischen Node-Katalogs vom Server
- Anzeige von Validierungsfehlern (Node, Port, Typ, Environment)
- Interaktive Flow-Ausführung starten
- Eingabe einer Contact-ID
- Timeline mit Segment-/Node-Ausführungen und Boundary-Wechseln
- Anzeige der Browser-Ergebnisse und Fehler

Die Svelte-Komponenten dürfen keine fachliche Flow-Logik enthalten. Sie kommunizieren ausschließlich mit `runtime-browser` und dem Server-Orchestrator.

---

## 10. Zentrale End-to-End-Szenarien

### Positiver Test: Browser → Server → Browser

```text
Browser: input.contactId        string
              |
              | JSON-Boundary
              v
Server:  crm.contact.get        C# Contact-Instanz
              |
              | Referenz/Handle ohne JSON
              v
Server:  crm.contact.inspect    dieselbe C# Instanz
              |
              v
Server:  crm.contact.toDto      ContactDTO@1
              |
              | Codec + JSON-Boundary
              v
Browser: ui.displayContact      ContactDTO@1
```

**Nachweis:** Der Flow wird aus JSON geladen und validiert; Server-Segmente laufen unter Jint, C#-Nodes arbeiten mit echten Objekten; Browser-Segmente laufen in Svelte/JavaScript; die zwei Boundary-Übergänge sind explizit und typgesichert.

### Negative Tests

| Test | Erwartetes Verhalten |
|---|---|
| `string → number` | Flow-Validierung schlägt fehl |
| `ContactRuntimeObject → Browser` ohne Codec | Boundary-Validierung schlägt fehl |
| `ContactDTO` mit fehlendem Pflichtfeld | Runtime-Input-Validierung schlägt fehl |
| `ui.displayContact` im Backend-only-Flow | Environment-Validierung schlägt fehl |
| Interaktiver Start ohne Browser-Session | Start wird abgelehnt |
| Browser meldet Ergebnis für fremde Session | Resultat wird abgelehnt |
| Node im Server-Katalog nicht registriert | Kompilierung/Start wird abgelehnt |
| Jint-Ausführung überschreitet Limit | Execution schlägt kontrolliert fehl |
| Ungültige JSON-Flow-Version | Schema-/Versionsprüfung schlägt fehl |

### Objektidentitätstest

Das durch `crm.contact.get` bereitgestellte C#-Objekt wird in `crm.contact.inspect` mit Referenzgleichheit geprüft (`ReferenceEquals` oder äquivalenter Value-Store-Test). Dieser Test darf **keine Serialisierung zwischen den beiden Server-Nodes** auslösen.

---

## 11. Arbeitspakete in sinnvoller Reihenfolge

### Meilenstein A – Datenvertrag

- [ ] Gemeinsames JSON-Schema für Flows, Nodes, Typen und Nachrichten
- [ ] Type Registry und `isAssignable`
- [ ] Beispiel-Entity `Contact` und typisierte Node-Definitionen
- [ ] Contract-Fixtures mit gültigen/ungültigen Dateien

**Ergebnis:** Browser und Server können denselben Flow und Katalog verstehen.

### Meilenstein B – Zwei Runtimes

- [ ] ASP.NET-Core-API und Jint-Host mit minimaler, erlaubter Host-API
- [ ] C#-Node-Registry und In-Memory-Contact-Repository
- [ ] Svelte-App und Browser-Node-Registry
- [ ] Node-Catalog-Endpoint für dynamisch generierte Entity-Nodes

**Ergebnis:** Jede Runtime kann Nodes isoliert ausführen.

### Meilenstein C – Typsichere Boundaries

- [ ] Codec Registry und Wire-Format für `ContactDTO@1`
- [ ] Boundary-Validator für Port-Typen und Transportfähigkeit
- [ ] C# Value Store für echte Objektinstanzen
- [ ] Negativtests für nicht transportierbare Entities

**Ergebnis:** Objektidentität bleibt lokal; Environment-Grenzen sind explizit abgesichert.

### Meilenstein D – Compiler und Orchestrierung

- [ ] Execution Plan aus validiertem Graphen
- [ ] Generierte, Jint-kompatible Server-JS-Segmente
- [ ] Generierte Browser-JS-Segmente
- [ ] Minimaler HTTP-Transport und Session-Handshake
- [ ] In-Memory-Execution-State mit Fehlerbehandlung

**Ergebnis:** Ein Flow wechselt kontrolliert zwischen Browser und Server.

### Meilenstein E – End-to-End-Nachweis

- [ ] Svelte-Playground startet den Demo-Flow
- [ ] Alle positiven und negativen Tests laufen automatisiert
- [ ] Jint-Kompatibilität, Grenzen und offene Risiken dokumentiert
- [ ] Architekturentscheidung: Fortsetzen, anpassen oder verwerfen

**Ergebnis:** Technische Machbarkeit ist reproduzierbar nachgewiesen.

---

## 12. Definition of Done

Der PoC ist erfolgreich, wenn **alle** folgenden Punkte nachgewiesen sind:

- [ ] Ein Flow wird als JSON gespeichert, geladen und versionsgeprüft.
- [ ] Nodes werden aus dynamisch erzeugten Entity-Metadaten typisiert.
- [ ] Der Browser erhält deklarative Server-Node-Definitionen ohne ausführbaren C#-Code.
- [ ] Der Compiler weist inkompatible Port-Typen zuverlässig zurück.
- [ ] Server-JavaScript wird **wirklich durch Jint** ausgeführt und ruft registrierte C#-Nodes auf.
- [ ] Browser-JavaScript wird im **Svelte-Frontend** ausgeführt.
- [ ] Echte C#-Objekte bleiben zwischen Server-Nodes referenzidentisch.
- [ ] Nicht transportierbare Objekte können nicht unbemerkt in den Browser gelangen.
- [ ] Transportierte DTOs werden auf beiden Seiten validiert.
- [ ] Ein vollständiger Flow **Browser → Server → Browser** funktioniert.
- [ ] Backend-only-Flows funktionieren ohne Client.
- [ ] Interaktive Flows benötigen **bereits beim Start** eine Browser-Session.
- [ ] Die Negativtests liefern gezielte, nachvollziehbare Fehlermeldungen.
- [ ] Der Flow-Compiler und die Node-Registry bleiben unabhängig von Adam.

---

## 13. Offene Architekturfragen nach dem PoC

1. **Wo lebt der Compiler langfristig?** TypeScript-Compiler im Build-/Authoring-Service, oder wird der Execution Plan zusätzlich serverseitig in C# erstellt und überprüft?
2. **Wie wird vertrauenswürdiger generierter Code verteilt?** Versionierte Artefakte/Signaturen statt vom Browser gelieferter ausführbarer JS-Quelltexte.
3. **Wie sieht der endgültige C#-Objektzugriff aus?** Opaque Handles, Lebensdauer, Ownership und Freigabe im Value Store.
4. **Wie werden asynchrone C#-Nodes unterstützt?** Jint-Host-API, Scheduling und mögliche Segment-Unterbrechungen.
5. **Wie werden Flow-Kontrollfluss und Parallelität modelliert?** Branches, Loops, Fehlerpfade, Join-Semantik.
6. **Wie werden länger laufende interaktive Flows wiederaufgenommen?** Persistenz, Reconnect, Timeouts, idempotente Schritte.
7. **Wie werden Node-Katalog und Schemas versioniert?** Migration bestehender Flows bei Entity-Schema-Änderungen.
8. **Wie werden Berechtigungen durchgesetzt?** Authentifizierte Sessions, Server-Autorisierung jeder Node und jedes Datensatz-Zugriffs.

**Empfehlung:** Erst den einfachen DAG mit zwei tatsächlichen JavaScript-Runtimes (Browser und Jint) und einer expliziten JSON-Boundary beweisen. Danach Compiler, Editor, Adam-Adapter und verteilte Execution weiter ausbauen.
