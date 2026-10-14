# Lokale Abnahme · 14.10.2026

Die Adam-Integration verwendet `0.1.0-local.1791956257180` aus den lokalen Tarballs/NuGet-Paketen. Es wurde nichts veröffentlicht und keine CI geändert.

## Unabhängige Pakete

- `npm ci` erfolgreich mit eigenem `node_modules`; kein Symlink auf Adams Installation.
- Vier npm-Tarballs und drei NuGet-Pakete erfolgreich gebaut und lokal installiert.
- Paketgrenzen und kanonische Regex-Daten: 208 Module geprüft; kein Rückimport nach Adam, keine Runtime-Abhängigkeit im Flow-Kern, keine Flow-Abhängigkeit im allgemeinen Editor.
- Separater Aufbau unter `/tmp/adam-packages-independent-verification`, ohne Adam-Quellen: `npm ci --offline`, Paketbau, Installation, sechs JavaScript-/Browserprüfungen und 5.048 .NET-Vertragsprüfungen erfolgreich.
- Demo: allgemeines Textdokument und Flow im selben Editor, Speichern/Neuladen/Dirty-State, lokaler Browserlauf erfolgreich.

## Adam

- Frontend-Typprüfung erfolgreich.
- 63 Frontend-/HTTP-Tests gegen den echten Testhost erfolgreich, ohne übersprungene Fälle (einschließlich Query-Fixture, Hybrid-/Subgraphen, Listen, Text/Regex/JSON/Temporal, Retry/Timeout/ParallelMap).
- Vollständiger Vite-Produktionsbuild erfolgreich.
- Vollständiger .NET-Backend-Build erfolgreich.
- 1.087 Backend-Integrationsprüfungen erfolgreich, einschließlich HTTP, EF/SQLite, Subgraphen, Typidentitäten und nach Mandant/Benutzer getrennten SignalR-Wakeups.
- Präsentations-Nodes mit injiziertem Textprovider und Bildkontrakten erfolgreich geprüft.
- Katalogisolation einschließlich unveränderlicher CLR-/Typmetadaten erfolgreich geprüft.
- Browserprüfungen erfolgreich für gemischte Dokumenttypen, Subgraphen, Speichern/Wiederherstellung, Erfolgs-/Fehleransichten, hybride Graphen, optionale Inputs, Kennzeichnungen, Config-Editor und Page-Editor.
- Page-/HTML-/Interaction-Dialoge werden über Host-Loader nachgeladen. Vite überspringt die zusätzliche Dependency-Optimierung dieser ESM-Pakete; der Page-Test prüft die tatsächliche Vorschau und anschließende Übernahme ohne Seitenreload.

Einige vorhandene Browserfixtures nutzten noch die frühere Position von Graphaktionen bzw. die frühere Meldungsstruktur. Sie wurden auf Kontextmenü, „Zur Ursache“ und die aktuelle Workspace-Schnittstelle angepasst. Die fachlichen Prüfungen bleiben bestehen.

PostgreSQL-abhängige Persistenz-/Querytests wurden mangels `FLOW2_TEST_POSTGRES` nicht ausgeführt. Die EF-Integration mit SQLite und der vollständige Host-Build wurden geprüft. Keine produktive Datenbank wurde verändert.

## Benchmarks

| Lauf | Varianten | Cold-/Warm-Messungen | Fehler |
| --- | ---: | ---: | ---: |
| Alle acht Flows, vier Modi, alle Flags aus + Standardflags, Profiler an | 64 | 128 | 0 |
| Finale Pakete, vier Flows, vier Modi, Standardflags, Profiler aus | 16 | 32 | 0 |

[Erste Smoke-Matrix](docs/verification/package-smoke-2/summary.csv) · [Finale Paketprüfung](docs/verification/final-packages/summary.csv). Die benachbarten Manifeste und Rohdaten enthalten Flags, Version, Quellenfingerprint, Transportart und Einzelwerte. Die vollständige kombinatorische Matrix wird durch Tests auf Vollständigkeit geprüft und ist per `--profile full` ausführbar; sie wurde bei dieser Abnahme nicht vollständig gemessen.

Das sind Funktions- und Integrationsmessungen mit kleiner Graphgröße, keine belastbare Aussage über Produktivdurchsatz. Ein Host mit Adams vollständigem Katalog und Fach-Nodes hat andere Vorbereitungskosten als der unabhängige Standard-Host.

## Buildzeiten

Vor dem Umbau benötigte ein vollständiger Frontend-Build 58,33 s, der erste erfolgreiche Paket-Build von Adam 62,08 s. Beide waren einzelne Messungen mit vorhandenen Dependency-Caches. Der spätere vollständige Build benötigte 85,58 s bei gleichzeitig laufenden Integrationsprüfungen und ist zeitlich nicht vergleichbar.

Damit ist **kein Frontend-Buildzeitgewinn nachgewiesen**. Vite kompiliert weiterhin Svelte und bündelt die Anwendung; die Vorteile dieses Schritts sind die getrennten Projektgrenzen, separat baubare .NET-Assemblies und wiederverwendbare Paketartefakte. Für belastbare Clean-/Incremental-Vergleiche brauchen wir später isolierte, wiederholte Messungen.

Die Abnahmelogs liegen lokal unter `artifacts/verification-logs`. Reproduzierbare Befehle stehen in [README.md](README.md).
