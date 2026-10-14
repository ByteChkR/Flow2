# Optimierungen und Benchmarks

[Home](../) / **Optimierungen und Benchmarks**

Die Laufzeit trennt bewusst zwischen semantischer Arbeit — Node-Implementierung, Datenbank, UI und Netzwerk — und infrastrukturellem Aufwand — Katalogaufbau, Validierung, Planerstellung, Segmentwechsel und Subgraph-Aufrufe. Optimierungen dürfen nur vorbereitete, unveränderliche Metadaten wiederverwenden. Ausführungskontexte, Entities und scoped Services werden nie global gecacht.

## Messmodell

Bei aktivem Profiling entstehen Trace-Ereignisse für Lauf, Vorbereitung, HTTP, Dispatch, Segmente, Nodes, Boundaries und Kindaufrufe. Für Nodes werden insbesondere `implementationMs`, `waitMs` und `overheadMs` erfasst. Damit lässt sich unterscheiden:

| Kennzahl | Bedeutung |
| --- | --- |
| Self / `implementationMs` | Zeit innerhalb der Node-Implementierung |
| System / `overheadMs` | Runtime-, Validierungs-, Scheduling- und Trace-Aufwand rund um die Node |
| `waitMs` | Warten auf eine vorherige Datenabhängigkeit |
| Segmentzeit | gesamte Zeit eines zusammenhängenden Browser- oder Backendabschnitts |
| `childWait` | Wartezeit eines aufrufenden Graphen auf den Subgraphen |
| Vorbereitung | Registry, Spezialisierung, Validierung und Planerstellung vor dem Lauf |

Summen von Node-Zeiten sind nicht immer gleich der Wanduhrzeit: Abhängigkeiten, Warteschlangen und verschachtelte Ausführungen überlappen oder enthalten Wartezeit. Die Statistics-Ansicht sollte deshalb Lauf-, Segment- und Node-Ebene getrennt darstellen.

## Backend-Optimierungen

Die Backend-Flags werden beim Prozessstart aus `FLOW2_OPT_PLAN_CACHE`, `FLOW2_OPT_VALIDATION_REUSE`, `FLOW2_OPT_REGISTRY_METADATA`, `FLOW2_OPT_REGISTRATION_FILTER`, `FLOW2_OPT_RUNTIME_INDEXES`, `FLOW2_OPT_CONTRACT_METADATA_CACHE` und `FLOW2_OPT_FAST_CONTRACT_VALIDATION` gelesen. Sie sind standardmäßig aktiviert und ändern weder Graph-JSON noch die fachliche Semantik. Für A/B-Messungen lassen sie sich mit `false` oder `0` abschalten.

| Mechanismus | Wirkung | Begrenzung / Invalidierung |
| --- | --- | --- |
| Plan-Cache | speichert validierte `ExecutionPlan`- und Katalogmetadaten | Schlüssel enthält Compiler-, Kennzeichnungs-, Runtime-, Flow-, Bundle-, Session- und Codec-Daten; maximal 128 Einträge und 32 MiB |
| Wiederverwendung der Validierung | akzeptiert nur serverseitig registrierte Freigaben und Preflight-Ergebnisse | Freigabe enthält Bundle-Hash, Runtime-Basis und Browser-Fingerprint; Validierungs-Cache höchstens 128, Preflight-Cache höchstens 256 Einträge |
| stabiler Basiskatalog | baut bei konstanter `PreparationVersion` den Standardkatalog nicht pro Lauf neu | Cache wird bei Versionswechsel verworfen |
| Registry-Metadaten / Registrierungsfilter | reduziert Registrierungsarbeit auf die für den Flow relevanten Definitionen | nur Metadaten und Auswahl, keine Wiederverwendung von scoped Implementierungen |
| Runtime-Indizes | beschleunigen Lookups innerhalb eines vorbereiteten Plans | nur abgeleitete, unveränderliche Planindizes |
| Contract-Metadaten / schnelle Vertragsprüfung | vermeidet wiederholte Aufbereitung unveränderlicher Vertragsmetadaten | bleibt pro Prozess; der zugrunde liegende Vertrag wird weiterhin geprüft |

Der `Orchestrator` serialisiert Cache-Misses und die Planerstellung unter seinem Gate. Dadurch kompiliert eine Gruppe gleichzeitiger identischer Anfragen höchstens einmal. Der Trade-off ist absichtlich: kurze Vorbereitungsphasen werden zugunsten konsistenter, mehrfach nutzbarer Metadaten serialisiert.

## Browser- und Subgraph-Optimierungen

`SubgraphOptimizations` ist ein explizites Optionsobjekt für Messungen und Experimente. Es gehört nicht in gespeicherte Flow-Daten. Einige bereits bewährte Browser-Optimierungen sind standardmäßig aktiv und können mit `false` abgeschaltet werden; andere sind opt-in.

| Option | Standard | Zweck |
| --- | --- | --- |
| `localValidationReuse` | an | prüft denselben lokalen Subgraph innerhalb eines Laufs nicht mehrfach |
| `browserWireSchemaCache` | an | memoisiert die abgeleitete Wire-Schema-Prüfung während der Vorbereitung |
| `browserRuntimeIndexes` | an | verwendet Indizes für häufige Runtime-Lookups |
| `localCatalogSnapshot` | aus | verwendet einen Katalog-Snapshot für lokale Subgraphen |
| `localPreparationCache` | aus | behält vorbereiteten Katalog und Plan für lokale Subgraphen |
| `localRegistryMetadata` | aus | erlaubt eine vorbereitete Registry-Factory für Metadaten |

Diese Optionen sind besonders bei vielen kleinen Subgraphen relevant. Sie sparen Wiederholung in Vorbereitung und Validierung, nicht die fachliche Arbeit der aufgerufenen Nodes. Ein Benchmark muss daher leere oder sehr kleine Subgraphen und einen repräsentativen Fachgraphen getrennt messen.

## Benchmark-Suite

Die Suite führt Browser-, Backend-, koordinierte und gemischte Läufe in mehreren Größen aus. Jede Probe schreibt Rohwerte, eine Zusammenfassung, das Manifest mit aktivierten Flags, Quellenfingerprints und gegebenenfalls Fehlerlogs. Beispiel:

```bash
cd /home/tim/projects/work/adam/Adam.Flow2/local
npm run benchmark -- --profile smoke --sizes 2 --samples 1 --warmups 0 --profiling true
npm run benchmark -- --profile full --sizes 10 --samples 5 --warmups 2
```

Für belastbare Vergleiche gilt:

1. Baseline mit allen untersuchten Flags ausführen.
2. Jede Optimierung einzeln gegen dieselbe Baseline messen.
3. Erst danach Paar- und Gesamtkombinationen vergleichen.
4. Warmups von Messproben trennen und immer Manifest/Fingerprint sichern.
5. Netzwerk- und Datenbanklatenz separat dokumentieren; die Standard-Suite misst den unabhängigen Host, nicht Adam-Fachnodes oder Produktionsnetzwerk.

Ein niedrigerer Vorbereitungswert rechtfertigt keine Änderung, wenn sich die Validierungsgrenze, die Cache-Invalidierung oder Fehlerdiagnostik verschlechtert. Die Cache-Schlüssel und Limits sind deshalb Teil des Designs, nicht lediglich Performance-Details.
