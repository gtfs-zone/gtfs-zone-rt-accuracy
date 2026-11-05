/** accuracy.rt.gtfs.zone's UI strings, in English: the source of the keys. */
export const en = {
  'app.title':
    'accuracy.rt.gtfs.zone - How accurate are GTFS Realtime predictions?',
  'app.noWebgl':
    'The map needs WebGL, which this browser has turned off or does not support.',

  'shell.noData': 'No data loaded',
  'shell.browse': 'Browse',
  'shell.help': 'Help',

  'nav.theme': 'Toggle theme',
  'nav.guide': 'Guide',
  'nav.load': 'Load',

  'load.title': 'Load TIDES data',
  'load.archive': 'From archive.rt.gtfs.zone',
  'load.feed': 'Feed',
  'load.from': 'From',
  'load.to': 'To',
  'load.days': '{n} days recorded, {first} to {last}',
  'load.upload': 'Upload a package',
  'load.package': 'TIDES package (zip, or the files of one package folder)',
  'load.gtfs': 'GTFS zip (optional, for the map and the gps baseline)',
  'load.actuals': 'Actuals from another source (optional)',
  'load.actualsHint':
    'A TIDES package whose stop_visits replace the ones above, matched on service date, scheduled trip and stop sequence. Add its trips_performed when trip_id_performed differs from trip_id_scheduled.',
  'load.submit': 'Load',
  'load.cancel': 'Cancel',
  'load.indexFailed': 'Could not read the archive index: {reason}',
  'load.pickPackage': 'Pick a package to upload, or a feed from the archive.',
  'load.badRange':
    'The date range must run forwards and span at most {max} days.',
  'load.progress': 'Loading packages {done}/{total}',
  'load.gtfsLoading': 'Loading the GTFS snapshot',
  'load.gtfsFailed': 'No GTFS snapshot: {reason}. The gps baseline is skipped.',
  'load.scoring': 'Scoring predictions',
  'load.loaded': 'Loaded {label}',
  'load.failed': 'Could not load {label}: {reason}',

  'slider.play': 'Play',
  'slider.pause': 'Pause',
  'slider.time': 'Map time',
  'slider.vehicles': '{n} vehicles',

  'report.summary':
    '{trips} trips, {visits} stop visits scored, {samples} samples.',
  'report.unresolved':
    '{n} prediction rows could not be matched to a scheduled trip and stop.',
  'report.noSamples':
    'No stop visit has both a prediction and an actual time, so there is nothing to score.',
  'report.metric': 'Metric',
  'report.overall': 'Overall',
  'report.byHorizon': 'By horizon (minutes before the actual time)',
  'report.chart': '{metric} by horizon',
  'report.byRoute': 'By route',
  'report.byDate': 'By service date',
  'report.byHour': 'By local hour ({zone})',
  'report.coverage': 'Recording coverage',
  'report.noGaps': 'No gaps.',
  'report.gap': 'Gap {from} to {to} ({minutes} min)',
  'report.recorded': '{date}: recorded {from} to {to}',
  'report.producer': 'Producer',
  'report.baseline': 'baseline',
  'report.method':
    'Each stop visit is sampled every minute from its first prediction to its actual time. Errors are predicted minus actual, in minutes; a positive bias means late. A sample counts only when every producer had a prediction; coverage is the share of samples where one did.',
  'report.noGps':
    'The gps baseline needs the GTFS snapshot, which did not load.',

  'metric.mae': 'MAE',
  'metric.median': 'Median',
  'metric.p90': 'p90',
  'metric.bias': 'Bias',
  'metric.coverage': 'Coverage',
  'metric.n': 'n',
  'metric.maeLong': 'Mean absolute error (min)',
  'metric.medianLong': 'Median absolute error (min)',
  'metric.p90Long': '90th percentile absolute error (min)',
  'metric.biasLong': 'Mean signed error (min, + = late)',
  'metric.coverageLong': 'Share of samples with a prediction',
  'metric.nLong': 'Samples scored head to head',

  'help.welcome.label': 'Welcome',
  'help.welcome.title': 'Welcome to accuracy.rt.gtfs.zone',
  'help.welcome.lede':
    'How close do GTFS Realtime arrival predictions get to what actually happened? Load recorded predictions and find out.',
  'help.welcome.load': 'Load data',
  'help.welcome.loadText':
    'Pick a feed and dates from archive.rt.gtfs.zone, or upload your own TIDES package.',
  'help.welcome.score': 'Read the scores',
  'help.welcome.scoreText':
    'Each producer is compared with actual times by horizon, route, date and hour.',
  'help.welcome.baselines': 'Compare with baselines',
  'help.welcome.baselinesText':
    'schedule, last-stop and gps are simple predictions made in your browser. A good feed beats them.',
  'help.welcome.replay': 'Replay the day',
  'help.welcome.replayText':
    'Drag the time slider to see where the vehicles were.',
  'help.welcome.start': 'Get started!',

  'help.baselines.label': 'Baselines',
  'help.baselines.title': 'How the baselines predict',
  'help.baselines.schedule':
    'schedule: the scheduled time, as if the vehicle were always on time.',
  'help.baselines.lastStop':
    'last-stop: the delay at the last stop the vehicle left, carried to every later stop. Before the trip departs, how late its departure already is.',
  'help.baselines.gps':
    'gps: the latest vehicle position, at most 5 minutes old, placed on the line through the trip stops. Its delay is the time of the fix minus the scheduled time at that point.',
  'help.baselines.floor': 'No baseline predicts a time before the sample time.',

  'help.about.blurb':
    'accuracy.rt.gtfs.zone scores GTFS Realtime stop time predictions against the times vehicles actually reached each stop.',
  'help.about.blurb2':
    'Data comes as TIDES packages: recorded by gtfs.zone and published at archive.rt.gtfs.zone, or uploaded from your computer. Everything is computed in your browser.',
  'help.about.subject': 'accuracy.rt.gtfs.zone feedback',
  'help.about.sibling': 'watch a GTFS Realtime feed live on a map',
} as const;
