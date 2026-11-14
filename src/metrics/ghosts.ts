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
import { producerRows, type Dataset, type Trip } from './dataset';
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

/** Index into `fixByTrip` of trip `n`'s last fix at or before `time`, or -1. */
function lastFix(data: Dataset, n: number, time: number): number {
  const t = data.fixes.t;
  const by = data.fixByTrip;
  const first = data.fixStart[n];
  let lo = first;
  let hi = data.fixStart[n + 1];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t[by[mid]] <= time) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo - 1 < first ? -1 : lo - 1;
}

/** Index of the first visit not yet reached at `time`, or -1 when done. */
function nextVisit(trip: Trip, time: number): number {
  let last = -1;
  trip.visits.forEach((v, i) => {
    const actual = v.actArr ?? v.actDep;
    if (actual !== null && actual <= time) {
      last = i;
    }
  });
  return last + 1 < trip.visits.length ? last + 1 : -1;
}

function delayFor(
  producer: string,
  trip: Trip,
  n: number,
  data: Dataset,
  cache: BaselineCache,
  time: number,
  v: number
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
  const p = data.producers.indexOf(producer);
  if (p < 0) {
    return null;
  }
  const [a, b] = producerRows(data, data.visitStart[n] + v, p);
  if (a === b) {
    return null;
  }
  const pred = data.predictions;
  let i = b - 1;
  while (i >= a && pred.ts[i] > time) {
    i--;
  }
  const visit = trip.visits[v];
  const sched = visit.schedArr ?? visit.schedDep;
  let value: number | null = null;
  if (i >= a) {
    value = Number.isNaN(pred.arr[i]) ? pred.dep[i] : pred.arr[i];
    if (Number.isNaN(value)) {
      value = null;
    }
  }
  return value === null || sched === null ? null : value - sched;
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
  const f = data.fixes;
  for (const n of data.fixTrips) {
    const k = lastFix(data, n, time);
    if (k < 0) {
      continue;
    }
    const i = data.fixByTrip[k];
    if (time - f.t[i] >= maxAge) {
      continue;
    }
    const trip = data.tripList[n];
    if (!tripMatches(trip, filter)) {
      continue;
    }
    const line = cache.get(trip).line;
    const v = nextVisit(trip, time);
    if (!line || v < 0) {
      continue;
    }
    for (const producer of producers) {
      const delay = delayFor(producer, trip, n, data, cache, time, v);
      if (delay === null) {
        continue;
      }
      const [lat, lon] = pointAt(line, distAtSchedule(line, time - delay));
      out.push({
        vehicleKey: f.strings[f.vehicle[i]],
        tripKey: trip.key,
        producer,
        lat,
        lon,
        fromLat: f.lat[i],
        fromLon: f.lon[i],
      });
    }
  }
  return out;
}
