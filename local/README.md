# Editor und Flow als lokale Pakete

Hier liegt die aus **Adam produktiv verwendete Implementation** extrahierte Paketbasis. Die älteren Verzeichnisse im übergeordneten `Adam.Flow2` stammen aus dem ursprünglichen Prototyp. Für die Adam-Integration sind ausschließlich die Quellen unter `local/` maßgeblich.

Es gibt keine Veröffentlichung und keine neue CI-Pipeline. Adam installiert echte npm-Tarballs und NuGet-Pakete aus lokalen Verzeichnissen. Es werden keine Quellverzeichnisse nach Adam verlinkt oder zurückkopiert.

## Pakete und Verantwortlichkeiten

| Paket | Inhalt | Interne Abhängigkeiten |
| --- | --- | --- |
| `@adam/editor` | Ressourcenbaum, Tabs, Dokumente, Save Scopes, Dirty-State, Overlays, Navigation Guards, Meldungen | keine Flow-Abhängigkeit |
| `@adam-flow/core` | JSON-Verträge, Typen, Graphanalyse, Validierung, Compiler | keine Editor-/Runtime-Abhängigkeit |
| `@adam-flow/runtime-browser` | Browser-Runtime, Orchestrierung, Codecs, allgemeine Nodes, UI-Verträge | core |
| `@adam-flow/editor` | Flow-Provider, Canvas, Nodes, Graph-Konfiguration, Statistics, portable UI-Komponenten | editor, core, runtime-browser |
| `Adam.Flow2` | .NET-Verträge, Validierung, Runtime, Jint, allgemeine Nodes | keine Adam-/EF-/ASP.NET-Abhängigkeit |
| `Adam.Flow2.AspNetCore` | Koordinator, HTTP-Controllerbasis, Runtime Factory, Logging-/Progress-Ports, gebündelte Änderungsbenachrichtigungen | Adam.Flow2 |
| `Adam.Flow2.EntityFrameworkCore` | generische EF-Quellen, Query-/Entity-Nodes, Entity Policy | Adam.Flow2 |

In Adam bleiben: Anmeldung, Mandantenzuordnung, Persistenz, AdamAufgabe/Trigger, Geschäfts-Nodes, ITemplateService-Anbindung, konkrete EF-Policies, Konfigurations-/Detail-/Suchmasken, Page-Renderer und die vorhandene SignalR-Hub-Anbindung.

Für Vite sind die vier ESM-Pakete in `optimizeDeps.exclude` eingetragen. Damit löst das erstmalige Öffnen nachgeladener UI-Komponenten keine Optimizer-Neuladung des gesamten Editors aus.

Svelte 4 ist eine Peer Dependency; der Host stellt genau eine Svelte-Runtime bereit. TypeScript/JavaScript werden vor dem Packen kompiliert und mit Deklarationen ausgeliefert. Svelte-Komponenten bleiben zur Integration mit dem Host-Bundler als Svelte-Quellen im Paket. Das reduziert daher nicht automatisch die Arbeit des finalen Vite-Builds.

## Erstaufbau im bestehenden Checkout

Voraussetzungen: Node.js mit npm, .NET SDK 10, für Browserprüfungen ein Playwright-Chromium. Getestet mit Node 26.7 und Svelte 4.2.19. Externe Tool-Abhängigkeiten werden normal installiert; nur die eigenen Pakete kommen aus lokalen Archiven.

```bash
cd /home/tim/projects/work/adam/Adam.Flow2/local
npm ci
npm run bootstrap
```

`bootstrap` führt nacheinander aus:

1. Paketgrenzen prüfen, TypeScript bauen, vier `.tgz` und drei `.nupkg` erzeugen.
2. Die Archive in einem unabhängigen npm-Consumer installieren und einen .NET-Host gegen die NuGet-Pakete bauen.
3. Die vier Tarballs in Adam installieren, `backend/Flow2.LocalPackages.props` aktualisieren und die betroffenen Backend-Projekte wiederherstellen.

Die Archive stehen unter `artifacts/npm` und `artifacts/nuget`. `artifacts/latest.json` nennt die gemeinsame lokale Buildversion. Die gemeinsame Versionsnummer vereinfacht diesen lokalen Umbau; sie erzwingt keinen gemeinsamen künftigen Releasezyklus.

