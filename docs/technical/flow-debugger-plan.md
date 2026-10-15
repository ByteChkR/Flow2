# Implementierungsplan: Flow2-Debugger und Wert-Inspector

[Home](../) / **Debugger-Plan**

Status: geplant, noch nicht implementiert.

## Ziel

Flow2 erhält einen Debugger im Editor, mit dem Nutzer die Ausführung an Node-Grenzen anhalten, durch Nodes und Subgraphen steppen und Inputs sowie Outputs in einem aufklappbaren Inspector untersuchen können. Die Bedienung orientiert sich am C#-Debugger. Es handelt sich um einen Graph-Debugger, nicht um einen Debugger für den Implementierungscode innerhalb einer Node.

Der größte Nutzen liegt in verschachtelten Subgraphen, Schleifen, optionalen Werten und hybriden Browser-/Backend-Flows. Vorhandene Profiling- und Trace-Ereignisse werden wiederverwendet, soweit sie geeignet sind. Sie ersetzen jedoch keine Runtime-Steuerung für echte Haltepunkte.

## Bedienung im Editor

Eine Debug-Leiste bietet:

- Debug-Lauf starten und bis zum nächsten Breakpoint fortsetzen.
- Einzelschritt: den nächsten ausführbaren Node-Aufruf ausführen.
- Hineinspringen: einen Subgraph-Aufruf betreten.
- Überspringen: einen Subgraph-Aufruf vollständig ausführen und danach anhalten.
- Herausspringen: den aktuellen Subgraph-Aufruf abschließen und im Aufrufer anhalten.
- Bei Fehler anhalten.
- Debug-Lauf abbrechen.

Die aktuelle Node wird hervorgehoben. Beim Betreten eines Subgraphen zeigt der Editor dessen Graph und den konkreten Aufrufkontext an. Breakpoints lassen sich direkt an Nodes setzen und deaktivieren. Debug-Einstellungen werden getrennt von der fachlichen Graphdefinition gespeichert.

### Inspector

| Ansicht | Inhalt |
|---|---|
| Inputs | Aufgelöste Werte vor der Ausführung, einschließlich Inline-Konstanten und ihrer Herkunft |
| Outputs | Ergebnisse nach der Ausführung |
| Aufrufstapel | Hauptgraph, aufrufende Nodes und verschachtelte Subgraph-Aufrufe |
| Ausführung | Runtime, Graph-/Node-ID, Aufrufnummer, Schleifeniteration und Status |
| Fehler | Fehlermeldung, betroffener Port und Aufrufpfad |

Records, Entities, Listen und Dictionaries erscheinen als aufklappbarer Baum. `null`, nicht vorhanden und noch nicht berechnet werden unterschiedlich dargestellt. Große Listen werden seitenweise angezeigt; lange Texte, HTML und Base64 erhalten eine gesonderte Ansicht. HTML wird nicht unkontrolliert im Editor ausgeführt.

Der Inspector zeigt einen konkreten Node-Aufruf. Bei Schleifen oder wiederholten Subgraph-Aufrufen darf er nicht unbemerkt Werte verschiedener Iterationen vermischen. Eine Aufrufhistorie erlaubt das Betrachten bereits abgeschlossener Aufrufe; dies ist keine Rückwärtsausführung.

## Architektur

### Gemeinsamer Debug-Vertrag

Ein optionaler Debug-Controller wird an zentralen Ausführungsstellen der Browser- und Backend-Runtime eingebunden:

```text
Inputs auflösen
  → Aufruf und Input-Snapshot erfassen
  → gegebenenfalls vor der Node pausieren
  → Node ausführen
  → Outputs oder Fehler erfassen
  → gegebenenfalls nach der Node pausieren
```

Subgraph-Eintritt und -Austritt ergänzen diese Ereignisse. Einzelne Node-Implementierungen benötigen keine Debug-Sonderlogik. Der produktive Ausführungspfad und der Debug-Ausführungspfad verwenden denselben Scheduler und dieselben Node-Implementierungen.

Ein Haltepunkt vor einer Node liegt nach Auflösung ihrer Inputs. Dafür notwendige Datenabhängigkeiten können bereits ausgeführt worden sein. Das UI und die Dokumentation müssen diesen Unterschied zum visuellen Layout des Graphen erklären. Einzelschritte folgen der tatsächlichen Ausführungsreihenfolge, nicht der Position von Nodes auf der Zeichenfläche.

### Identität und Zustand

Ereignisse tragen mindestens Debug-Session-ID, Ausführungs-ID, Graph-ID, Node-ID, eindeutige Aufruf-ID, Elternaufruf-ID, Runtime und eine Sequenznummer. Schleifeniteration und Zweigidentität werden ergänzt, sofern vorhanden.

Der Controller verwaltet Zustände wie laufend, Pause angefordert, pausiert, abgeschlossen, fehlgeschlagen und abgebrochen. Steuerbefehle beziehen sich auf die konkrete Session und den erwarteten Pausenzustand. Wiederholte oder verspätete Befehle dürfen keine doppelte Node-Ausführung verursachen.

