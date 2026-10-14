# Architektur

[Home](../) / **Architektur**

Die produktiv verwendete, paketfähige Implementation liegt unter `local/`. Sie trennt den allgemeinen Dokumenteditor, Flow-Verträge, Browser-Runtime, Flow-Editor und .NET-Runtime. Adam bleibt Host für fachliche Daten, Berechtigungen und Geschäfts-Nodes.

| Baustein | Aufgabe | Abhängigkeiten |
| --- | --- | --- |
| `@adam/editor` | Ressourcenbaum, Tabs, Dokumente, Speichern, Dirty-State, Overlays und Meldungen | keine Flow-Abhängigkeit |
| `@adam-flow/core` | JSON-Verträge, Typmodell, Graphanalyse, Validierung und Compiler | keine Editor-/Runtime-Abhängigkeit |
| `@adam-flow/runtime-browser` | Browser-Runtime, Orchestrierung, Codecs und portable Browser-Nodes | core |
| `@adam-flow/editor` | Flow-Canvas, Nodes, Graphkonfiguration und Statistics-Ansicht | editor, core, runtime-browser |
| `Adam.Flow2` | .NET-Verträge, Validierung, Runtime, Jint und portable Backend-Nodes | keine Adam-/EF-/ASP.NET-Abhängigkeit |
| `Adam.Flow2.AspNetCore` | HTTP-Koordinator, Runtime-Factory und Logging-/Progress-Ports | Adam.Flow2 |
| `Adam.Flow2.EntityFrameworkCore` | generische EF-Quellen, Query-/Entity-Nodes und Entity-Policy | Adam.Flow2 |

Adam ergänzt Anmeldung, Mandantenzuordnung, Datenpersistenz, AdamAufgabe/Trigger, Geschäfts-Nodes, `ITemplateService`, konkrete EF-Policies sowie seine Detail-, Such- und Page-Masken. Diese Grenzen verhindern Rückimporte aus dem Kern in Adam und erlauben einen unabhängigen Paketbau.

## Schichten und erlaubte Abhängigkeiten

```text
                     Adam-Host
      ┌──────────────────────────────────────────┐
      │ Fach-Nodes · Auth · EF-Policies · UI      │
      └───────────────┬──────────────────────────┘
                      │ erweitert
   ┌──────────────────┼──────────────────┐
   │                  │                  │
Browser          ASP.NET-Core        Entity Framework
Runtime          Host                Erweiterung
   │                  │                  │
   └─────── @adam-flow/core / Adam.Flow2 ────────┘
                  Verträge · Typen · Plan
```

Die Pfeile laufen von Host-Erweiterungen zum Kern, nie umgekehrt. `Adam.Flow2` kennt weder Adam-Entities noch Controller, einen DbContext oder Svelte-Komponenten. Ein Adam-Host darf dagegen seine Registry und Runtime-Factory mit scoped Services aufbauen. Dadurch lassen sich Kernpakete isoliert testen und veröffentlichen, ohne dass ein Consumer den Adam-Monolithen referenzieren muss.

Der allgemeine Editor ist ebenfalls eine eigene Schicht: `@adam/editor` kennt keinen Graphvertrag; `@adam-flow/editor` adaptiert ihn für Canvas, Toolbox und Statistics. Host-Code konfiguriert beide über klar definierte Adapter statt durch Imports aus Produktkomponenten.

## Registry-Prinzip

Ein Katalog beschreibt Node-ID, Version, Ports, Metadaten, Konfiguration und erlaubte Laufzeiten. `createStandardRegistry` registriert im Browser die portablen Standard-Nodes und Codecs. `StandardFlowRegistry` tut dasselbe im Backend über `CommonNodeRegistration`.

Ein Host erstellt anschließend seine eigene Registry, ergänzt fachliche Nodes und registriert Wert-Codecs erst nach den Erweiterungen. Browser- und Backend-Definitionen derselben Node-ID müssen denselben Portvertrag besitzen; die Ausführungsumgebung wird dann aus den erlaubten Laufzeiten bestimmt.

## Registrierungsreihenfolge

```text
Standard-Nodes + Standard-Codecs
              │
              ▼
      Host registriert Fach-Nodes
              │
              ▼
  Katalogabhängige Wert-Codecs erzeugen
              │
              ▼
  finaler Katalog für Validierung und Runtime
```

Katalogabhängige Codecs werden zuletzt registriert, weil sie erst den vollständigen Satz an fachlichen Typen sehen dürfen. Eine Browser-Node ist nicht automatisch im Backend vorhanden und umgekehrt. Bei gleicher Node-ID in beiden Registries erzwingt der Katalogmerge denselben Vertragskern; eine abweichende Portform ist ein Integrationsfehler und nicht ein Laufzeit-Fallback.

## Laufzeitgrenzen

Eine Node läuft im Browser, im Backend oder in beiden Umgebungen. Ein lokaler Browserlauf erlaubt nur Browser-Nodes. Eine koordinierte Ausführung teilt den Graphen an Laufzeitgrenzen in Segmente; Werte dürfen diese Grenze nur über einen registrierten Codec überschreiten. Das Backend kompiliert und validiert jeden eingehenden Graphen nochmals gegen seine eigene Registry.
