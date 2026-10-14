# JSON-Schemas

`v1/type.schema.json` enthält die gemeinsame Typdefinition und wiederverwendbare
Definitionen für Entities, Kataloge und Flows. `types.schema.json`,
`catalog.schema.json` und `flow.schema.json` referenzieren diese Definitionen.
Alle Schemas werden lokal registriert bzw. in die C#-Assembly eingebettet.
Semantik, APIs und Nachweise: [Vertrag v1](../README.md).

`codecs.schema.json` beschreibt deklarative Codec-Capabilities,
`envelope.schema.json` die tatsächliche JSON-Nachricht. Beispiele für Codecs und
explizite Codec-Verweise an Flow-Grenzen liegen unter `examples/v1` im Vertragsordner.
