# Nodes entwickeln und dokumentieren

[Home](../) / **Nodes entwickeln und dokumentieren**

Eine Node-Definition enthält mindestens Typ, Version, Laufzeiten, Ein- und Ausgänge. `metadata` liefert Label, Beschreibung, Kategorie sowie Beschreibungen und Reihenfolge der Ports. `config` beschreibt editierbare Konfigurationsfelder mit Typ, Standardwert, Optionen und Metadaten. Kontrollfluss-, Graph-, Wert-, Query-, EF- und UI-Bindungen ergänzen die Definition für die jeweilige Node-Familie.

Eine Node muss auf beiden Laufzeiten denselben Vertragskern besitzen, wenn sie mit derselben ID in Browser und Backend registriert wird. Ports sind nach dem Typmodell in `@adam-flow/core` bzw. `Adam.Flow2.Contracts` zu beschreiben. Neue Node-Versionen erhalten eine neue Versionsnummer; gespeicherte Graphen referenzieren Typ und Version.

## Generierte Referenz

Die [Flow2-Referenz](../generated/index.html) führt zur [Standard-Node-Referenz](../generated/nodes/index.html) und zur [Typreferenz](../generated/types/index.html). Sie entstehen aus den real registrierten Standard-Nodes:

```bash
cd /home/tim/projects/work/adam/Adam.Flow2
./scripts/generate-node-documentation.sh
```

Das Skript startet einen kleinen, nur Metadaten ausgebenden .NET-Kataloghost und bündelt die Browser-Registry aus den Quellen. Anschließend vereinigt es beide Kataloge, prüft übereinstimmende Portverträge und schreibt die statische HTML-Referenz nach `docs/generated/`: eine durchsuchbare Übersicht sowie eine Einzeldatei pro Node und allgemeinem Typvertrag. Node-Panels sind direkt anklickbar. Die Typreferenz führt generische Verträge wie `Array<T>` getrennt. Spezialisierungen wie `Array<string>` werden nicht als statische Seiten erzeugt: Der Port-Link lädt sie über eine gemeinsame dynamische Typansicht, die auf den generischen Vertrag zurückverweist. Die Struktur wird zusätzlich als Typdiagramm gezeigt. Fachliche Adam-Nodes sind absichtlich nicht enthalten: Sie gehören zum jeweiligen Anwendungskatalog und werden dort registriert.

Die Dateien unter `docs/generated/` werden eingecheckt, damit sie ohne lokale Toolchain lesbar bleiben. Bei Änderungen an einer portablen Standard-Node muss das Skript erneut laufen.