Die Adam-Repositories müssen benachbart unter `../../frontend` und `../../backend` liegen. **Nur `update-adam`/`bootstrap` benötigen diese Struktur**. Paketbau, unabhängige Tests, Demo und Benchmarks funktionieren ohne Adam-Checkout.

## Nach Änderungen

```bash
# Bauen, Consumer aktualisieren und Adam aktualisieren
npm run bootstrap

# Nur neue Paketarchive bauen
npm run build

# Bereits gebaute Archive in Adam installieren
npm run update-adam -- --no-build

# Bereits gebaute Archive im unabhängigen Consumer installieren
npm run prepare:consumer
```

Pakete in `node_modules` und Dateien in `dist`, `.build`, `bin`, `obj` werden nicht editiert. Änderungen gehören in `packages/*/src` bzw. `server/*`. Jede normale Paketerzeugung erhält eine neue lokale Version, damit npm und NuGet keine alten Inhalte derselben Version wiederverwenden. `FLOW_PACKAGE_VERSION` kann für reproduzierbare Archivnamen vorgegeben werden; eine bestehende Version mit verändertem Inhalt nicht erneut verwenden.

Ein frischer Checkout braucht zuerst `npm ci` **hier**, danach `bootstrap`; Adams Lockfile verweist auf generierte Archive, die vorher noch nicht existieren. Archive werden nicht ins Repository eingecheckt.

## Prüfungen und Demo

```bash
# Paketgrenzen, installierter Consumer, Editor-/Vertragstests und Benchmark-Smoke-Matrix
npm run verify

# Schneller: dieselben Funktionstests ohne Benchmark-Läufe
npm run verify -- --no-benchmarks

# Zusätzlich Adam-Typprüfung, Frontend-/Backend-Build und Backend-Integration
npm run verify -- --adam

# Unabhängiger Dokument-/Flow-Editor, http://127.0.0.1:4178
npm run demo
```

Falls Chromium noch fehlt: `npx playwright install chromium`. Alternativ `PLAYWRIGHT_CHROMIUM_EXECUTABLE` auf einen vorhandenen Chromium setzen.

Die Demo speichert zwei unterschiedliche Dokumenttypen im LocalStorage, verwendet dieselben Tabs und Save Scopes und kann ihren Flow lokal im Browser ausführen. Die Tests prüfen ausdrücklich installierte Tarballs. Sie verwenden weder TS-Aliase auf Paketquellen noch die alten Prototyp-Pakete im übergeordneten Repository.

`tests/ValueContracts` enthält die unabhängigen .NET-Vertragsfälle einschließlich gemeinsamer Fixtures. Adam-bezogene HTTP-, EF-, Persistenz- und UI-Integrationstests bleiben in den Adam-Repositories. `scripts/check-boundaries.mjs` verhindert Rückimporte aus Paketen nach Adam sowie unzulässige Abhängigkeiten zwischen den Paketen.

## Benchmark-Suite

```bash
# Kurze Abnahme: Baseline und Standardflags, alle acht Flows und vier Ausführungsarten
npm run benchmark -- --profile smoke --sizes 2 --samples 1 --warmups 0 --profiling true

# Jede einzelne Flag plus vollständig ausgeschaltete Baseline
npm run benchmark -- --profile single --sizes 10 --samples 5 --warmups 2

# Alle effektiven Kombinationen; bewusst ein sehr großer Lauf
npm run benchmark -- --profile full --sizes 10 --samples 5 --warmups 2
```

Modi: `browser`, `backend`, `coordinated`, `mixed`. Flows: `empty`, `chain`, `subgraph-repeat`, `subgraph-depth`, `map`, `aggregate`, `pingpong`, `default-values`. Weitere Optionen: `--modes`, `--cases`, `--profiling true,false`, `--timeout`, `--out`.

Die Suite startet einen frischen unabhängigen Backend-Host und Browser je Variante, prüft Ergebnisse, effektive Flags und reine lokale Ausführung ohne HTTP, trennt Cold/Warm/Warmup und schreibt `samples.csv`, `summary.csv`, Manifest, Quellenfingerprints, Traces und Fehlerlogs. Full-Matrix: 64 Browser-, 128 Backend- und jeweils 512 koordinierte/gemischte Flagvarianten. Netzwerk und DOM-Interaktionen einer echten Adam-Fachmaske werden damit nicht vollständig simuliert.

Der bisherige Befehl `npm run benchmark:flow2 -- ...` im Adam-Frontend delegiert auf diese Suite. Relative Ausgabepfade beziehen sich jetzt auf dieses Paketverzeichnis.

