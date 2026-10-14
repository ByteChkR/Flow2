# Nodes entwickeln und dokumentieren

[Home](../) / **Nodes entwickeln und dokumentieren**

Eine Node-Definition enthält mindestens Typ, Version, Laufzeiten, Ein- und Ausgänge. `metadata` liefert Label, Beschreibung, Kategorie sowie Beschreibungen und Reihenfolge der Ports. `config` beschreibt editierbare Konfigurationsfelder mit Typ, Standardwert, Optionen und Metadaten. Kontrollfluss-, Graph-, Wert-, Query-, EF- und UI-Bindungen ergänzen die Definition für die jeweilige Node-Familie.

Eine Node muss auf beiden Laufzeiten denselben Vertragskern besitzen, wenn sie mit derselben ID in Browser und Backend registriert wird. Ports sind nach dem Typmodell in `@adam-flow/core` bzw. `Adam.Flow2.Contracts` zu beschreiben. Neue Node-Versionen erhalten eine neue Versionsnummer; gespeicherte Graphen referenzieren Typ und Version.

## Gemeinsame Beschreibungen

Die produktiven Pakete unter `local/` beziehen ergänzende deutsche Node- und Input-Beschreibungen aus `local/packages/core/src/contracts/node-descriptions.json`. Der Browser importiert diese Datei; das Backend bindet dieselbe Datei als Assembly-Ressource ein. Die Registries und die spezialisierten Definitionsfabriken ergänzen damit `metadata.description` und `metadata.inputs[port].description`. Bereits gesetzte Beschreibungen und sonstige Metadaten bleiben erhalten. Dynamische Record-Felder, Listenelemente, Query-Parameter und Graph-Eingänge erhalten Beschreibungen anhand ihrer Portnamen beziehungsweise Labels.

Neue Standard-Nodes erhalten dort einen Eintrag mit ihrem vollständigen Typnamen und den tatsächlichen Input-Schlüsseln. Anwendungsspezifische Nodes außerhalb dieses Katalogs liefern ihre Beschreibungen weiterhin selbst. Metadaten ändern weder Portverträge noch das Laufzeitverhalten.

Der Coverage-Test prüft die realen Standardkataloge beider Laufzeiten, UI-Nodes und spezialisierte Definitionen auf vollständige Beschreibungen und vergleicht gemeinsame Input-Texte:

```bash
cd local
node --test tests/node-metadata.test.mjs
```

## Generierte Referenz

Die [Flow2-Referenz](../generated/index.html) führt zur [Standard-Node-Referenz](../generated/nodes/index.html) und zur [Typreferenz](../generated/types/index.html). Sie entstehen aus den real registrierten Standard-Nodes:

```bash
cd /home/tim/projects/work/adam/Adam.Flow2
./scripts/generate-node-documentation.sh
```

Das Skript startet einen kleinen, nur Metadaten ausgebenden .NET-Kataloghost und bündelt die Browser-Registry aus den Quellen. Anschließend vereinigt es beide Kataloge, prüft übereinstimmende Portverträge und schreibt die statische HTML-Referenz nach `docs/generated/`: eine durchsuchbare Übersicht sowie eine Einzeldatei pro Node und allgemeinem Typvertrag. Node-Panels sind direkt anklickbar. Die Typreferenz führt generische Verträge wie `Array<T>` getrennt. Spezialisierungen wie `Array<string>` werden nicht als statische Seiten erzeugt: Der Port-Link lädt sie über eine gemeinsame dynamische Typansicht, die auf den generischen Vertrag zurückverweist. Die Struktur wird zusätzlich als Typdiagramm gezeigt. Fachliche Adam-Nodes sind absichtlich nicht enthalten: Sie gehören zum jeweiligen Anwendungskatalog und werden dort registriert.

Die Dateien unter `docs/generated/` werden eingecheckt, damit sie ohne lokale Toolchain lesbar bleiben. Bei Änderungen an einer portablen Standard-Node muss das Skript erneut laufen.
