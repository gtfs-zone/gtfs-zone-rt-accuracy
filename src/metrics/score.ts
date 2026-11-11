/**
 * Samples every stop visit once a minute, from its first recorded prediction
 * (any producer) to its actual time, and scores the prediction each producer
 * had in effect at each sample. Errors are predicted - actual, so a positive
 * bias means predictions were late.
 *
 * Head to head: a sample counts towards the error stats only when every
 * producer had a prediction; coverage is the share of samples where one
 * producer had one.
 */

import {
  BaselineCache,
  gpsDelay,
  lastStopDelay,
  type TripBaselines,
} from './baselines';
import {
  visitKey,
  type Dataset,
  type PredictionRow,
  type Trip,
} from './dataset';

export const SAMPLE_STEP = 60;
export const HORIZONS: [number, number][] = [
  [0, 300],
  [300, 900],
  [900, 1800],
  [1800, 3600],
  [3600, 10800],
];
const MAX_HORIZON = HORIZONS[HORIZONS.length - 1][1];
export const BASELINES = ['schedule', 'last-stop', 'gps'] as const;
/** Width of an |error| histogram bin, in seconds. */
const BIN = 10;
/** Bins up to 3 h; the last one holds everything above. */
const BINS = 1081;

/** Narrows scoring to one route, the visits at some stops, or one trip. */
export interface ScoreFilter {
  routeId?: string;
  /** A stop and its child platforms. */
  stopIds?: string[];
  tripKey?: string;
}

export interface ScoreOptions {
  /** stop_id to [lat, lon]; without it there is no gps baseline. */
  stops?: Map<string, [number, number]>;
  /** Reused trip baselines; built from `stops` when absent. */
  baselines?: BaselineCache;
  /** IANA zone for the hour-of-day breakdown. */
  timeZone: string;
  filter?: ScoreFilter;
}

/** Whether `trip` passes the route and trip parts of `filter`. */
export function tripMatches(trip: Trip, filter: ScoreFilter | undefined) {
  if (!filter) {
    return true;
  }
  if (filter.routeId !== undefined && trip.routeId !== filter.routeId) {
    return false;
  }
  if (filter.tripKey !== undefined && trip.key !== filter.tripKey) {
    return false;
  }
  if (filter.stopIds) {
    const ids = filter.stopIds;
    return trip.visits.some((v) => ids.includes(v.stopId));
  }
  return true;
}

export interface ProducerStats {
  /** Share of the group's samples with a prediction from this producer. */
  coverage: number;
  /** Head-to-head samples scored. */
  n: number;
  /** Seconds; null when n is 0. */
  mae: number | null;
  median: number | null;
  p90: number | null;
  bias: number | null;
}

export interface GroupStats {
  key: string;
  samples: number;
  producers: Record<string, ProducerStats>;
}

export interface Report {
  /** Recorded producers then the baselines, in display order. */
  producers: string[];
  overall: GroupStats;
  byHorizon: GroupStats[];
  byRoute: GroupStats[];
  byDate: GroupStats[];
  byHour: GroupStats[];
  counts: {
    trips: number;
    visits: number;
    visitsWithActual: number;
    visitsScored: number;
    samples: number;
    unresolvedPredictions: number;
  };
}

class Acc {
  covered = 0;
  n = 0;
  sumAbs = 0;
  sum = 0;
  hist = new Uint32Array(BINS);

  add(err: number): void {
    const a = Math.abs(err);
    this.n++;
    this.sumAbs += a;
    this.sum += err;
    this.hist[Math.min(BINS - 1, Math.floor(a / BIN))]++;
  }

  quantile(q: number): number {
    const target = q * this.n;
    let seen = 0;
    for (let i = 0; i < BINS; i++) {
      seen += this.hist[i];
      if (seen >= target && this.hist[i] > 0) {
        return (i + 0.5) * BIN;
      }
    }
    return (BINS - 0.5) * BIN;
  }

  stats(samples: number): ProducerStats {
    const has = this.n > 0;
    return {
      coverage: samples ? this.covered / samples : 0,
      n: this.n,
      mae: has ? this.sumAbs / this.n : null,
      median: has ? this.quantile(0.5) : null,
      p90: has ? this.quantile(0.9) : null,
      bias: has ? this.sum / this.n : null,
    };
  }
}

class Group {
  samples = 0;
  accs: Acc[];

  constructor(producers: number) {
    this.accs = Array.from({ length: producers }, () => new Acc());
  }
}

class Breakdown {
  groups = new Map<string, Group>();

  constructor(private producers: number) {}

  get(key: string): Group {
    let g = this.groups.get(key);
    if (!g) {
      g = new Group(this.producers);
      this.groups.set(key, g);
    }
    return g;
  }
}

function horizonLabel(lo: number, hi: number): string {
  return `${lo / 60}-${hi / 60}`;
}

function horizonBucket(h: number): number {
  for (let i = 0; i < HORIZONS.length; i++) {
    if (h >= HORIZONS[i][0] && h < HORIZONS[i][1]) {
      return i;
    }
  }
  return -1;
}

/** Local hour of day, cached per 15 min since offsets can be half hours. */
function hourOfDay(timeZone: string): (s: number) => number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  const cache = new Map<number, number>();
  return (s) => {
    const k = Math.floor(s / 900);
    let h = cache.get(k);
    if (h === undefined) {
      h = Number(fmt.format(new Date(k * 900 * 1000)));
      cache.set(k, h);
    }
    return h;
  };
}

/** Pick the arrival or departure value matching the target. */
function pick(
  arrival: boolean,
  arr: number | null,
  dep: number | null
): number | null {
  return arrival ? (arr ?? dep) : (dep ?? arr);
}

