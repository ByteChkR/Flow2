# Implementierungsplan: zusätzliche Standard-Nodes

[Home](../) / **Plan für zusätzliche Standard-Nodes**

Status: geplant, noch nicht implementiert. Grundlage ist die produktive Paketbasis unter `local/`. Dieser Plan umfasst alle 22 zuletzt vorgeschlagenen Nodes. Portnamen und Typkennungen sind Vertragsvorschläge; vor der Umsetzung sind sie mit den bestehenden Wert- und Graphverträgen abzugleichen.

## Ziel und gemeinsame Regeln

Die Erweiterung soll häufige Text-, Navigations-, Validierungs-, Datums- und Query-Aufgaben vereinfachen. Bestehende Operationen werden wiederverwendet. Die Implementierung erfolgt in den aktuellen Core-, Browser-Runtime- und .NET-Paketen, nicht im historischen Prototyp.

- Reine Wertoperationen unterstützen Browser und Backend mit identischer Semantik. Query-Aggregate unterstützen ausschließlich das Backend.
- Neue Node-Typen beginnen mit Version 1. `Standard.Values.List.IsEmpty` wird durch `Standard.Values.IsEmpty<T>` ersetzt und vollständig entfernt. Für diese Änderung gibt es keine Rückwärtskompatibilität; übrige bestehende Verträge bleiben unverändert.
- `optional` bedeutet, dass ein Wert fehlen darf; `nullable` erlaubt ausdrücklich `null`. Beides wird separat modelliert. Ein erforderlicher ungültiger Wert führt zu einem strukturierten Node-Fehler.
- Beschreibungen für jede Node und jeden Input, Labels, Kategorie und Portreihenfolge gehören zur Umsetzung. Die gemeinsame Beschreibungsquelle ist `local/packages/core/src/contracts/node-descriptions.json`.
- Primitive Inputs funktionieren mit den vorhandenen Inline-Editoren. Generische Typen und Graphschnittstellen verwenden die vorhandenen Typeditoren und Validierungsregeln.
- Gemeinsame Fixtures prüfen Browser-/Backend-Parität einschließlich Unicode, fehlender Werte und Grenzfälle. Nach Fertigstellung wird die generierte Node-Referenz aktualisiert.

## 1. Text und leere Werte

| Node | Inputs | Outputs | Verhalten |
|---|---|---|---|
| `Standard.Text.DefaultIfWhiteSpace` | `value: string`, optional und nullable; `fallback: string`, erforderlich | `value: string` | Liefert den Fallback bei fehlendem Wert, `null`, leerem Text oder ausschließlich Whitespace. Andernfalls wird der Originaltext einschließlich Rand-Whitespace zurückgegeben. |
| `Standard.Values.IsEmpty<T>` | `value: T`, optional und nullable | `value: Bool` | Liefert true bei fehlendem Wert, `null`, leerem String, leerer Liste oder leerem Dictionary. Whitespace ist nicht leer. |
| `Standard.Text.HtmlEncode` | `value: string` | `value: string` | Kodiert `&`, `<`, `>`, doppelte und einfache Anführungszeichen nach einer gemeinsamen festen Tabelle. |
| `Standard.Text.HtmlDecode` | `value: string` | `value: string` | Dekodiert HTML-Zeichenreferenzen genau einmal. Benannte und numerische Referenzen sowie ungültige Referenzen erhalten eine gemeinsam spezifizierte Semantik. |

`IsEmpty<T>` akzeptiert ausschließlich Text-, Listen- und Dictionary-Typen. Andere Typen werden bereits bei der Graphprüfung abgelehnt; insbesondere sind 0 und false keine leeren Werte. `Standard.Values.List.IsEmpty` wird vollständig aus Definitionen, Registries, Runtime-Implementierungen, Editor-Katalogen, Metadaten und generierter Referenz entfernt. Es gibt keinen Alias, keinen Legacy-Handler und keine automatische Migration. Mitgelieferte Beispielgraphen und Fixtures werden auf `Standard.Values.IsEmpty<T>` umgestellt. Gespeicherte Graphen mit dem alten Node-Typ müssen manuell angepasst werden; bis dahin meldet die Validierung einen unbekannten Node-Typ.