Step Into, Step Over und Step Out werden anhand der Aufrufhierarchie definiert. Breakpoints innerhalb eines übersprungenen Subgraphen sollen weiterhin anhalten; diese Priorität wird durch Tests abgesichert.

### Browser, Backend und Transport

Beide Runtimes implementieren denselben Debug-Vertrag. Die bestehende SignalR-Anbindung dient, soweit passend, zum Transport von Ereignissen und Steuerbefehlen. Der maßgebliche Ausführungs- und Pausenzustand liegt in der Runtime, nicht im Editor oder in der SignalR-Verbindung.

Bei hybriden Flows bleibt die Aufrufidentität über Runtime-Wechsel erhalten. Ein koordinierender Debug-Zustand verhindert, dass ein Lauf im Browser als pausiert angezeigt wird, während neue Backend-Arbeit ungeplant weiterläuft.

Eine Backend-Debug-Session bleibt an der ausführenden Instanz. Bestehende Routing-/Affinitätsmechanismen werden dafür geprüft. Nach einem Backend-Neustart muss der Debug-Lauf neu gestartet werden; eine persistierte Fortsetzung ist nicht Teil dieses Plans.

Bei Verbindungsabbruch gilt eine explizite, zeitlich begrenzte Haltefrist. Innerhalb dieser Frist kann der Editor den Zustand erneut laden. Nach Ablauf wird der Debug-Lauf abgebrochen und aufgeräumt. Es gibt keine stille Fortsetzung fachlicher Seiteneffekte.

### Wertaufbereitung

Der Inspector erhält begrenzte, typisierte Snapshots über die vorhandenen Wertverträge und geeignete Debug-Projektionen. Er führt keine beliebigen Getter aus und löst kein EF-Lazy-Loading aus. Zyklen, nicht unterstützte Werte und abgeschnittene Inhalte werden ausdrücklich gekennzeichnet.

Grenzen für Tiefe, Stringlänge, Elementanzahl und Gesamtspeicher werden konfiguriert. Paging bezieht sich auf den erfassten Snapshot; es darf keine nachträglich mutierten Live-Werte als historischen Zustand anzeigen. Große Binärwerte werden zunächst nur mit Typ und Größe erfasst.

Debug-Zugriff ist an dieselbe berechtigte Ausführung und den Mandanten gebunden. Snapshots werden nicht standardmäßig in dauerhafte Logs geschrieben. Der Host kann sensible Felder ausblenden.

### Ressourcen und Abbruch

Backend-Pausen können scoped Services, getrackte Entities und offene Transaktionen am Leben halten. Vor Implementierung werden die aktuellen Scope- und Transaktionsgrenzen geprüft. Pausendauer und Session-Lebensdauer werden begrenzt; Abbruch und Verbindungsverlust müssen Wartende freigeben und Ressourcen entsorgen.

Bereits laufende Node-Implementierungen werden nur über ihre bestehende Cancellation-Unterstützung beendet. Ein Pause-Befehl wirkt kooperativ am nächsten sicheren Haltepunkt. Bereits ausgeführte Datenbankänderungen oder versendete Nachrichten werden nicht zurückgenommen.

## Parallelität

Parallele Graphzweige benötigen eine ausdrücklich definierte Stepping-Semantik. Vor Freigabe paralleler Debug-Läufe ist festzulegen:

- Eine Pause verhindert den Start weiterer Node-Aufrufe in allen beteiligten Zweigen.
- Bereits laufende Aufrufe dürfen bis zu einem sicheren Haltepunkt weiterlaufen; die Oberfläche zeigt zunächst „Pause angefordert“.
- Der Inspector unterscheidet Zweige und konkrete Aufrufe.
- Ein Schritt benennt den ausgewählten Zweig und die zulässige weitere Ausführung. Abhängigkeiten dürfen dadurch nicht in einen Deadlock geraten.

Der erste Stepping-Meilenstein kann auf sequenzielle Ausführung begrenzt werden. Parallele Flows werden dann ausdrücklich als noch nicht unterstützt gemeldet; sie werden nicht stillschweigend serialisiert, weil das ihr Verhalten verändern könnte. Trace-Inspektion kann unabhängig davon verfügbar sein.

## Umfang und bewusste Grenzen

Im ersten vollständigen Debugger enthalten sind lesender Inspector, Aufrufhistorie, Node-Breakpoints, Stepping durch Subgraphen, Fehlerhaltepunkt sowie Browser-, Backend- und hybride Ausführung innerhalb der jeweils freigegebenen Parallelitätsgrenzen.

Nicht enthalten sind das Ändern von Werten während der Ausführung, Auswertung beliebiger C#-/JavaScript-Ausdrücke, Debugging innerhalb einer Node-Implementierung, Rückwärtsausführung und Wiederherstellung einer pausierten Session nach einem Backend-Neustart.

Bedingte Breakpoints und Watches folgen optional später. Ihre Auswertung muss nebenwirkungsfrei und begrenzt sein; dafür wird kein beliebiger Code aus dem Editor ausgeführt.