export function score(data: Dataset, opts: ScoreOptions): Report {
  const cache = opts.baselines ?? new BaselineCache(data, opts.stops);
  const baselines = cache.stops ? [...BASELINES] : BASELINES.slice(0, 2);
  const stopIds = opts.filter?.stopIds ? new Set(opts.filter.stopIds) : null;
  const producers = [...data.producers, ...baselines];
  const recorded = data.producers.length;
  const np = producers.length;
  const hour = hourOfDay(opts.timeZone);

  const overall = new Group(np);
  const byHorizon = new Breakdown(np);
  const byRoute = new Breakdown(np);
  const byDate = new Breakdown(np);
  const byHour = new Breakdown(np);
  const horizonGroups = HORIZONS.map((_, i) => byHorizon.get(String(i)));
  const groups: Group[] = new Array(5);

  const counts: Report['counts'] = {
    trips: 0,
    visits: 0,
    visitsWithActual: 0,
    visitsScored: 0,
    samples: 0,
    unresolvedPredictions: data.unresolvedPredictions,
  };

  const values = new Float64Array(np);
  const has = new Uint8Array(np);
  const rows: (PredictionRow[] | undefined)[] = new Array(recorded);
  const ptr = new Int32Array(recorded);

  for (const trip of data.trips.values()) {
    if (!tripMatches(trip, opts.filter)) {
      continue;
    }
    counts.trips++;
    let base: TripBaselines | null = null;
    const dateGroup = byDate.get(trip.serviceDate);
    const routeGroup = byRoute.get(trip.routeId || '-');
    for (const visit of trip.visits) {
      if (stopIds && !stopIds.has(visit.stopId)) {
        continue;
      }
      counts.visits++;
      const actual = visit.actArr ?? visit.actDep;
      if (actual === null) {
        continue;
      }
      counts.visitsWithActual++;
      const arrival = visit.actArr !== null;
      const byProducer = data.predictions.get(visitKey(trip.key, visit.seq));
      if (!byProducer) {
        continue;
      }
      let first = Infinity;
      for (let p = 0; p < recorded; p++) {
        rows[p] = byProducer.get(producers[p]);
        ptr[p] = -1;
        const r = rows[p];
        if (r && r.length && r[0].ts < first) {
          first = r[0].ts;
        }
      }
      if (first >= actual) {
        continue;
      }
      counts.visitsScored++;
      base ??= cache.get(trip);
      const sched = pick(arrival, visit.schedArr, visit.schedDep);

      // Start on the minute grid from the first prediction, inside the horizon.
      const skip = Math.max(
        0,
        Math.ceil((actual - MAX_HORIZON + 1 - first) / SAMPLE_STEP)
      );
      for (let s = first + skip * SAMPLE_STEP; s < actual; s += SAMPLE_STEP) {
        const bucket = horizonBucket(actual - s);
        if (bucket < 0) {
          continue;
        }
        for (let p = 0; p < recorded; p++) {
          const r = rows[p];
          has[p] = 0;
          if (!r) {
            continue;
          }
          let i = ptr[p];
          while (i + 1 < r.length && r[i + 1].ts <= s) {
            i++;
          }
          ptr[p] = i;
          if (i >= 0) {
            const v = pick(arrival, r[i].arr, r[i].dep);
            if (v !== null) {
              values[p] = v;
              has[p] = 1;
            }
          }
        }
        let b = recorded;
        for (const name of baselines) {
          let delay: number | null = null;
          if (name === 'schedule') {
            delay = 0;
          } else if (name === 'last-stop') {
            delay = lastStopDelay(trip, base.lastStop, s);
          } else if (base.gps) {
            delay = gpsDelay(base.gps, s);
          }
          has[b] = sched !== null && delay !== null ? 1 : 0;
          if (has[b]) {
            values[b] =
              name === 'schedule' ? sched! : Math.max(s, sched! + delay!);
          }
          b++;
        }

        counts.samples++;
        groups[0] = overall;
        groups[1] = horizonGroups[bucket];
        groups[2] = routeGroup;
        groups[3] = dateGroup;
        groups[4] = byHour.get(String(hour(s)));
        let all = true;
        for (let p = 0; p < np; p++) {
          all &&= has[p] === 1;
        }
        for (const g of groups) {
          g.samples++;
          for (let p = 0; p < np; p++) {
            if (has[p]) {
              g.accs[p].covered++;
              if (all) {
                g.accs[p].add(values[p] - actual);
              }
            }
          }
        }
      }
    }
  }

  const finish = (key: string, g: Group): GroupStats => ({
    key,
    samples: g.samples,
    producers: Object.fromEntries(
      producers.map((name, p) => [name, g.accs[p].stats(g.samples)])
    ),
  });
  const list = (b: Breakdown, order: (a: string, b: string) => number) =>
    [...b.groups.entries()]
      .filter(([, g]) => g.samples > 0)
      .sort(([a], [b]) => order(a, b))
      .map(([key, g]) => finish(key, g));
  const numeric = (a: string, b: string) => Number(a) - Number(b);

  return {
    producers,
    overall: finish('all', overall),
    byHorizon: list(byHorizon, numeric).map((g) => {
      const [lo, hi] = HORIZONS[Number(g.key)];
      return { ...g, key: horizonLabel(lo, hi) };
    }),
    byRoute: list(byRoute, (a, b) =>
      a.localeCompare(b, 'en', { numeric: true })
    ),
    byDate: list(byDate, (a, b) => a.localeCompare(b)),
    byHour: list(byHour, numeric),
    counts,
  };
}