Für Whitespace wird die vorhandene Semantik von `Text.IsNullOrWhiteSpace` wiederverwendet. Vor Umsetzung von `HtmlDecode` wird eine portable HTML-Entity-Implementierung beziehungsweise gemeinsame Entity-Tabelle ausgewählt. Browser-DOM und .NET-Decoder dürfen nicht stillschweigend unterschiedliche Ergebnisse liefern. HTML-Encoding ist kein HTML-Sanitizer und soll entsprechend dokumentiert werden.

Tests: missing/null/leer, Unicode-Whitespace, unveränderte gültige Strings, alle erlaubten Container, ungültige Typen, Abwesenheit des alten Node-Typs in beiden Katalogen und Ablehnung alter Referenzen bei der Validierung, Sonderzeichen, benannte/numerische Entities, ungültige Codepoints und einmalige Dekodierung verschachtelter Referenzen.

## 2. Listenfolgen

| Node | Inputs | Outputs |
|---|---|---|
| `Standard.Values.List.Range` | `start: Integer`, `count: Integer`, `step: Integer` optional, Standard 1 | `value: Array<Integer>` |

Erzeugt genau `count` Werte nach `start + index * step`. `count = 0` ergibt eine leere Liste; negative Anzahl und Schrittweite 0 werden abgelehnt, negative Schrittweiten sind erlaubt. Ganzzahlüberläufe führen zu einem Fehler. Eine gemeinsame, dokumentierte Grenze für die Materialisierung verhindert unbegrenzte Speicherbelegung und muss in beiden Laufzeiten gleich gelten.

Tests: leere Folge, positive/negative Schritte, Standardwert, ungültige Anzahl, Überlauf und Materialisierungsgrenze.

## 3. URLs und Navigation

| Node | Inputs | Outputs |
|---|---|---|
| `Standard.Url.EncodeComponent` | `value: string` | `value: string` |
| `Standard.Url.DecodeComponent` | `value: string` | `value: string` |
| `Standard.Url.Build` | `base: string`; `segments: Array<string>` optional; `query: Array<{name: string, value: string}>` optional; `fragment: string` optional | `value: string` |

Komponenten werden mit UTF-8 und Prozentkodierung gemäß einer gemeinsamen Zeichentabelle kodiert. `DecodeComponent` behandelt `+` als Plus und lehnt fehlerhafte Prozentkodierung beziehungsweise ungültiges UTF-8 ab. Es handelt sich nicht um Formulardekodierung.

`Build` unterstützt absolute HTTP(S)-URLs und relative Navigationspfade. Segmente und Query-Werte werden unkodiert übergeben und genau einmal kodiert. Die Query-Liste bewahrt Reihenfolge und wiederholte Namen. Vorhandene Query-Parameter bleiben erhalten; neue Einträge werden angehängt. Ein nicht übergebenes Fragment bleibt erhalten, ein explizit leeres entfernt es. Ein Slash innerhalb eines Segments wird kodiert. Verbindliche Fixtures definieren Pfadtrenner, leere Segmente und vorhandene Prozentkodierungen in `base`. Die Node liefert nur Text; Navigation erfolgt durch den aufrufenden Prozess.

Tests: relative/absolute Ziele, Umlaute und Emoji, reservierte Zeichen, wiederholte Query-Schlüssel, vorhandene Query/Fragmente, leere Eingaben und fehlerhafte Kodierung.

## 4. Schema-Validierung

| Node | Inputs | Outputs |
|---|---|---|
| `Standard.Validation.ValidateSchema` | `value: T`; `schemaId: string`; `schemaVersion: string` | `valid: Bool`; `errors: Array<SchemaValidationError>` |

