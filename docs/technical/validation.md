# Validierung und Fehlermodell

[Home](../) / **Validierung und Fehlermodell**

Validierung ist mehrstufig. Jede Stufe beantwortet eine andere Frage und darf die vorherige nicht ersetzen.

| Stufe | Frage | Ausführungsort | Ergebnis |
| --- | --- | --- | --- |
| JSON / Workspace | Ist der gespeicherte Wert strukturell lesbar? | Editor | Speicherbar oder Parserfehler |
| Flowvertrag | Stimmen Nodes, Ports, Typen, Kontrollfluss und Inline-Werte? | Browser und Backend | Diagnosen pro Pfad / Node |
| Kennzeichnung | Passt der Graph zu seinem Verwendungszweck? | Core, Host | zusätzliche Diagnosen und feste Schnittstellen |
| Boundary | Darf der konkrete Wert die Laufzeitgrenze passieren? | Compiler und Runtime | Codec-/Wire-Fehler |
| Runtime | Liefert eine Node valide Eingänge und Ausgänge? | Browser oder Backend | Ausführungsfehler mit Ursprung |

## Strukturelle Regeln

Die Core-Validierung löst Node-Definitionen aus dem Katalog auf und prüft Node-Versionen, Ein- und Ausgänge, Typzuweisbarkeit, Daten- und Kontrollfluss, Startpunkte, Query- und Graph-Bindungen sowie Inline-Eingaben. Ein Inline-Wert ist nur an einem primitiven vorhandenen Eingang zulässig. Sobald eine Datenverbindung diesen Eingang belegt, wird der Inline-Wert nicht verwendet.

`optional<T>` bedeutet „der Port darf unverbunden sein“. `nullable<T>` bedeutet „der Wert ist vorhanden, darf aber `null` sein“. Diese Unterscheidung bleibt im Graphvertrag und bei der Wertprüfung erhalten.

## Boundary- und Wertprüfung

Der Compiler markiert jeden Übergang zwischen Browser und Backend. Dafür müssen Quell- und Zieltyp kompatibel sein und ein Codec für den transportierten Typ existieren. Der Wire-Wert wird vor dem Decode gegen das Codec-Schema geprüft; der dekodierte Wert wird anschließend nochmals gegen den logischen Typ geprüft.

Nicht transportierbar sind unter anderem native Entities, `Grouping` sowie `Queryable`-, `OrderedQueryable`- und `Enumerable`-Werte. Solche Werte müssen in ihrer Laufzeit materialisiert oder auf eine übertragbare Projektion abgebildet werden.

## Fehlerherkunft

Fehler werden als Daten mit Code, Nachricht und optionaler Node-, Graph- und Execution-ID transportiert. Die Runtime akzeptiert bei Browsersegmenten nur Fehler, die zur ausstehenden Segment-ID gehören. Bei verschachtelten Graphen bleibt der Ursprung erhalten, sodass ein Parent nicht fälschlich als Fehlerstelle angezeigt wird.

Die UI trennt Fehler, Warnungen und Informationen. Ein Schemafehler ist für den Speicherworkflow typischerweise eine Warnung, ungültiges JSON dagegen blockierend. Ein Laufzeitfehler bleibt unabhängig von vorheriger Editorvalidierung ein Fehler, weil Inputs, Datenbankzustand und externe Systeme erst zur Laufzeit feststehen.

## Preflight und Freigabe

Der Backend-Preflight validiert jedes benötigte Graph- und Subgraph-Element ohne Nodes auszuführen. Bei einem erfolgreich gespeicherten Bundle kann der Host eine `BundleValidation` hinterlegen. Diese Freigabe wird nur anerkannt, wenn Bundle-Hash, Runtime-Basis und — bei Browsergraphen — Browser-Fingerprint noch übereinstimmen. Browserdaten können eine solche Freigabe nicht selbst ausstellen.

Das Verfahren spart Wiederholungsarbeit, verschiebt aber keine Sicherheitsentscheidung in den Browser. Details zu Caches und deren Grenzen stehen unter [Optimierungen und Benchmarks](optimizations.html).
