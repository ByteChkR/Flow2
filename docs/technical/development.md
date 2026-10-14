# Lokale Entwicklung

[Home](../README.md) / **Lokale Entwicklung**

Alle Befehle für die aktuelle Paketbasis werden aus `local/` ausgeführt.

## Voraussetzungen

- Node.js und npm
- .NET SDK 10
- Für Browserprüfungen: Playwright Chromium (`npx playwright install chromium`)
- Für `bootstrap` oder `update-adam`: benachbarte Checkouts `../../frontend` und `../../backend`

```bash
cd /home/tim/projects/work/adam/Adam.Flow2/local
npm ci
npm run bootstrap
```

`bootstrap` prüft Paketgrenzen, baut npm- und NuGet-Artefakte, installiert sie in einem unabhängigen Consumer und aktualisiert danach die benachbarten Adam-Checkouts. Ohne Adam-Checkouts stehen weiterhin Paketbau, Tests, Demo und Benchmarks zur Verfügung.

| Befehl | Zweck |
| --- | --- |
| `npm run build` | Lokale npm-Tarballs und NuGet-Pakete unter `artifacts/` erzeugen |
| `npm run update-adam -- --no-build` | Bereits gebaute Pakete in Adam installieren |
| `npm run prepare:consumer` | Artefakte in den unabhängigen Beispiel-Consumer installieren |
| `npm run test` | Paketnahe JavaScript- und Editormodelltests ausführen |
| `npm run verify` | Paketgrenzen, Consumer, Vertrags- und Benchmark-Smoke-Prüfungen ausführen |
| `npm run verify -- --adam` | Zusätzlich Adam-Integration, Frontend und Backend prüfen |
| `npm run demo` | Unabhängige Editor-/Flow-Demo auf `http://127.0.0.1:4178` starten |

`npm run build` vergibt absichtlich eine neue lokale Paketversion. Für reproduzierbare Archivnamen kann `FLOW_PACKAGE_VERSION` gesetzt werden; denselben Versionswert darf man nicht mit geändertem Inhalt wiederverwenden.

## Benchmarks

```bash
npm run benchmark -- --profile smoke --sizes 2 --samples 1 --warmups 0 --profiling true
npm run benchmark -- --profile single --sizes 10 --samples 5 --warmups 2
npm run benchmark -- --profile full --sizes 10 --samples 5 --warmups 2
```

Die Modi sind `browser`, `backend`, `coordinated` und `mixed`. Die Suite schreibt Rohwerte, Zusammenfassung, Manifest, Quellenfingerprints und gegebenenfalls Fehlerlogs in das mit `--out` gewählte Ausgabeverzeichnis. Sie misst den unabhängigen Standardhost; Adam-spezifische Fach-Nodes und ein Produktivnetzwerk sind nicht Teil dieser Messung.
