# Editor, Workspace und Graphschnittstellen

[Home](../) / **Editor, Workspace und Graphschnittstellen**

Der Flow-Editor baut auf dem allgemeinen Paket `@adam/editor` auf. Dieses Paket verwaltet Ressourcenbaum, Tabs, Entwürfe, gespeicherte Zustände, Meldungen und Overlays. `@adam-flow/editor` ergänzt ausschließlich graphbezogene Modelle und Ansichten. Dadurch kann der Dokumenteditor unabhängig vom Flow-System verwendet werden.

## Workspace-Modell

```text
Workspace
├─ Gruppen (Baum, nur Organisation)
├─ öffentliche Graphen
│  ├─ Flow-Vertrag und Revision
│  ├─ Canvas-Layout: Positionen, Kommentare, visuelle Gruppen
│  └─ optionale interne/Inline-Graphen
└─ Editorzustand: offene Tabs, aktiver Graph, Auswahl, Zoom
```

Eine Workspace-Gruppe verändert weder Namespace noch Laufzeit. Sie dient der Navigation und kann Graphen und Untergruppen enthalten. Der technische Graphname ist innerhalb seines Zielpfads eindeutig. Interne Graphen gehören einem öffentlichen Owner-Graphen: Sie tragen keine eigene Workspace-Gruppe und keine eigene Prozesskennzeichnung. So kann ein Inline-Callback nicht versehentlich als unabhängiger Prozess erscheinen.

Workspace-Daten werden strukturell geprüft. Ein unvollständiger Entwurf darf gespeichert und später weiterbearbeitet werden, sofern sein JSON gültig ist. Ausführbarkeit ist eine separate Prüfung. Damit bleiben Zwischenstände im Canvas möglich, ohne als gültiger Laufplan ausgegeben zu werden.

## Entwurf, Speichern und Dirty-State

Ein Editor-Dokument besitzt einen letzten gespeicherten Wert und einen Entwurf. Der Dirty-State wird aus einem stabilen Fingerprint beider Werte ermittelt, nicht aus Objektidentität. Das ist wichtig, weil Workspace-Mutationen und Wiederherstellung aus JSON neue Objekte erzeugen können, ohne semantische Änderungen zu bedeuten.

Beim Speichern unterscheidet der Host zwei Ebenen:

1. **JSON gültig:** Der Workspace darf persistiert werden.
2. **Schema- oder Graphdiagnosen:** Der Host kann warnen oder eine explizite erzwungene Speicherung anbieten.

Ungültiges JSON wird nie gespeichert. Schemafehler sind sichtbar filterbare Meldungen und dürfen nicht mit einem Parserfehler verwechselt werden.

## Flow-Schnittstelle als Vertrag

`Flow Input<T>` und `Flow Output<T>` bilden einen `FlowInterface`-Vertrag. Beim Bearbeiten der Node wird nicht nur ein Port gezeichnet: Der Editor aktualisiert daraus die öffentliche Schnittstelle des Graphen. Ein Aufruf- oder Referenzgraph leitet aus diesem Vertrag seine korrekten Ein- und Ausgänge ab.

```text
Flow Input<T> ──► öffentlicher Input im FlowInterface
Flow Output<T> ◄── öffentlicher Output im FlowInterface
                         │
                         ▼
           Graph-Node im aufrufenden Graphen
           erzeugt passende Ports und validiert Werte
```

Eine Änderung der Schnittstelle prüft alle Aufrufer erneut. Graphsignaturen werden außerdem für Steuerungsnodes verwendet, etwa `if`, `while`, `map`, `aggregate`, `try` oder `switch`; diese erzeugen ihre benötigten Inline-Graphen mit der erwarteten Form.

## Inline- und interne Graphen

Ein Inline-Graph gehört zu einem konkreten Node-Port, etwa zum Body einer `Map`-, `Aggregate`- oder `While`-Node. Der Editor speichert die Eigentümerbeziehung (`Graph`, `Node`, `Port`) und hält die Schnittstelle beim Ändern der Steuerungsnode synchron. Kopieren und Einfügen nimmt die zugehörige Inline-Graph-Hierarchie gemeinsam mit den Nodes mit; beim Klonen werden IDs und Referenzen umgeschrieben.

Für nicht-inline interne Graphen gelten zusätzlich zyklusfreie Aufrufbeziehungen. Der Editor verhindert direkte und indirekte Rekursion sowie unzulässige Verschachtelung. Die Core-Validierung setzt außerdem eine maximale Aufruftiefe von 32 durch.

## Kennzeichnungen

Eine Kennzeichnung (`designation`) ist ein registrierter Verwendungszweck, nicht bloß ein Label. Sie kann erlaubte Laufzeiten, feste Inputs und Outputs sowie zusätzliche Validatoren definieren. Beim Zuweisen passt der Editor die Flow-Schnittstelle an den Vertrag an; die Core-Validierung überprüft ihn erneut unabhängig vom Editor.

Das Modell erlaubt unter anderem Backend-Trigger, Entity-Backend-Trigger und Frontend-Prozesse als Host-Konfiguration. Die konkrete Liste gehört dem Host: Der portable Kern kennt nur Registry, Vertrag und Validatoren. Ein gekennzeichneter Graph kann daher nur dort gestartet oder verknüpft werden, wo sein Host diesen Zweck anbietet.

## Validierung im Editor und im Host

```text
Canvas-Mutation
   │
   ├─ sofort: lokale Struktur- und Verbindungshilfe
   ├─ beim Prüfen: Core-Validierung mit Browser-Katalog
   ├─ bei gemischten Graphen: Backend-Preflight mit Browser-Fingerprint
   └─ beim Start: Runtime validiert erneut gegen den autoritativen Katalog
```

Der Editor verbessert die Rückmeldung, ist aber keine Vertrauensgrenze. Seine Meldungen enthalten Kategorie, Schweregrad, Ziel und optionale Ursache. Kategorien wie Fehler, Warnungen und Informationen können gefiltert werden. Der Backend-Preflight ergänzt die Prüfung für Server-Nodes, Codecs, Kennzeichnungen und die gesamte Subgraph-Hierarchie.

## Darstellung und Layout

Das Layout gehört zum Editorzustand, nicht zum ausführbaren Datenfluss: Positionen, Kommentare, visuelle Node-Gruppen, Auswahl und Zoom verändern keinen Flowvertrag. Node- und Kommentargruppen werden beim Verschieben gemeinsam bewegt; beim Löschen kann der Benutzer den Rahmen allein oder auch dessen enthaltene Elemente entfernen. Dadurch sind Layout-Refactorings ohne Änderung von Laufzeit oder Version des Fachprozesses möglich.
