import type { Translation } from 'gtfs-zone-web-common/i18n/index';
import type { en } from './catalog.en';

/** accuracy.rt.gtfs.zone's UI strings, in German. */
export const de: Translation<typeof en> = {
  'app.title':
    'accuracy.rt.gtfs.zone - Wie genau sind GTFS-Realtime-Prognosen?',
  'app.noWebgl':
    'Die Karte benötigt WebGL, das in diesem Browser deaktiviert ist oder nicht unterstützt wird.',

  'shell.noData': 'Keine Daten geladen',
  'shell.browse': 'Durchsuchen',
  'shell.help': 'Hilfe',

  'nav.theme': 'Design wechseln',
  'nav.guide': 'Anleitung',
  'nav.load': 'Laden',

  'load.title': 'TIDES-Daten laden',
  'load.archive': 'Aus rt-archive.gtfs.zone',
  'load.feed': 'Feed',
  'load.from': 'Von',
  'load.to': 'Bis',
  'load.days': '{n} Tage aufgezeichnet, vom {first} bis {last}',
  'load.upload': 'Paket hochladen',
  'load.package': 'TIDES-Paket (Zip oder die Dateien eines Paketordners)',
  'load.gtfs': 'GTFS-Zip (optional, für die Karte und die gps-Referenz)',
  'load.actuals': 'Ist-Zeiten aus einer anderen Quelle (optional)',
  'load.actualsHint':
    'Ein TIDES-Paket, dessen stop_visits die obigen ersetzen, zugeordnet nach Betriebstag, geplanter Fahrt und Haltestellennummer. Fügen Sie dessen trips_performed hinzu, wenn trip_id_performed von trip_id_scheduled abweicht.',
  'load.submit': 'Laden',
  'load.cancel': 'Abbrechen',
  'load.indexFailed': 'Der Archivindex konnte nicht gelesen werden: {reason}',
  'load.pickPackage':
    'Wählen Sie ein Paket zum Hochladen oder einen Feed aus dem Archiv.',
  'load.badRange':
    'Der Zeitraum muss vorwärts laufen und darf höchstens {max} Tage umfassen.',
  'load.progress': 'Pakete werden geladen {done}/{total}',
  'load.gtfsLoading': 'GTFS-Momentaufnahme wird geladen',
  'load.gtfsFailed':
    'Keine GTFS-Momentaufnahme: {reason}. Die gps-Referenz entfällt.',
  'load.scoring': 'Prognosen werden bewertet',
  'load.loaded': '{label} geladen',
  'load.failed': '{label} konnte nicht geladen werden: {reason}',

  'slider.play': 'Abspielen',
  'slider.pause': 'Pause',
  'slider.time': 'Kartenzeit',
  'slider.vehicles': '{n} Fahrzeuge',

  'report.summary':
    '{trips} Fahrten, {visits} Halte bewertet, {samples} Stichproben.',
  'report.unresolved':
    '{n} Prognosezeilen konnten keiner geplanten Fahrt und Haltestelle zugeordnet werden.',
  'report.noSamples':
    'Kein Halt hat sowohl eine Prognose als auch eine Ist-Zeit, daher gibt es nichts zu bewerten.',
  'report.metric': 'Kennzahl',
  'report.overall': 'Gesamt',
  'report.byHorizon': 'Nach Horizont (Minuten vor der Ist-Zeit)',
  'report.chart': '{metric} nach Horizont',
  'report.byRoute': 'Nach Linie',
  'report.byDate': 'Nach Betriebstag',
  'report.byHour': 'Nach Ortszeit-Stunde ({zone})',
  'report.coverage': 'Abdeckung der Aufzeichnung',
  'report.noGaps': 'Keine Lücken.',
  'report.gap': 'Lücke von {from} bis {to} ({minutes} min)',
  'report.recorded': '{date}: aufgezeichnet von {from} bis {to}',
  'report.producer': 'Erzeuger',
  'report.baseline': 'Referenz',
  'report.method':
    'Jeder Halt wird jede Minute von seiner ersten Prognose bis zu seiner Ist-Zeit abgetastet. Fehler sind Prognose minus Ist-Zeit, in Minuten; ein positiver Bias bedeutet verspätet. Eine Stichprobe zählt nur, wenn jeder Erzeuger eine Prognose hatte; die Abdeckung ist der Anteil der Stichproben, in denen er eine hatte.',
  'report.noGps':
    'Die gps-Referenz benötigt die GTFS-Momentaufnahme, die nicht geladen werden konnte.',

  'metric.mae': 'MAE',
  'metric.median': 'Median',
  'metric.p90': 'p90',
  'metric.bias': 'Bias',
  'metric.coverage': 'Abdeckung',
  'metric.n': 'n',
  'metric.maeLong': 'Mittlerer absoluter Fehler (min)',
  'metric.medianLong': 'Median des absoluten Fehlers (min)',
  'metric.p90Long': '90. Perzentil des absoluten Fehlers (min)',
  'metric.biasLong':
    'Mittlerer vorzeichenbehafteter Fehler (min, + = verspätet)',
  'metric.coverageLong': 'Anteil der Stichproben mit einer Prognose',
  'metric.nLong': 'Im direkten Vergleich bewertete Stichproben',

  'help.welcome.label': 'Willkommen',
  'help.welcome.title': 'Willkommen bei accuracy.rt.gtfs.zone',
  'help.welcome.lede':
    'Wie nah kommen GTFS-Realtime-Ankunftsprognosen an die Wirklichkeit heran? Laden Sie aufgezeichnete Prognosen und finden Sie es heraus.',
  'help.welcome.load': 'Daten laden',
  'help.welcome.loadText':
    'Wählen Sie einen Feed und Daten aus rt-archive.gtfs.zone oder laden Sie Ihr eigenes TIDES-Paket hoch.',
  'help.welcome.score': 'Bewertungen lesen',
  'help.welcome.scoreText':
    'Jeder Erzeuger wird nach Horizont, Linie, Datum und Stunde mit den Ist-Zeiten verglichen.',
  'help.welcome.baselines': 'Mit Referenzen vergleichen',
  'help.welcome.baselinesText':
    'schedule, last-stop und gps sind einfache Prognosen, die in Ihrem Browser berechnet werden. Ein guter Feed schlägt sie.',
  'help.welcome.replay': 'Den Tag nachspielen',
  'help.welcome.replayText':
    'Ziehen Sie den Zeitregler, um zu sehen, wo die Fahrzeuge waren.',
  'help.welcome.start': 'Los geht’s!',

  'help.baselines.label': 'Referenzen',
  'help.baselines.title': 'Wie die Referenzen prognostizieren',
  'help.baselines.schedule':
    'schedule: die Fahrplanzeit, als wäre das Fahrzeug immer pünktlich.',
  'help.baselines.lastStop':
    'last-stop: die Verspätung an der letzten Haltestelle, die das Fahrzeug verlassen hat, übertragen auf alle folgenden Haltestellen. Vor Fahrtbeginn die bereits bestehende Verspätung der Abfahrt.',
  'help.baselines.gps':
    'gps: die letzte Fahrzeugposition, höchstens 5 Minuten alt, projiziert auf die Linie durch die Haltestellen der Fahrt. Ihre Verspätung ist die Zeit der Position minus der Fahrplanzeit an dieser Stelle.',
  'help.baselines.floor':
    'Keine Referenz prognostiziert eine Zeit vor dem Zeitpunkt der Stichprobe.',

  'help.about.blurb':
    'accuracy.rt.gtfs.zone bewertet GTFS-Realtime-Prognosen von Haltezeiten anhand der Zeiten, zu denen Fahrzeuge jede Haltestelle tatsächlich erreicht haben.',
  'help.about.blurb2':
    'Die Daten sind TIDES-Pakete: von gtfs.zone aufgezeichnet und auf rt-archive.gtfs.zone veröffentlicht oder von Ihrem Computer hochgeladen. Alles wird in Ihrem Browser berechnet.',
  'help.about.subject': 'Feedback zu accuracy.rt.gtfs.zone',
  'help.about.sibling':
    'einen GTFS-Realtime-Feed live auf einer Karte verfolgen',
};
