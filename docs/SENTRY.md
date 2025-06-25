# Sentry Integration

Dieser Adapter verwendet Sentry für das Monitoring von Fehlern und Performance-Problemen.

## Was ist Sentry?

Sentry ist ein Error-Monitoring Service, der automatisch Fehler erfasst und detaillierte Informationen für die Fehleranalyse bereitstellt.

## Funktionalitäten

### Automatische Fehlererkennung
- Alle unbehandelten Exceptions werden automatisch an Sentry gesendet
- Stack Traces und Kontext-Informationen werden mitgeliefert
- Fehler werden gruppiert und dedupliziert

### Datenschutz und Sicherheit
Die Sentry-Integration wurde mit besonderem Fokus auf Datenschutz entwickelt:

- **Sensitive Daten werden gefiltert**: Passwörter, API-Keys, Tokens und andere sensible Informationen werden automatisch aus Fehlermeldungen entfernt
- **Sampling Rate**: Nur 10% der Events werden gesendet, um die Quota zu schonen
- **Lokale Filterung**: Sensible Daten werden bereits vor dem Senden an Sentry entfernt

### Breadcrumbs
Das System erstellt automatisch Breadcrumbs für wichtige Adapter-Ereignisse:
- Adapter-Start und -Stop
- Initialisierungsschritte
- Wichtige Lifecycle-Events

### Kontext-Informationen
Zusätzliche Informationen werden mit Fehlern gesendet:
- Adapter-Version
- Namespace der Instanz
- Konfigurationsdetails (anonymisiert)
- Anzahl der Räume
- Aktuelle Phase der Ausführung

## Konfiguration

Die Sentry-Integration ist standardmäßig aktiviert. Die DSN (Data Source Name) ist fest im Code hinterlegt.

### Umgebungen
- **Production**: Normale Sentry-Erfassung
- **Development**: Entwicklungsumgebung wird entsprechend markiert

## Implementierungsdetails

### SentryUtils Klasse
Die `SentryUtils` Klasse in `src/lib/sentry.ts` bietet folgende Methoden:

```typescript
// Initialisierung
SentryUtils.init(dsn, version, namespace)

// Fehler erfassen
SentryUtils.captureException(error, context)

// Nachrichten senden
SentryUtils.captureMessage(message, level, context)

// Breadcrumbs hinzufügen
SentryUtils.addBreadcrumb(message, category, level)

// Kontext setzen
SentryUtils.setContext(key, value)
```

### Integration in den Adapter
Sentry ist in die folgenden Adapter-Bereiche integriert:

1. **Initialisierung**: Sentry wird beim Adapter-Start initialisiert
2. **Error Handling**: Try-catch-Blöcke in kritischen Methoden
3. **Lifecycle Events**: Breadcrumbs für wichtige Ereignisse
4. **Shutdown**: Sauberes Schließen von Sentry beim Adapter-Stop

### Datenschutz-Filter
Folgende sensible Daten werden automatisch gefiltert:
- `password=***`
- `apiKey=***`
- `token=***`
- `secret=***`

## Vorteile

- **Proaktive Fehlererkennung**: Probleme werden erkannt, bevor Benutzer sie melden
- **Detaillierte Fehleranalyse**: Stack Traces und Kontext helfen bei der schnellen Problemlösung
- **Performance-Monitoring**: Langsame Operationen werden erkannt
- **Trend-Analyse**: Verschlechterung der Stabilität wird frühzeitig erkannt
- **Automatische Gruppierung**: Ähnliche Fehler werden zusammengefasst

## Deaktivierung

Falls Sentry deaktiviert werden soll, kann dies durch Entfernen der DSN oder durch Setzen einer leeren DSN erfolgen. Der Adapter funktioniert auch ohne Sentry normal weiter.

## Weitere Informationen

Mehr Informationen zu Sentry finden Sie unter: https://sentry.io/
