# Flows erstellen

[Home](../README.md) / **Flows erstellen**

## Daten und Kontrollfluss

Datenverbindungen übergeben Werte zwischen Ports. Ein Eingang kann nur verbunden werden, wenn sein Zieltyp den Quelltyp akzeptiert. Kontrollflussverbindungen bestimmen die Reihenfolge für Nodes mit Ablaufanschlüssen. Ein Startpunkt löst den initialen Kontrollfluss aus; Datenabhängigkeiten werden dabei weiterhin berücksichtigt.

## Flow-Schnittstellen und Subgraphen

`Flow Input<T>` und `Flow Output<T>` definieren die öffentliche Schnittstelle eines Graphen. Ein Subgraph-Aufruf verwendet diese Signatur, um seine Ein- und Ausgänge zu erzeugen und den übergebenen Graphen zu validieren. Ändert sich die Schnittstelle, prüft der Editor alle Aufrufe erneut.

## Inline-Werte

Primitive Eingänge können statt einer Constant-Node einen Inline-Wert besitzen. Der Wert wird nur verwendet, wenn die Checkbox aktiviert ist. Sobald eine externe Verbindung entsteht, wird die Checkbox deaktiviert; der eingegebene Wert bleibt für eine spätere Wiederverwendung erhalten.

## Graph-Kennzeichnungen

Eine Kennzeichnung beschreibt den Verwendungszweck eines Graphen und kann zusätzliche Validierung, feste Schnittstellen und Laufzeitregeln vorgeben. Der Host stellt seine Kennzeichnungen bereit. Die Kennzeichnung ersetzt nicht die normale Graphvalidierung.

## Organisieren

Workspaces können Graphen in Gruppen organisieren. Gruppen und Nodes lassen sich im Ressourcenbaum verschieben. Standard-Flows werden als lokale Kopien importiert; Workspace-Export und -Import verwenden portable Graphdaten.