Ein Fehlerdatensatz enthält mindestens `path` als JSON Pointer, `keyword`, `message` und `schemaPath`. Datenfehler liefern `valid = false` und Fehlerdaten. Nicht verfügbare Schemas, ungültige Schemas oder Fehler beim Auflösen von Referenzen führen zu einem Node-Fehler und werden nicht als ungültige Nutzdaten ausgegeben.

Umsetzung:

1. Einen Host-Vertrag für die Auflösung von Schema-ID und unveränderlicher Version definieren; die bestehende Adam-Schema-Bibliothek über einen Adapter anbinden.
2. Unterstützten JSON-Schema-Dialekt, Keywords und `format`-Prüfungen verbindlich festlegen. Nur dieser gemeinsame Umfang gilt als portabel.
3. Flow-Werte über die vorhandenen Wert-/JSON-Konvertierungen normalisieren; Semantik für Decimal, Datum und fehlende Felder ausdrücklich testen.
4. Kompilierte Validatoren anhand von Schema-ID, Version/Inhalt und Validator-Konfiguration cachen. Referenzierte Schemas gehören zur Cache-Identität. Mandantenbezogene Quellen dürfen nicht kollidieren.
5. Browser- und Backend-Adapter implementieren. Eine identische unveränderliche Version muss in beiden Laufzeiten auf denselben Schema-Inhalt zeigen; Konflikte werden abgelehnt.
6. Fehlerstruktur und Reihenfolge normalisieren. Fehlermeldungstexte dürfen keine technische Engine-Ausgabe voraussetzen.

Tests: gültige/ungültige Daten, erforderliche Felder, zusätzliche Properties, verschachtelte Arrays, `$ref`, Formats, Versionswechsel, Cache-Isolation und identische normalisierte Fehler in beiden Laufzeiten. Für die portable Kennzeichnung müssen beide Hosts den Schema-Vertrag erfüllen.

## 5. Datum und Rundung

| Node | Inputs | Outputs | Verhalten |
|---|---|---|---|
| `Standard.Date.EndOfMonth` | `value: DateTimeOffset` | `value: DateTimeOffset` | Letzter darstellbarer Zeitpunkt des Monats gemäß der gemeinsamen Zeitauflösung; Offset bleibt erhalten. |
| `Standard.Date.StartOfWeek` | `value: DateTimeOffset`; `firstDayOfWeek: Integer` optional, Standard 1 | `value: DateTimeOffset` | Beginn des Wochentages um 00:00 mit gleichem Offset. 1 = Montag bis 7 = Sonntag. |
| `Standard.Date.DaysInMonth` | `value: DateTimeOffset` | `value: Integer` | Anzahl der Tage im lokalen Monat des Eingabewerts. |
| `Standard.Math.Decimal.Floor` | `value: Decimal` | `value: Decimal` | Rundet zur nächstkleineren ganzen Zahl. |
| `Standard.Math.Decimal.Ceiling` | `value: Decimal` | `value: Decimal` | Rundet zur nächstgrößeren ganzen Zahl. |
| `Standard.Math.Decimal.Truncate` | `value: Decimal` | `value: Decimal` | Entfernt Nachkommastellen in Richtung 0. |

Vor Implementierung von `EndOfMonth` die gemeinsame DateTimeOffset-Auflösung prüfen und einen exakten browser-/backendfähigen Vertrag festlegen; nicht .NET-Ticks und JavaScript-Millisekunden mischen. Zeiträume in Datenbankabfragen sollten vorzugsweise die exklusive Grenze „Beginn Folgemonat“ verwenden. Die Nodes führen keine implizite Umrechnung in die Zeitzone des Hosts durch.

Decimal-Operationen verwenden die vorhandene portable Decimal-Arithmetik, keine Konvertierung über JavaScript `Number`. Separate Integer-Rundungsnodes sind nicht erforderlich.

Tests: Schaltjahre, Dezember/Januar, unterschiedliche Offsets, alle Wochenanfänge, Wertebereichsgrenzen sowie positive/negative Dezimalwerte, exakte Ganzzahlen und große Präzision.

## 6. Datenbank-Aggregate