## Host-Schnittstellen

- Allgemeiner Editor: `configureEditorHost` für Theme, Icons und optionale Host-Komponenten; `configureResourceColors` für fachliche Providerfarben. Ressourcen/Views/Scopes werden über `createEditorStore` registriert.
- Flow-Editor: `configureFlowEditorHost` für Workspace-Erzeugung, Workspace-Persistenztransport, Konfigurationsdaten und fachliche Kennzeichnungen. Eine `GraphEditor`-Instanz kann ihren Workspace auch direkt als Prop erhalten.
- Große Adam-Dialoge und InteractionContent werden über asynchrone Component Loader nachgeladen. Die Paketaufteilung zieht diese Module nicht vorzeitig in den Editor.
- Browser-Runtime: `FlowWorkspace` akzeptiert eine Registry Factory, einen Fetch-Adapter und optional einen Wakeup-Subscriber. `registerCommonNodes` und `registerCommonCodecs` aus `@adam-flow/runtime-browser/registry.js` registrieren die gemeinsame Basis. Sowohl `createStandardRegistry` als auch Adams `createFlow2Registry` verwenden diese Funktionen. Danach ergänzt der Host seine Nodes und ruft `registerCatalogValueCodecs` für den vollständigen Katalog auf.
- Katalogerweiterungen: `registerGraphCatalogExtension` ermöglicht die UI-Katalogspezialisierung, ohne einen Rückimport aus dem Kern in die Runtime. `nodes/pages.js` registriert diese Erweiterung beim Import.
- Backend: `IFlowRuntimeFactory`, `IFlowChangeSink`, `IFlowLogSinkFactory`, `IFlowValidationProgress` sowie EF-Quellen/Policies sind die Erweiterungspunkte. `StandardFlowRegistry` dient unabhängigen Hosts. Es verwendet wie Adams `AdamFlow2Registry` die Methoden `CommonNodeRegistration.RegisterCommonNodes` und `RegisterCommonCodecs` aus dem Kernpaket. Adam ergänzt Geschäfts-Nodes, EF-Anbindungen und Scoped Services. Common-Codecs werden nur für neue Registries registriert; Metadaten-Forks übernehmen sie. `RegisterValues` wird nach den Host-Erweiterungen aufgerufen.
- `FlowControllerBase` definiert keinen anonymen produktiven Endpoint. Adams konkrete Controllerklasse behält Route, Autorisierung und die vertrauenswürdige Owner-Zuordnung. Der BenchmarkHost ist ausschließlich ein lokaler Entwicklungs-/Testhost auf Loopback.
- `FlowChangeDispatcher` bündelt Wakeups. Adams Adapter übernimmt ausschließlich Hub, Benutzer-/Mandantengruppe und Eventnamen. Ausführungsdaten oder Zugangsdaten werden nicht als Wakeup übertragen.

Die Bootstrap-Konfiguration gilt pro Anwendung. Mehrere Workspaces nutzen dieselben Host-Services; Dokumente, Runs und editorbezogene Zustände bleiben getrennt.

## Verträge und Kompatibilität

Node-IDs, gespeicherte Graphen, Flow-Schema 2 und Bundle-Schema 1 bleiben unverändert. npm und .NET beziehen die kanonischen JSON-Schemas sowie Regex-/Unicode-Daten aus `packages/core/src/contracts`. Bestehende Schema-/Vertragstests prüfen weiterhin die Ablehnung ungültiger Versionen und Werte. Die Paketversion ist eine Build-/Distributionsversion und wird nicht mit einer Graphversion gleichgesetzt. Es wurde kein neuer inkompatibler HTTP-Handshake eingeführt.

Exportierte Modulpfade stehen in den jeweiligen `package.json`-Dateien. `migration-map.json` dokumentiert die früheren Frontend-Pfade und ihre neuen Paketmodule. Kompatible Storage-Schlüssel und CSS-Klassennamen wurden bewusst beibehalten.

## Gemessene Abnahme

Siehe [VERIFICATION.md](VERIFICATION.md). Die Trennung ist ein Schritt zu kleineren Build-Abhängigkeiten, aber kein belegter Geschwindigkeitsgewinn des vollständigen Frontend-Builds. Registry-Veröffentlichung, unabhängige Releasepipelines, Remote-Paketquellen und CI werden anschließend separat eingerichtet.
