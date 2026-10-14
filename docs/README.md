# Adam.Flow2-Dokumentation

**Home**

`local/` enthält die aktuelle, aus Adam extrahierte Paketbasis. Die übrigen Verzeichnisse im Repository-Stamm sind der frühere Prototyp und keine Integrationsgrundlage.

## Für Anwenderinnen und Anwender

- [Erste Schritte](user/getting-started.md): Einen Flow im Editor erstellen und ausführen.
- [Flows erstellen](user/authoring-flows.md): Ports, Verbindungen, Inline-Werte, Subgraphen und Laufzeiten.
- [Ausführung und Fehler](user/execution.md): Lokale, Backend- und koordinierte Ausführung.
- [Flow2-Referenz](generated/index.html): Einstieg in die Node- und Typdokumentation.
- [Standard-Node-Referenz](generated/nodes/index.html): Durchsuchbare Node-Panels mit Ports und Konfiguration.
- [Datentypen](generated/types/index.html): Generische Typen, ihre Spezialisierungen und skalare Werttypen.

## Für Entwicklung und Integration

- [Architektur](technical/architecture.md): Pakete, Zuständigkeiten und Abhängigkeitsgrenzen.
- [Lokale Entwicklung](technical/development.md): Build, Tests, Demo, Benchmarks und Adam-Aktualisierung.
- [Host-Integration](technical/integration.md): Registries, Browser- und Backend-Erweiterungspunkte.
- [Editor, Workspace und Graphschnittstellen](technical/editor-workspace.md): Entwürfe, Gruppen, Subgraphen, Kennzeichnungen und Layout.
- [Validierung und Fehlermodell](technical/validation.md): Prüfstufen, Boundaries, Freigaben und Fehlerherkunft.
- [Node-Entwicklung](technical/nodes.md): Verträge, Metadaten und die generierte Referenz.
- [Ausführungsmodell](technical/execution-model.md): Validierung, Compiler, Segmentierung und Runtime.
- [Laufzeit-Pipeline](technical/runtime-pipeline.md): Koordination, Zustände, Subgraph-Aufrufe und Vertrauensgrenzen.
- [Optimierungen und Benchmarks](technical/optimizations.md): Caches, Feature-Flags, Profiler und Messmethodik.
- [Verträge und Kompatibilität](technical/contracts.md): Versionierte JSON-Verträge und Persistenzregeln.
- [Wertverträge](technical/value-contracts.md): Gemeinsame Semantik und Fixtures für portable Werte.
- [Historischer Prototyp](technical/legacy-prototype.md): Abgrenzung der nicht mehr maßgeblichen Quellen.
- [Prüfnachweis vom 14.10.2026](technical/verification-2026-10-14.md): Historische Abnahme mit reproduzierbaren Befehlen.
