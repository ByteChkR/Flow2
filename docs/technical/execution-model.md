# Ausführungsmodell

[Home](../README.md) / **Ausführungsmodell**

Vor jeder Ausführung prüfen Browser und Backend Graphschema, Node-Versionen, Ports, Typzuweisbarkeit, Pflichtverbindungen, Kontrollfluss und erlaubte Laufzeit. Das Backend wiederholt diese Prüfung mit seiner Registry; ein vom Browser vorgelegter Plan oder Quelltext gilt nie als vertrauenswürdig.

Der Compiler baut einen deterministischen Plan und gliedert einen kombinierten Graphen in Browser- und Backend-Segmente. Lokale Werte bleiben im jeweiligen Ausführungskontext. An einer Laufzeitgrenze wird ein deklarierter, kompatibler Codec verwendet. Nicht transportierbare Werte, insbesondere native Entities, können diese Grenze nicht passieren.

Die Backend-Runtime führt vorbereitete Ausdrücke mit Jint aus. Jint erhält nur den generierten Wrapper und kontrollierte Host-Aufrufe, keine freie CLR-Interop. Konfiguration und Werte werden nicht als JavaScript-Quelltext eingebettet. Der Browser verwendet ebenfalls generierte, kontrollierte Aufrufe. Beide Seiten prüfen Ein- und Ausgaben gegen die Registry.

Bei koordinierter Ausführung koordiniert der Backend-Host Session, Segmentauftrag, Fortschritt und Abschluss. Browsersegmente erhalten nur die dafür vorgesehenen transportierten Eingangswerte und melden ihre Ausgangswerte oder einen Fehler zurück. Lokale Browserläufe verwenden keinen HTTP-Transport.