| Node | Inputs | Outputs |
|---|---|---|
| `Backend.Query.Sum` | `query: Queryable<TNumber>` | `value: TNumber` |
| `Backend.Query.Average` | `query: Queryable<TNumber>` | `value: Decimal`, nullable |
| `Backend.Query.Min` | `query: Queryable<TNumber>` | `value: TNumber`, nullable |
| `Backend.Query.Max` | `query: Queryable<TNumber>` | `value: TNumber`, nullable |

Version 1 unterstützt Integer und Decimal. Ein Feld wird vorher mit der vorhandenen `Query.Select`-Node projiziert. Die bestehenden Query-Bindungen, Typprüfung und Übersetzung werden um diese terminalen Operationen erweitert.

Die Aggregation erfolgt serverseitig in der Datenbank. Keine stille Auswertung über `ToList` oder im Prozessspeicher. Leere Mengen liefern bei Sum 0, bei Average/Min/Max null. Nullable Elemente werden ignoriert; ausschließlich null enthaltende Mengen folgen derselben Regel. Integer-Average wird vor der Aggregation passend in Decimal überführt. Provider, die den geforderten Vertrag nicht übersetzen können, liefern einen erklärenden Fehler.

Tests: Integration mit dem tatsächlich unterstützten relationalen Provider, leere Mengen, nullable Elemente, Where/Select-Komposition, Präzision, Überlauf und Cancellation. Ausgeführtes SQL beziehungsweise Command-Interception muss bestätigen, dass keine vollständigen Datensätze geladen werden. Ein EF-InMemory-Test allein reicht nicht aus.

## 7. Verschachteltes JSON ändern

| Node | Inputs | Outputs |
|---|---|---|
| `Standard.JSON.SetPath` | `value: Json`; `path: string`; `replacement: Json` | `value: Json` |
| `Standard.JSON.RemovePath` | `value: Json`; `path: string` | `value: Json` |

Die tatsächliche JSON-Typrepräsentation wird aus den vorhandenen JSON-Nodes übernommen. Pfade verwenden dieselbe JSON-Pointer-Syntax wie `GetPath`, einschließlich `~0` und `~1`. Eingaben werden nicht mutiert.

`SetPath` ersetzt ein vorhandenes Ziel oder ergänzt eine Property am vorhandenen Elternobjekt. Fehlende Elternpfade werden abgelehnt. Bei Arrays dürfen vorhandene Indizes ersetzt werden; `-` hängt ein Element an. Der leere Pfad ersetzt das Wurzeldokument.

`RemovePath` entfernt eine Property oder ein Arrayelement; nachfolgende Arrayindizes rücken auf. Ein fehlendes Ziel ergibt ein unverändertes Dokument. Ungültige Pointer und unpassende Containerzugriffe sind Fehler. Das Entfernen der Wurzel wird abgelehnt, da der Output weiterhin ein vorhandenes JSON-Dokument sein muss.

Tests: verschachtelte Objekte/Arrays, escaped Schlüssel, Root-Ersetzung, fehlende Eltern/Ziele, ungültige Indizes und Unverändertheit der Eingabe.

## 8. Subgraph messen

| Node | Inputs | Outputs |
|---|---|---|
| `Standard.Flow.Measure` | `graph: Graph<I, O>`; dynamische Inputs gemäß `I` | dynamische Outputs gemäß `O`; separater strukturierter Messwert |

Die Node führt den Subgraphen genau einmal aus und reicht dessen Ergebnisse unverändert weiter. Die Messung nutzt die vorhandene Instrumentierung und eine monotone Uhr. Erfolgreich abgeschlossene Graphen liefern mindestens eine verstrichene Dauer; Self-/System-Zeiten werden nur ausgegeben, soweit die bestehende Instrumentierung diese belastbar ermittelt. Nicht verfügbare Messwerte sind ausdrücklich optional und niemals erfundene Nullwerte.