## Aufwand, Nutzen und Wartbarkeit

Grobe Schätzung für eine Person einschließlich Tests; vor Umsetzung anhand der Runtime-Einstiegspunkte zu verfeinern:

| Etappe | Aufwand | Ergebnis |
|---|---|---|
| Inspector und Aufrufhistorie | 3–5 Arbeitstage | Inputs/Outputs und konkrete Aufrufe nachverfolgen |
| Browser-Stepping und Subgraphen | zusätzlich 5–8 Arbeitstage | Breakpoints, Step Into/Over/Out im Browser |
| Backend und hybride Ausführung | zusätzlich 8–15 Arbeitstage | Transport, Session-Steuerung, Abbruch und Wiederverbindung |
| Optionale Komfortfunktionen | zusätzlich 5–10 Arbeitstage | Bedingte Breakpoints und Watches |

Ein erster vollständiger Debugger liegt damit ungefähr bei drei bis sechs Arbeitswochen, ohne die optionalen Komfortfunktionen. Parallelität und bestehende Scope-/Transaktionsgrenzen sind wesentliche Aufwandstreiber und können zusätzliche Arbeit erfordern.

Der Nutzen ist hoch, weil Fehler in Datenübergaben und verschachtelten Aufrufen direkt sichtbar werden. Die Wartbarkeit bleibt beherrschbar, wenn Debug-Hooks zentral liegen, beide Runtimes denselben Vertrag verwenden und neue Nodes automatisch unterstützt werden. Eine zweite Debug-Runtime oder individuelle Debug-Implementierungen je Node werden vermieden.

Ohne aktiviertes Debugging werden keine Inspector-Snapshots angelegt. Benchmarks prüfen den verbleibenden Aufwand der deaktivierten Hooks sowie den Speicher- und Zeitaufwand aktiver Aufzeichnung. Profiling trennt Benutzerpausen von eigentlicher Ausführungszeit; Pausen dürfen nicht als Node-Self-Zeit erscheinen.

## Umsetzungsschritte

1. **Bestandsaufnahme und Vertrag:** Scheduler, Node-Aufrufstellen, Subgraphen, Trace-Identitäten, SignalR und Ressourcenlebensdauer prüfen. Ereignismodell, Zustandsautomat und Stepping-Semantik festlegen.
2. **Inspector und Historie:** begrenzte Snapshots, Aufrufbaum, Wertdarstellung und Auswahl konkreter Aufrufe implementieren. Das Ereignismodell bereits für echte Haltepunkte auslegen.
3. **Browser-Debugger:** zentrale Pause-Gates, Breakpoints, Stepping, Fehlerhaltepunkt und Abbruch ergänzen. Editor-Hervorhebung und Subgraph-Navigation anbinden.
4. **Backend-Debugger:** denselben Vertrag implementieren, Befehle absichern, Session-Lebensdauer und Ressourcenbereinigung testen.
5. **Hybride Koordination:** runtimeübergreifende Aufrufidentitäten, Pausenzustände, Wiederverbindung und Instanzbindung integrieren.
6. **Parallelität:** sichere Pausen und eindeutige Zweigsteuerung implementieren beziehungsweise verbleibende Einschränkungen ausdrücklich ausweisen.
7. **Abnahme und Dokumentation:** Regressionstests, Last-/Speicherprüfungen, Benchmarks und Anwenderdokumentation abschließen.
8. **Optionaler Ausbau:** bedingte Breakpoints und nebenwirkungsfreie Watches gesondert planen.

## Tests und Abnahmekriterien

- Inputs stimmen am Haltepunkt mit den tatsächlich an die Node übergebenen Werten überein; Outputs gehören zum ausgewählten Aufruf.
- Missing, null und noch nicht berechnet bleiben unterscheidbar. Historische Snapshots verändern sich nicht nachträglich.
- Schleifen, rekursive beziehungsweise verschachtelte Aufrufe und wiederverwendete Subgraphen besitzen eindeutige Aufrufidentitäten.
- Step Into/Over/Out und Breakpoints funktionieren deterministisch im unterstützten Ausführungsmodell, einschließlich Datenabhängigkeiten.
- Pausieren, Fortsetzen, doppelte Befehle, Fehler, Cancellation und Verbindungsabbruch verursachen keine doppelte Ausführung und keine hängenbleibenden Gates.
- Browser-/Backend-Wechsel erhalten den Aufrufkontext. Ein Neustart beendet die Debug-Session mit einer verständlichen Meldung.
- Inspektion löst keine Datenbankabfrage, keine Getter-Seiteneffekte und keine fachliche Aktion aus.
- Große Werte, Zyklen und lange Historien bleiben innerhalb der vereinbarten Speichergrenzen.
- Debugging verwendet dieselbe Ausführungslogik wie normale Läufe; deaktivierte Hooks verursachen keine Snapshot-Erstellung.
- Seiteneffekte werden genau einmal ausgeführt. Abbruch wird nicht als Rollback bereits ausgeführter Aktionen dargestellt.
- Debug-Pausen werden in Performance-Messungen separat ausgewiesen.
