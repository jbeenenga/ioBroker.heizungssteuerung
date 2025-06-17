# ioBroker.heizungssteuerung

![Logo](admin/heizungssteuerung.png)

[![NPM version](https://img.shields.io/npm/v/iobroker.heizungssteuerung.svg)](https://www.npmjs.com/package/iobroker.heizungssteuerung)
[![Downloads](https://img.shields.io/npm/dm/iobroker.heizungssteuerung.svg)](https://www.npmjs.com/package/iobroker.heizungssteuerung)
[![Dependency Status](https://img.shields.io/david/jbeenenga/iobroker.heizungssteuerung.svg)](https://david-dm.org/jbeenenga/iobroker.heizungssteuerung)
[![Known Vulnerabilities](https://snyk.io/test/github/jbeenenga/ioBroker.heizungssteuerung/badge.svg)](https://snyk.io/test/github/jbeenenga/ioBroker.heizungssteuerung)

[![NPM](https://nodei.co/npm/iobroker.heizungssteuerung.png?downloads=true)](https://nodei.co/npm/iobroker.heizungssteuerung/)

**Tests:** [![Test and Release](https://github.com/jbeenenga/ioBroker.heizungssteuerung/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/jbeenenga/ioBroker.heizungssteuerung/actions/workflows/test-and-release.yml)

## ioBroker Adapter für Heizungssteuerung

Dieser Adapter bietet eine umfassende Heizungssteuerung für ioBroker-Installationen. Er unterstützt sowohl Heiz- als auch Kühlmodus mit erweiterten Funktionen wie Boost-Modus, Pause-Funktionalität und zeitbasierter Temperaturplanung.

[🇬🇧 English Version](README.md)

## Funktionen

- **Dual-Modus-Unterstützung**: Wechseln zwischen Heiz- und Kühlmodus
- **Boost-Modus**: Temporäre Erhöhung der Heizung/Kühlung für einzelne Räume
- **Pause-Modus**: Temporäre Deaktivierung der Heizung/Kühlung für bestimmte Räume
- **Zeitbasierte Planung**: Definition von Temperaturperioden für verschiedene Zeiten und Tage
- **Raumbasierte Steuerung**: Individuelle Temperaturverwaltung für jeden Raum
- **Feuchtigkeitssteuerung**: Stopp der Kühlung bei Erreichen von Feuchtigkeitsschwellenwerten
- **Abwesenheitsmodus**: Reduzierte Temperaturen während Urlaub oder längerer Abwesenheit
- **Temperatur-Override**: Manuelle Überschreibung der Zieltemperaturen bei Bedarf

## Installation

### Über die ioBroker Admin-Oberfläche

1. Öffnen Sie die ioBroker Admin-Oberfläche
2. Gehen Sie zum Tab "Adapter"
3. Suchen Sie nach "heizungssteuerung"
4. Klicken Sie auf "Installieren"

### Über npm

```bash
npm install iobroker.heizungssteuerung
```

## Schnellstart-Anleitung

### 1. Raumstruktur einrichten

Bevor Sie den Adapter konfigurieren, müssen Sie Ihre Raumstruktur in ioBroker einrichten:

1. Navigieren Sie zu **Objekte → Aufzählungen → Räume**
2. Erstellen Sie Räume für jeden Bereich, den Sie steuern möchten (z.B. "Wohnzimmer", "Schlafzimmer", "Küche")
3. Fügen Sie folgende Geräte zu jedem Raum hinzu:
   - Temperatursensoren
   - Heiz-/Kühlstellglieder (Ventile, Schalter, etc.)
   - Feuchtigkeitssensoren (optional)

### 2. Funktionen konfigurieren

Richten Sie die erforderlichen Funktionen unter **Objekte → Aufzählungen → Funktionen** ein:

- **Temperatur**: Alle Temperatursensor-Zustände hinzufügen
- **Feuchtigkeit**: Feuchtigkeitssensor-Zustände hinzufügen (optional)
- **Antrieb**: Alle Heiz-/Kühlstellglied-Zustände hinzufügen

### 3. Adapter-Konfiguration

#### Grundeinstellungen

- **Betriebsmodus**: Wählen zwischen "Heizen" und "Kühlen"
- **Prüfintervall**: Wie oft der Adapter Temperaturen prüft (in Minuten)
- **Standardtemperatur**: Fallback-Temperatur, wenn keine Periode passt
- **Temperatur-Hysterese**: Temperaturdifferenz-Schwellenwert für Ein-/Ausschalten der Heizung/Kühlung

#### Zeitbasierte Perioden

Konfigurieren Sie Temperaturpläne für jeden Raum:

1. Wählen Sie einen Raum aus der Dropdown-Liste
2. Setzen Sie Start- und Endzeiten
3. Definieren Sie die Zieltemperatur
4. Wählen Sie Wochentage
5. Geben Sie an, ob diese Periode für Heiz- oder Kühlmodus ist

#### Erweiterte Einstellungen

- **Pause-Dauer**: Auto-Reset-Zeit für Pause-Modus (Minuten)
- **Boost-Dauer**: Auto-Reset-Zeit für Boost-Modus (Minuten)
- **Feuchtigkeitsschwellenwert**: Maximale Feuchtigkeit bevor Kühlung stoppt
- **Reset beim Start**: Überschreibt alle Temperaturen mit Standardwerten beim Adapter-Start

## Verwendung

### Manuelle Steuerungsaktionen

Der Adapter erstellt Aktions-Objekte unter `heizungssteuerung.0.Actions`:

#### Globale Aktionen (Alle Räume)

- **absenceUntil**: Abwesenheitsmodus bis zu einem bestimmten Datum/Zeit setzen
  - Format: `dd.MM.yyyy HH:mm` (z.B. "01.01.2024 14:00")
  - Effekt: Ignoriert Perioden und verwendet Standardtemperatur
- **pause**: Alle Heizung/Kühlung temporär pausieren
- **boost**: Boost-Modus für alle Räume aktivieren

#### Raumspezifische Aktionen

Für jeden Raum finden Sie:

- **pause**: Heizung/Kühlung nur für diesen Raum pausieren
- **boost**: Boost-Modus nur für diesen Raum aktivieren
- **targetTemp**: Zieltemperatur temporär überschreiben

### Beispielkonfigurationen

#### Basis-Heizplan

```
Raum: Wohnzimmer
Zeit: 06:00 - 22:00
Tage: Montag bis Freitag
Temperatur: 21°C
Modus: Heizen
```

#### Wochenendplan

```
Raum: Wohnzimmer
Zeit: 08:00 - 24:00
Tage: Samstag, Sonntag
Temperatur: 22°C
Modus: Heizen
```

#### Nachttemperatur

```
Raum: Schlafzimmer
Zeit: 22:00 - 06:00
Tage: Alle Tage
Temperatur: 18°C
Modus: Heizen
```

## Konfigurationsbeispiele

### Typische Heimeinrichtung

1. **Wohnbereiche**: 21°C tagsüber, 19°C nachts
2. **Schlafzimmer**: 19°C tagsüber, 16°C nachts
3. **Badezimmer**: 22°C morgens/abends, 19°C sonst
4. **Büro**: 21°C während Arbeitszeiten, 18°C sonst

### Energiespar-Tipps

- Verwenden Sie niedrigere Nachttemperaturen (2-3°C Reduktion)
- Setzen Sie Abwesenheitstemperaturen 3-5°C unter normal
- Konfigurieren Sie Boost-Modus für schnelles Aufheizen statt konstant hoher Temperaturen
- Nutzen Sie Feuchtigkeitssteuerung zur Vermeidung von Überkühlung

## Fehlerbehebung

### Häufige Probleme

**Temperaturen ändern sich nicht**

- Prüfen Sie, ob Raum-Aufzählungen korrekt konfiguriert sind
- Verifizieren Sie, dass Temperatursensoren den korrekten Räumen zugeordnet sind
- Stellen Sie sicher, dass Stellglieder in der "Antrieb"-Funktions-Aufzählung sind

**Perioden funktionieren nicht**

- Verifizieren Sie das Zeitformat (24-Stunden-Format)
- Prüfen Sie, ob Betriebsmodus zur Periodenkonfiguration passt
- Bestätigen Sie die Raumauswahl in den Periodeneinstellungen

**Feuchtigkeitssteuerung funktioniert nicht**

- Fügen Sie Feuchtigkeitssensoren sowohl zu Raum- als auch Funktions-Aufzählungen hinzu
- Prüfen Sie die Feuchtigkeitsschwellenwert-Einstellungen
- Verifizieren Sie, dass Sensoren aktuelle Daten liefern

### Debug-Informationen

Aktivieren Sie Debug-Logging in den Adapter-Einstellungen, um detaillierte Informationen zu sehen über:

- Temperaturberechnungen
- Perioden-Matching
- Stellglied-Steuerungsentscheidungen
- Fehlerbedingungen

## Lizenz

MIT License

Copyright (c) 2024 jbeenenga [j.beenenga@gmail.com](mailto:j.beenenga@gmail.com)

Hiermit wird unentgeltlich jeder Person, die eine Kopie der Software und der zugehörigen Dokumentationen (die "Software") erhält, die Erlaubnis erteilt, sie uneingeschränkt zu nutzen, inklusive und ohne Ausnahme mit dem Recht, sie zu verwenden, zu kopieren, zu verändern, zusammenzufügen, zu veröffentlichen, zu verbreiten, zu unterlizenzieren und/oder zu verkaufen, und Personen, denen diese Software überlassen wird, diese Rechte zu verschaffen, unter den folgenden Bedingungen:

Der obige Urheberrechtsvermerk und dieser Erlaubnisvermerk sind in allen Kopien oder Teilkopien der Software beizulegen.

DIE SOFTWARE WIRD OHNE JEDE AUSDRÜCKLICHE ODER IMPLIZIERTE GARANTIE BEREITGESTELLT, EINSCHLIEẞLICH DER GARANTIE ZUR TAUGLICHKEIT FÜR EINEN BESTIMMTEN ZWECK UND NICHTVERLETZUNG VON RECHTEN DRITTER. DIE AUTOREN ODER COPYRIGHTINHABER SIND NICHT HAFTBAR FÜR JEGLICHEN SCHADEN ODER SONSTIGE ANSPRÜCHE, EGAL OB DIESE DURCH DIE ERFÜLLUNG EINES VERTRAGES, UNERLAUBTE HANDLUNGEN ODER ANDERWEITIG ENTSTEHEN ODER IN VERBINDUNG MIT DER SOFTWARE ODER SONSTIGER VERWENDUNG DER SOFTWARE AUFTRETEN.

## Danksagungen

Icon erstellt von Freepik ([https://www.flaticon.com/de/kostenloses-icon/heizung_1295221](https://www.flaticon.com/de/kostenloses-icon/heizung_1295221))

---

**Unterstützen Sie dieses Projekt** ⭐ Geben Sie diesem Repository einen Stern, wenn Sie es hilfreich finden!
