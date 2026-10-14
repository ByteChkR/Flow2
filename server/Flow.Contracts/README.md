# Flow.Contracts

C#-Modelle, eingebettete v1-JSON-Schemas, Typregistry, rekursive Zuweisbarkeitsprüfung,
JSON-Wertprüfung und DAG-/Portvalidierung. Keine Abhängigkeit auf Jint oder ASP.NET.

Untrusted Dokumente mit `ContractSchemas.Parse<T>` laden oder als `JsonElement`
an `FlowValidator.Validate` übergeben. Typisierte Hilfsfunktionen setzen zuvor
schema-validierte Typen voraus. Der gemeinsame Vertrag liegt unter `contracts/schemas`;
das vorhandene `Adam.Flow2.Runtime`-Modell des Jint-Durchstichs bleibt davon getrennt.
Semantik und API-Übersicht: [Vertrag v1](../../contracts/README.md).
