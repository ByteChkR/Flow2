# Architektur

[Home](../README.md) / **Architektur**

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

## Registry-Prinzip

Ein Katalog beschreibt Node-ID, Version, Ports, Metadaten, Konfiguration und erlaubte Laufzeiten. `createStandardRegistry` registriert im Browser die portablen Standard-Nodes und Codecs. `StandardFlowRegistry` tut dasselbe im Backend über `CommonNodeRegistration`.

Ein Host erstellt anschließend seine eigene Registry, ergänzt fachliche Nodes und registriert Wert-Codecs erst nach den Erweiterungen. Browser- und Backend-Definitionen derselben Node-ID müssen denselben Portvertrag besitzen; die Ausführungsumgebung wird dann aus den erlaubten Laufzeiten bestimmt.

## Laufzeitgrenzen

Eine Node läuft im Browser, im Backend oder in beiden Umgebungen. Ein lokaler Browserlauf erlaubt nur Browser-Nodes. Eine koordinierte Ausführung teilt den Graphen an Laufzeitgrenzen in Segmente; Werte dürfen diese Grenze nur über einen registrierten Codec überschreiten. Das Backend kompiliert und validiert jeden eingehenden Graphen nochmals gegen seine eigene Registry.
