# Laufzeit-Pipeline und Koordination

[Home](../) / **Laufzeit-Pipeline**

Diese Seite beschreibt den Weg eines Graphen von der gespeicherten Definition bis zum Ergebnis. Sie gilt für die paketfähige Basis unter `local/`; ein Adam-Host ergänzt Authentifizierung, fachliche Nodes, Persistenz und seine eigene HTTP-Route.

## Ausführungsformen

| Form | Erlaubte Nodes | Koordinator | Transport |
| --- | --- | --- | --- |
| Lokal im Browser | nur `browser` | Browser-Runtime | keiner |
| Backend | nur `server` | `Orchestrator` | HTTP-Aufruf zum Start, Ausführung serverseitig |
| Koordiniert | Browser-, Backend- und hybride Segmente | `Orchestrator` im Backend | nur Codec-Werte an Segmentgrenzen |

Ein Browser-Graph kann nicht ohne gebundene Browser-Session vom Backend gestartet werden. Ein lokaler Browserlauf führt nie versehentlich Backend-Nodes aus. Diese Einschränkungen sind eine Validierungsregel, keine bloße UI-Entscheidung.

## Vom Graph zum Plan

```text
Graph + Bundle + Registries
          │
          ├─ 1. Schema- und Strukturprüfung
          ├─ 2. Node-/Port-/Typprüfung
          ├─ 3. Kontrollfluss, Inline-Werte und Graph-Schnittstelle
          ├─ 4. Runtime- und Codec-Grenzen
          ▼
  deterministische Reihenfolge aktiver Nodes
          ▼
  ExecutionPlan
  ├─ Nodes und Daten-/Kontrollverbindungen
  ├─ übersprungene Nodes
  ├─ öffentliche Flow-Inputs/-Outputs
  └─ Segmente pro Laufzeit
```

Der Compiler ordnet die aktiven Nodes deterministisch und fasst aufeinanderfolgende Nodes derselben Laufzeit zu Segmenten zusammen. Eine Verbindung zwischen unterschiedlichen Laufzeiten bleibt im Plan sichtbar und wird als Boundary markiert. Nur hierfür wird ein Codec benötigt. Native CLR-Entities, Browser-Objekte und andere nicht kodierbare Werte können somit nicht unbemerkt den Prozess verlassen.

Der Plan enthält keine ausführbare, vom Browser gelieferte Logik. Der Host stellt aus der eigenen Registry die Node-Implementierungen bereit. Im Backend erzeugt die Runtime daraus kontrollierte Jint-Aufrufe; im Browser ruft `BrowserExecution` die registrierten Implementierungen auf.

## Koordinierter Ablauf

```text
Browser                         Backend-Orchestrator                 Server-Segment
   │  Session erstellen                    │                                │
   ├──────────────────────────────────────>│                                │
   │  Browser-Katalog + Codecs             │                                │
   │                                       ├─ prüfen / planen ─────────────>│
   │                                       │<──────── Segment fertig ───────┤
   │  Browser-Arbeit (Segment, Attempt)    │                                │
   │<──────────────────────────────────────┤                                │
   ├─ Browser-Segment ausführen            │                                │
   │  Boundary-Werte oder Fehler           │                                │
   ├──────────────────────────────────────>│                                │
   │                                       ├─ nächsten Abschnitt ausführen  │
   │<──────────────────────── Ergebnis / Fortschritt ───────────────────────┤
```

Der Backend-Koordinator besitzt den Laufzustand, die offenen Segmentversuche und die autorisierte Session. Ein Browser-Ergebnis enthält die Segment-ID, eine nur für diesen Versuch gültige `attemptId` sowie die kodierten Boundary-Werte. Ergebnisse für abgelaufene oder fremde Versuche werden abgelehnt. Vor dem Start eines nachfolgenden Serversegments werden die empfangenen Werte dekodiert und erneut gegen Ports und Graphvertrag validiert.

Die Browser-Session ist an Owner und Ablaufzeit gebunden. Der aktuelle In-Memory-Koordinator besitzt eine Lease von 30 Sekunden. Eine Routing-Affinität kann sicherstellen, dass Folgerequests dieselbe Instanz erreichen; sie ersetzt aber weder die Owner-Prüfung noch eine verteilte Persistenz. Nach Instanzwechsel oder Neustart meldet der Browser daher einen Sitzungsverlust und der Lauf muss neu gestartet werden.

## Zustandsmaschine

```text
created ──start──> running ──Browser-Segment──> waiting_for_browser
                  │                                  │
                  │<──── gültiges Resultat ──────────┘
                  ├──── alle Segmente fertig ───────> completed
                  ├──── Node-/Boundary-Fehler ──────> failed
                  └──── Abbruch / Lease / Shutdown ─> failed (cancelled)
```

`completed` besitzt Outputs und gegebenenfalls einen Kontrollflussausgang. `failed` enthält einen maschinenlesbaren Fehlercode, eine Nachricht und — soweit ermittelbar — Node-, Graph- und Invocation-ID. Ein Fehler aus einem Subgraphen wird mit seinem Ursprung weitergereicht, damit der Editor die richtige Stelle markieren kann.

## Subgraphen und Aufrufbaum

Eine Graph-Node startet eine Kind-Ausführung. Der Koordinator speichert Parent-ID, aufrufende Node und optionalen `callKey`; dadurch bleibt ein Ausführungsbaum statt einer flachen Liste erhalten. Der Parent wartet auf das Kind, übernimmt dessen Outputs erst nach erfolgreichem Abschluss und propagiert Fehler oder Abbruch.

Bei hybriden Graphen gilt zusätzlich: Ein hybrider Graph darf nur hybride Subgraphen aufrufen. Das verhindert, dass sich die gewählte Laufzeit eines verschachtelten Aufrufs erst während der Ausführung widersprüchlich ändert.

## Sicherheits- und Vertrauensgrenze

Der Browser darf Graphdaten, Inputs und seine Browser-Registry liefern, aber keinen Plan, keine Node-Implementierung und keine Freigabe erzwingen. Der Host validiert daher erneut gegen seine Registry. Eine gespeicherte, erfolgreiche Workspace-Prüfung kann als serverseitig ausgestellte Freigabe (`BundleValidation`) wiederverwendet werden. Sie ist an Bundle-Hash, Runtime-Basis und bei Browsergraphen an den Browser-Fingerprint gebunden. Ändert sich einer dieser Werte, ist die Freigabe ungültig.

Siehe auch: [Ausführungsmodell](execution-model.html), [Verträge und Kompatibilität](contracts.html) und [Optimierungen und Benchmarks](optimizations.html).
