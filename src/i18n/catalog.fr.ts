import type { Translation } from 'gtfs-zone-web-common/i18n/index';
import type { en } from './catalog.en';

/** accuracy.rt.gtfs.zone's UI strings, in French. */
export const fr: Translation<typeof en> = {
  'app.title':
    'accuracy.rt.gtfs.zone - Quelle est la précision des prédictions GTFS Realtime ?',
  'app.noWebgl':
    'La carte nécessite WebGL, que ce navigateur a désactivé ou ne prend pas en charge.',

  'shell.noData': 'Aucune donnée chargée',
  'shell.browse': 'Parcourir',
  'shell.help': 'Aide',

  'nav.theme': 'Changer de thème',
  'nav.guide': 'Guide',
  'nav.load': 'Charger',

  'load.title': 'Charger des données TIDES',
  'load.archive': 'Depuis rt-archive.gtfs.zone',
  'load.feed': 'Flux',
  'load.from': 'Du',
  'load.to': 'Au',
  'load.days': '{n} jours enregistrés, du {first} au {last}',
  'load.upload': 'Téléverser un paquet',
  'load.package': 'Paquet TIDES (zip, ou les fichiers du dossier d’un paquet)',
  'load.gtfs': 'Zip GTFS (facultatif, pour la carte et la référence gps)',
  'load.actuals': 'Heures réelles d’une autre source (facultatif)',
  'load.actualsHint':
    'Un paquet TIDES dont les stop_visits remplacent ceux ci-dessus, appariés par date de service, course planifiée et numéro d’arrêt. Ajoutez son trips_performed si trip_id_performed diffère de trip_id_scheduled.',
  'load.submit': 'Charger',
  'load.cancel': 'Annuler',
  'load.indexFailed': 'Impossible de lire l’index de l’archive : {reason}',
  'load.pickPackage':
    'Choisissez un paquet à téléverser, ou un flux de l’archive.',
  'load.badRange':
    'La période doit aller vers l’avant et couvrir au plus {max} jours.',
  'load.progress': 'Chargement des paquets {done}/{total}',
  'load.gtfsLoading': 'Chargement de l’instantané GTFS',
  'load.gtfsFailed':
    'Pas d’instantané GTFS : {reason}. La référence gps est ignorée.',
  'load.scoring': 'Évaluation des prédictions',
  'load.loaded': '{label} chargé',
  'load.failed': 'Impossible de charger {label} : {reason}',

  'slider.play': 'Lecture',
  'slider.pause': 'Pause',
  'slider.time': 'Heure de la carte',
  'slider.vehicles': '{n} véhicules',

  'report.summary':
    '{trips} courses, {visits} passages évalués, {samples} échantillons.',
  'report.unresolved':
    '{n} lignes de prédiction n’ont pu être associées à une course et un arrêt planifiés.',
  'report.noSamples':
    'Aucun passage n’a à la fois une prédiction et une heure réelle : rien à évaluer.',
  'report.metric': 'Mesure',
  'report.overall': 'Ensemble',
  'report.byHorizon': 'Par horizon (minutes avant l’heure réelle)',
  'report.chart': '{metric} par horizon',
  'report.byRoute': 'Par ligne',
  'report.byDate': 'Par date de service',
  'report.byHour': 'Par heure locale ({zone})',
  'report.coverage': 'Couverture de l’enregistrement',
  'report.noGaps': 'Aucune interruption.',
  'report.gap': 'Interruption de {from} à {to} ({minutes} min)',
  'report.recorded': '{date} : enregistré de {from} à {to}',
  'report.producer': 'Producteur',
  'report.baseline': 'référence',
  'report.method':
    'Chaque passage est échantillonné chaque minute, de sa première prédiction à son heure réelle. Les erreurs sont prédit moins réel, en minutes ; un biais positif signifie en retard. Un échantillon ne compte que si chaque producteur avait une prédiction ; la couverture est la part des échantillons où il en avait une.',
  'report.noGps':
    'La référence gps nécessite l’instantané GTFS, qui n’a pas pu être chargé.',

  'metric.mae': 'EAM',
  'metric.median': 'Médiane',
  'metric.p90': 'p90',
  'metric.bias': 'Biais',
  'metric.coverage': 'Couverture',
  'metric.n': 'n',
  'metric.maeLong': 'Erreur absolue moyenne (min)',
  'metric.medianLong': 'Erreur absolue médiane (min)',
  'metric.p90Long': '90e centile de l’erreur absolue (min)',
  'metric.biasLong': 'Erreur signée moyenne (min, + = en retard)',
  'metric.coverageLong': 'Part des échantillons avec une prédiction',
  'metric.nLong': 'Échantillons évalués en face à face',

  'help.welcome.label': 'Bienvenue',
  'help.welcome.title': 'Bienvenue sur accuracy.rt.gtfs.zone',
  'help.welcome.lede':
    'Les prédictions d’arrivée GTFS Realtime sont-elles proches de la réalité ? Chargez des prédictions enregistrées pour le savoir.',
  'help.welcome.load': 'Charger des données',
  'help.welcome.loadText':
    'Choisissez un flux et des dates sur rt-archive.gtfs.zone, ou téléversez votre propre paquet TIDES.',
  'help.welcome.score': 'Lire les scores',
  'help.welcome.scoreText':
    'Chaque producteur est comparé aux heures réelles par horizon, ligne, date et heure.',
  'help.welcome.baselines': 'Comparer aux références',
  'help.welcome.baselinesText':
    'schedule, last-stop et gps sont des prédictions simples calculées dans votre navigateur. Un bon flux fait mieux.',
  'help.welcome.replay': 'Rejouer la journée',
  'help.welcome.replayText':
    'Faites glisser le curseur de temps pour voir où étaient les véhicules.',
  'help.welcome.start': 'Commencer !',

  'help.baselines.label': 'Références',
  'help.baselines.title': 'Comment les références prédisent',
  'help.baselines.schedule':
    'schedule : l’heure planifiée, comme si le véhicule était toujours à l’heure.',
  'help.baselines.lastStop':
    'last-stop : le retard au dernier arrêt quitté par le véhicule, reporté sur tous les arrêts suivants. Avant le départ, le retard déjà pris par le départ.',
  'help.baselines.gps':
    'gps : la dernière position du véhicule, datant d’au plus 5 minutes, placée sur la ligne reliant les arrêts de la course. Son retard est l’heure de la position moins l’heure planifiée à cet endroit.',
  'help.baselines.floor':
    'Aucune référence ne prédit une heure antérieure à l’heure de l’échantillon.',

  'help.about.blurb':
    'accuracy.rt.gtfs.zone évalue les prédictions d’horaires GTFS Realtime par rapport aux heures auxquelles les véhicules ont réellement atteint chaque arrêt.',
  'help.about.blurb2':
    'Les données sont des paquets TIDES : enregistrés par gtfs.zone et publiés sur rt-archive.gtfs.zone, ou téléversés depuis votre ordinateur. Tout est calculé dans votre navigateur.',
  'help.about.subject': 'Retour sur accuracy.rt.gtfs.zone',
  'help.about.sibling': 'suivre un flux GTFS Realtime en direct sur une carte',
};
