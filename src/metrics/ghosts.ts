/**
 * Where each predictor thinks a vehicle is: the point on the trip's stop
 * polyline whose scheduled time is `time - delay`, with `delay` the
 * producer's delay at the trip's next stop.
 */

import {
  distAtSchedule,
  gpsDelay,
  lastStopDelay,
  pointAt,
  type BaselineCache,
} from './baselines';
import { visitKey, type Dataset, type Fix, type Trip } from './dataset';
import { tripMatches, type ScoreFilter } from './score';

export interface Ghost {
  /** vehicle_id of the trip's latest fix, or '' when absent. */
  vehicleKey: string;
  tripKey: string;
  producer: string;
  lat: number;
  lon: number;
  /** The vehicle's real position. */
  fromLat: number;
  fromLon: number;
}

/** Index of the last fix at or before `time`, or -1. */
function lastFix(fixes: Fix[], time: number): number {
  let lo = 0;
  let hi = fixes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fixes[mid].t <= time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo - 1;
}

/** The first visit not yet reached at `time`, or null when the trip is done. */
function nextVisit(trip: Trip, time: number) {
  let last = -1;
  trip.visits.forEach((v, i) => {
    const actual = v.actArr ?? v.actDep;
    if (actual !== null && actual <= time) {
      last = i;
    }
  });
  return trip.visits[last + 1] ?? null;
}

function delayFor(
  producer: string,
  trip: Trip,
  data: Dataset,
  cache: BaselineCache,
  time: number,
  visit: Trip['visits'][number]
): number | null {
  switch (producer) {
    case 'schedule':
      return 0;
    case 'last-stop':
      return lastStopDelay(trip, cache.get(trip).lastStop, time);
    case 'gps': {
      const gps = cache.get(trip).gps;
      return gps ? gpsDelay(gps, time) : null;
    }
  }
  const rows = data.predictions
    .get(visitKey(trip.key, visit.seq))
    ?.get(producer);
  if (!rows) {
    return null;
  }
  let i = rows.length - 1;
  while (i >= 0 && rows[i].ts > time) {
    i--;
  }
  const sched = visit.schedArr ?? visit.schedDep;
  const pred = i >= 0 ? (rows[i].arr ?? rows[i].dep) : null;
  return pred === null || sched === null ? null : pred - sched;
}

/** Ghosts of every trip with a fix in (time - maxAge, time]. */
export function ghostsAt(
  data: Dataset,
  cache: BaselineCache,
  time: number,
  producers: string[],
  maxAge: number,
  filter?: ScoreFilter
): Ghost[] {
  const out: Ghost[] = [];
  if (!cache.stops || producers.length === 0) {
    return out;
  }
  for (const [key, fixes] of data.fixes) {
    const i = lastFix(fixes, time);
    if (i < 0 || time - fixes[i].t >= maxAge) {
      continue;
    }
    const trip = data.trips.get(key);
    if (!trip || !tripMatches(trip, filter)) {
      continue;
    }
    const line = cache.get(trip).line;
    const visit = nextVisit(trip, time);
    if (!line || !visit) {
      continue;
    }
    const fix = fixes[i];
    for (const producer of producers) {
      const delay = delayFor(producer, trip, data, cache, time, visit);
      if (delay === null) {
        continue;
      }
      const [lat, lon] = pointAt(line, distAtSchedule(line, time - delay));
      out.push({
        vehicleKey: fix.vehicle,
        tripKey: key,
        producer,
        lat,
        lon,
        fromLat: fix.lat,
        fromLon: fix.lon,
      });
    }
  }
  return out;
}
