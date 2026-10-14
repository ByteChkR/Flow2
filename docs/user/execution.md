# Ausführung und Fehler

[Home](../README.md) / **Ausführung und Fehler**

Der Editor bietet nur Ausführungsarten an, die der Graph erfüllen kann.

| Ausführung | Voraussetzung | Verhalten |
| --- | --- | --- |
| Lokal im Browser | Ausschließlich Browser-Nodes | Kein HTTP-Roundtrip; geeignet für kleine, interaktive Berechnungen |
| Backend | Ausschließlich Backend-Nodes | Der Host validiert und führt den Graphen serverseitig aus |
| Koordiniert | Browser- und/oder Backend-Segmente mit kompatiblen Übergängen | Browser und Backend tauschen nur codec-kodierte Grenzwerte aus |

Ein Fehler verweist auf Node und Ursache, sofern sie bekannt sind. Die Meldungsansicht kann Fehler, Warnungen und Informationen getrennt ein- oder ausblenden. Während der Ausführung zeigt die Statistics-Ansicht statische Graphdaten sowie, bei aktiviertem Profiler, Segment- und Node-Zeiten.

Ein lokaler Browserlauf kann keine Backend-Nodes ausführen. Ein Flow mit Browser-Nodes kann nicht allein vom Backend gestartet werden, weil interaktive Browsersegmente eine gebundene Browserausführung benötigen.
