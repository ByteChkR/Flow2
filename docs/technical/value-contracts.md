# Wertverträge und gemeinsame Testfälle

[Home](../) / **Wertverträge und gemeinsame Testfälle**

Die portablen Wertoperationen werden im Browser und im Backend gegen dieselben Fixtures geprüft. Die Fixture-Sammlung liegt unter `local/tests/ValueContracts/Fixtures` und umfasst Skalare, zeitliche Werte, Text, JSON, Records, Dictionaries, Listenoperationen, Listensteuerung, Join-Operationen, Graphsteuerung und reguläre Ausdrücke.

## Skalare und Zeitwerte

- `Decimal` wird als kanonischer String repräsentiert; Browser-Code verwendet dafür keine JavaScript-`number`-Werte.
- `Int32`-Operationen sind geprüft. Division rundet gegen null; ungültige Bereiche und Division durch null schlagen fehl.
- `TimeSpan` arbeitet mit Ticks, nicht mit Kalenderzeiträumen.
- `DateTimeOffset` bewahrt seinen Offset bei Addition und vergleicht Zeitpunkte in UTC.
- `Guid`, `DateOnly`, `TimeOnly`, `DateTime`, `DateTimeOffset`, `TimeSpan` und `Decimal` besitzen eigene Codecs und Wertverträge.

## Pflege

Wertvertragsänderungen beginnen mit einer bewussten Änderung der Implementierung und ihrer Tests. Die Fixtures sind erwartete Verträge, keine zufälligen Snapshot-Dateien. Neue oder geänderte Fälle gehören in die passende JSON-Datei unter `local/tests/ValueContracts/Fixtures`, sodass Browser und Backend dieselbe Semantik prüfen.

Die Standard-Node-Referenz beschreibt die sichtbaren Nodes; diese Seite erklärt die darunterliegende, runtimeübergreifende Wertsemantik.
