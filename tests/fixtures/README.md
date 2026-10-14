# Gemeinsame Fixtures

`v1/assignability.json`, `flows.json`, `schemas.json`, `values.json` und `parsing.json` definieren
Gültigkeit und semantische Fehlercodes unabhängig von einer Implementierung.
Vitest, der Browser-Harness und xUnit lesen dieselben Dateien. Die vier Beispiele
unter `contracts/examples/v1` werden zusätzlich mit typisierten Modellen roundgetrippt.

Die xUnit-Projekte kopieren Fixtures und Beispiele in ihr Ausgabeverzeichnis.
TypeScript importiert sie direkt. Neue Fälle hier ergänzen, damit beide Implementierungen
nicht unbemerkt auseinanderlaufen. Die Anzahl oder Formulierung einzelner JSON-Schema-
Diagnosen ist bibliotheksabhängig; Gültigkeit und semantische Fehlerklassen nicht.

`tooling/json-roundtrip.json` ist weiterhin nur der Infrastruktur-Smoke-Test,
keine Flow-Datei und kein Typvertrag.

`v1/boundaries.json` enthält 18 Fälle zur Transportfähigkeit und beidseitigen
Codec-Kompatibilität; `v1/payloads.json` enthält zwölf gültige oder manipulierte
Wire-Nachrichten. Beide Sprachen verwenden dieselben Erwartungen. Weitere Tests
prüfen Encoder/Decoder, Compiler, HTTP und lokale CLR-Identität.
