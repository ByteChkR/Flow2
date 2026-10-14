# Verträge und Kompatibilität

[Home](../) / **Verträge und Kompatibilität**

Die kanonischen JSON-Schemas liegen in `local/packages/core/src/contracts`. Sie werden vom npm-Kernpaket ausgeliefert und im .NET-Kernpaket eingebettet. Flow-Schema-Version ist aktuell `2`, Bundle-Schema-Version ist `1`.

Ein Flow speichert Node-Typ und Node-Version, konkrete Laufzeit, Konfiguration, optionale Inline-Eingaben, Daten- und Kontrollflussverbindungen sowie optionale Kennzeichnung und Flow-Schnittstelle. Eine Änderung an einer bestehenden Node-ID oder ihrem Portvertrag ist damit kompatibilitätsrelevant. Stattdessen wird eine neue Node-Version registriert oder eine neue Node-ID eingeführt.

Ein Port kann primitive Werte, skalare Domänentypen, Objekte, Arrays, Dictionaries, optionale oder nullable Werte, Entity-Referenzen, Graphsignaturen und spezialisierte Query-/Enumerable-Typen beschreiben. Optionalität bedeutet, dass der Port unverbunden bleiben darf; nullable beschreibt einen vorhandenen Wert `null`. Inline-Werte sind nur für primitive Eingänge vorgesehen und werden deaktiviert, sobald ein externer Eingang verbunden wird.

Codecs tragen Typ-ID und Version. Ihre Wire-Payload wird vor dem Decode validiert; danach wird der wiederhergestellte logische Wert erneut geprüft. Registry- und Paketversionen sind davon getrennt: Eine Paketversion ist eine Distributionsversion, keine Graphversion.

## Kompatibilitätsentscheidungen

| Änderung | Kompatibel mit gespeicherten Graphen? | Vorgehen |
| --- | --- | --- |
| Label, Beschreibung oder Kategorie ändern | ja | Metadaten aktualisieren |
| Node-Implementierung mit gleicher Semantik optimieren | ja | Wertverträge und Benchmarks prüfen |
| Port hinzufügen, entfernen oder Typ ändern | nein | neue Node-Version oder neue Node-ID |
| Codec-Wireformat ändern | nein ohne explizite Kompatibilität | neue Codec-Version und Migrationsstrategie |
| Graphschnittstelle ändern | nur nach Prüfung aller Aufrufer | Editor synchronisiert und validiert Aufrufnodes |

Der Graph speichert bewusst Node-ID und Node-Version, damit ein Paketupdate nicht stillschweigend eine andere Bedeutung in einen historischen Prozess bringt. Auch eine Kennzeichnung ist Teil des Vertrags: Sie kann feste Schnittstellen oder erlaubte Laufzeiten definieren und wird beim Speichern und Starten erneut geprüft.

Details zu Typzuweisung, Boundary-Werten und Fehlermeldungen stehen unter [Validierung und Fehlermodell](validation.html).