Vor Umsetzung ist das Namensschema für Ergebnis- und Messports festzulegen, damit ein Graph-Output namens `metrics` nicht kollidiert. Die Graphschnittstelle wird über die bestehenden Control-Graph-Verträge erzeugt. Fehler und Cancellation werden weitergereicht; die Instrumentierung darf abgeschlossene Messinformationen trotzdem im Trace erfassen.

Browser- und Backend-Ausführung werden unterstützt. Bei hybriden Aufrufen umfasst die beobachtete Gesamtdauer auch Transport und Wartezeiten; diese ist keine CPU-Zeit. UI-Wartezeit muss in der Dokumentation ausdrücklich erklärt werden. Parallele Kindzeiten dürfen nicht einfach addiert und von der Gesamtdauer subtrahiert werden.

Tests: Ergebnisweitergabe, leere und verschachtelte Graphen, Fehler, Cancellation, parallele Ausführung und Messbetrieb ohne aktiviertes Detailprofiling. Ein Benchmark quantifiziert den zusätzlichen Aufwand der Measure-Node, ohne fragile feste Zeitlimits in Unit-Tests zu verwenden.

## Umsetzung in Etappen

1. **Verträge und Fixtures:** endgültige Namen, Porttypen, Null-/Missing-Semantik und offene Detailentscheidungen für HTML, Datum, Schemas und Measure festlegen. Bestehende Erweiterungspunkte prüfen.
2. **Kleine portable Wert-Nodes:** DefaultIfWhiteSpace, IsEmpty, Range und Decimal-Rundungen implementieren; gleichzeitig List.IsEmpty vollständig entfernen und mitgelieferte Beispiele sowie Fixtures umstellen. Metadaten, Editor und Parität prüfen.
3. **Text, URLs und Datum:** HTML- und URL-Nodes sowie Datumserweiterungen anhand gemeinsamer Fixtures ergänzen.
4. **JSON-Pfade:** vorhandene Pointer-Verarbeitung gemeinsam nutzen und unveränderliche Set-/Remove-Operationen ergänzen.
5. **Schema-Validierung:** Resolver und Cache-Verträge sowie beide Runtime-Adapter implementieren, danach Adam-Schemaquellen integrieren.
6. **Query-Aggregate:** Bindings, Übersetzung und relationale Integrationstests ergänzen.
7. **Measure:** Profiling-Anbindung und Graphschnittstelle umsetzen; anschließend Overhead messen.
8. **Auslieferung:** vollständige Paketprüfungen, generierte Referenz und Metadaten-Coverage aktualisieren. Paketversionen erhöhen und die Übernahme in Adam als eigenen Integrationsschritt durchführen.

Schema-Validierung, Query-Aggregate und Measure können nach Festlegung ihrer Verträge unabhängig von den kleinen Wert-Nodes umgesetzt werden. Die fachliche Priorität von Schema-Validierung ist hoch; ihre größere Integrationsarbeit rechtfertigt eine eigene Etappe.

## Abnahmekriterien

- Alle 22 Nodes sind registriert, im passenden Editor-Katalog auffindbar und mit Node-/Input-Beschreibungen versehen.
- Portable Nodes liefern auf gemeinsamen Fixtures identische Werte und Fehlersemantik in Browser und Backend.
- Unzulässige Typen und unpassende Graphschnittstellen werden vor der Ausführung angezeigt.
- `Standard.Values.List.IsEmpty` ist vollständig entfernt und wird weder als Alias noch über einen Legacy-Pfad unterstützt. Alte Graphreferenzen werden als unbekannter Node-Typ abgelehnt; mitgelieferte Beispiele und Fixtures verwenden `Standard.Values.IsEmpty<T>`. Für diese Ersetzung wird keine Rückwärtskompatibilität oder automatische Migration bereitgestellt.
- Query-Aggregate laufen nachweislich in der Datenbank; Schema-Validatoren verwenden korrekt isolierte Caches.
- Measure verfälscht weder Ergebnisse noch Fehlerverhalten und dokumentiert seine Messgrenzen.
- Paketprüfungen und Metadaten-Coverage sind erfolgreich; die generierte Referenz beschreibt die finalen Verträge.
