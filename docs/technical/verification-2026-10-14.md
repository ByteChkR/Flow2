# Prüfnachweis vom 14.10.2026

[Home](../) / **Prüfnachweis vom 14.10.2026**

Dieser Nachweis beschreibt einen abgeschlossenen lokalen Stand und ist keine Zusage über den aktuellen Branchzustand.

- npm-Tarballs und NuGet-Pakete wurden lokal gebaut und in einem unabhängigen Consumer installiert.
- Paketgrenzen, JavaScript-/Browserprüfungen sowie die .NET-Vertragsprüfungen liefen erfolgreich.
- Adam-Frontend und -Backend wurden einschließlich ihrer Integrationsprüfungen gegen die lokalen Pakete geprüft.
- PostgreSQL-abhängige Tests waren ohne `FLOW2_TEST_POSTGRES` nicht Teil dieses Laufs; SQLite- und Host-Prüfungen wurden ausgeführt.
- Zwei Benchmark-Smoke-Matrizen mit Standardflags wurden ohne Fehler geschrieben. Sie sind Funktionsmessungen kleiner Graphen und keine Produktivdurchsatzmessung.

Die Rohdaten dieses Laufs liegen unter [`docs/verification/`](../verification/). Für aktuelle Nachweise die Befehle aus [Lokale Entwicklung](development.html) ausführen und neue Ergebnisse in einem separaten Ausgabeverzeichnis erzeugen.
