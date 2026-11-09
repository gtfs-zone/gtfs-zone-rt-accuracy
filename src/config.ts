/** Application-wide constants. */
export const CONFIG = {
  /** The public bucket gtfs-zone-rt-archive publishes TIDES packages to. */
  ARCHIVE_BASE: 'https://rt-archive.gtfs.zone',

  // Per-device map preferences, not part of a shared link.
  MAP_VIEW_KEY: 'accuracy.map.view',
  MAP_APPEARANCE_KEY: 'accuracy.map.appearance',
  /** The metric the panel shows, per device. */
  METRIC_KEY: 'accuracy.metric',

  /** A vehicle drops off the map this long after its last fix, in seconds. */
  FIX_MAX_AGE_S: 300,
  /** Slider resolution, in seconds. */
  SLIDER_STEP_S: 30,
  /** Playback: simulated seconds per tick, and the tick length. */
  PLAY_STEP_S: 30,
  PLAY_TICK_MS: 200,

  /** Longest archive date range one load may span. */
  MAX_RANGE_DAYS: 31,
} as const;
