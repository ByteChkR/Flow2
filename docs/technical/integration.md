# Host-Integration

[Home](../README.md) / **Host-Integration**

## Browser

`FlowWorkspace` erhält eine Registry-Factory, einen Fetch-Adapter und optional einen Wakeup-Subscriber. Ein unabhängiger Host kann direkt `createStandardRegistry` verwenden. Ein Anwendungshost erstellt dagegen eine Registry und ruft in dieser Reihenfolge auf:

1. `registerCommonNodes` und `registerCommonCodecs` aus `@adam-flow/runtime-browser/registry.js` aufrufen.
2. Eigene Browser-Nodes registrieren.
3. `registerCatalogValueCodecs` mit dem vollständigen Katalog aufrufen.

`configureEditorHost` bindet den allgemeinen Editor an Theme, Icons und Host-Komponenten. `configureFlowEditorHost` liefert Workspace-Erzeugung, Persistenztransport, Konfigurationsdaten und die fachlichen Graph-Kennzeichnungen. Große Host-Komponenten werden über asynchrone Loader eingebunden.

## Backend

`StandardFlowRegistry` ist ein vollständiger, unabhängiger Standardhost. Eine Anwendung implementiert `IFlowRuntimeFactory` oder ergänzt eine abgeleitete/zusammengesetzte Registry für ihre scoped Services und Geschäfts-Nodes. Wichtige Ports sind `IFlowChangeSink`, `IFlowLogSinkFactory` und `IFlowValidationProgress`.

`FlowControllerBase` definiert bewusst keine anonyme Produktionsroute. Der konkrete Host legt Route, Autorisierung und die vertrauenswürdige Owner-/Mandantenzuordnung fest. `FlowChangeDispatcher` bündelt Wakeups; der Hostadapter überträgt dabei nur die eigene Hub- und Gruppenzuordnung, keine Ausführungsdaten.

## Entity Framework und fachliche Nodes

`Adam.Flow2.EntityFrameworkCore` enthält nur generische EF-Bausteine und Policies. Ein Host liefert seinen DbContext, Entity-Zuordnungen, Berechtigungsentscheidungen und gegebenenfalls Query-/Template-Fabriken. Eine im Browser sichtbare Node ist nicht automatisch im Backend ausführbar; beide Registrierungen müssen bewusst bereitgestellt werden.
