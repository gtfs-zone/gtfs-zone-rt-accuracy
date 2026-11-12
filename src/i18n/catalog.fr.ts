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
  'load.from': 'Du',
  'load.to': 'Au',
  'load.days':
    '{n} jours archivés dans la période. L’archive compte {total} jours, du {first} au {last}.',
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
  'load.search': 'Rechercher des flux',
  'load.noFeeds': 'Aucun flux ne correspond.',
  'load.feedDays': '{producer}, {n} jours, dernier {last}',
  'load.dates': 'Dates',
  'load.full': 'Entièrement enregistré',
  'load.partial': 'Partiellement enregistré',
  'load.inRange': 'Dans la période',
  'load.notRecorded': 'Non enregistré',
  'load.dayInfo':
    '{trips} courses, {predictions} prédictions, {coverage} % enregistré',
  'load.actualsFiles': 'Paquet TIDES avec stop_visits',

  'slider.play': 'Lecture',
  'slider.pause': 'Pause',
  'slider.time': 'Heure de la carte',
  'slider.vehicles': '{n} véhicules',
  'slider.ghosts': 'Fantômes',
  'timeline.title': 'Frise',
  'timeline.recorded': '{date} : {share} % enregistré',
  'crumb.data': 'Données',
  'crumb.vehicle': 'Véhicule',
  'crumb.vehicleTrip': '{vehicle}, course {trip}',

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
  'report.gap': 'Interruption de {from} à {to} ({minutes} min)',
  'report.producer': 'Producteur',
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
    'Faites glisser sur la frise du panneau pour voir où étaient les véhicules.',
  'help.welcome.start': 'Commencer !',

  'help.baselines.label': 'Références',
  'help.baselines.title': 'Comment les références prédisent',
  'help.baselines.schedule':
    'schedule : l’heure planifiée, comme si le véhicule était toujours à l’heure.',
  'help.baselines.lastStop':
    'last-stop : le retard au dernier arrêt quitté par le véhicule, reporté sur tous les arrêts suivants. Avant le départ, le retard déjà pris par le départ.',
  'help.baselines.gps':
    'gps : la dernière position du véhicule, vieille de 5 minutes au plus, placée sur la ligne passant par les arrêts de la course, dans une fenêtre autour de l’horaire (voir La fenêtre gps). Son retard est l’heure de la position moins l’heure prévue à ce point.',
  'help.baselines.floor':
    'Aucune référence ne prédit une heure antérieure à l’heure de l’échantillon.',

  'help.gpsWindow.label': 'La fenêtre gps',
  'help.gpsWindow.title': 'La fenêtre gps',
  'help.gpsWindow.why':
    'Une position seule ne dit pas à quelle partie d’une course elle appartient : une boucle ou une ligne aller-retour passe deux fois par la même rue. La référence gps ne cherche le véhicule que là où l’horaire le permet à l’heure de la position.',
  'help.gpsWindow.window':
    'La fenêtre va de l’endroit où l’horaire plaçait le véhicule 60 minutes avant la position (jusqu’à 60 min de retard) à celui où il le place 10 minutes après (jusqu’à 10 min d’avance).',
  'help.gpsWindow.edges':
    'La position est placée au point le plus proche de la ligne de la course dans la fenêtre. Un véhicule plus éloigné que la fenêtre ne le permet est placé à son bord.',
  'help.gpsWindow.delay':
    'Le retard est l’heure de la position moins l’heure prévue à ce point, interpolée entre les arrêts.',
  'help.gpsWindow.origin':
    'À moins de 50 m du premier arrêt, la course compte comme pas encore partie : le retard est celui que son départ a déjà, jamais négatif.',
  'help.gpsWindow.age':
    'Seule la dernière position compte, et seulement tant qu’elle a au plus 5 minutes.',
  'help.gpsWindow.scheduled': 'horaire maintenant',
  'help.gpsWindow.fix': 'position',
  'help.gpsWindow.late': '60 min de retard',
  'help.gpsWindow.early': '10 min d’avance',

  'help.ghosts.label': 'Fantômes',
  'help.ghosts.title': 'Véhicules fantômes',
  'help.ghosts.text':
    'Activez un producteur dans la frise pour dessiner un fantôme pour chaque véhicule : un anneau là où le retard que ce producteur donne au prochain arrêt place le véhicule sur la ligne passant par les arrêts de la course. Une ligne pointillée le relie au vrai véhicule. Les références ont des anneaux pointillés.',
  'help.ghosts.filter':
    'Cliquez sur une ligne, un arrêt ou un véhicule pour y restreindre les scores et les fantômes. Cliquez sur une zone vide de la carte pour tout afficher à nouveau.',

  'help.about.blurb':
    'accuracy.rt.gtfs.zone évalue les prédictions d’horaires GTFS Realtime par rapport aux heures auxquelles les véhicules ont réellement atteint chaque arrêt.',
  'help.about.blurb2':
    'Les données sont des paquets TIDES : enregistrés par gtfs.zone et publiés sur rt-archive.gtfs.zone, ou téléversés depuis votre ordinateur. Tout est calculé dans votre navigateur.',
  'help.about.subject': 'Retour sur accuracy.rt.gtfs.zone',
  'help.about.sibling': 'suivre un flux GTFS Realtime en direct sur une carte',
};
