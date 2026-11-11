/**
 * The in-browser baseline predictions. Each one reduces to a delay that is
 * added to the scheduled time of the stop being predicted:
 *
 * - `schedule`: no delay.
 * - `last-stop`: the delay at the last stop the vehicle has left (or reached),
 *   or how late the origin departure is when it has not left yet.
 * - `gps`: the latest fix projected onto the stop polyline, compared with the
 *   schedule interpolated at that distance. Each fix is snapped only to the
 *   stretch of the line the schedule allows at its time (GPS_EARLY early to
 *   GPS_LATE late).
 */

import type { Dataset, Fix, Trip, Visit } from './dataset';

/** Fixes older than this at sample time give no gps prediction. */
export const GPS_MAX_AGE = 300;
/** Earliest and latest a fix may put the vehicle against the schedule. */
const GPS_EARLY = 600;
const GPS_LATE = 3600;
/** A fix within this distance of the origin counts as not yet departed. */
const ORIGIN_M = 50;
const EARTH_M = 6371008.8;

/** Delays sorted by the time they became known. */
export interface DelaySeries {
  t: number[];
  delay: number[];
}

/** The delay in effect at `s`, or null before the first entry. */
export function delayAt(series: DelaySeries, s: number): number | null {
  const i = lastAtOrBefore(series.t, s);
  return i < 0 ? null : series.delay[i];
}

/** Index of the last value <= `x` in sorted `values`, or -1. */
export function lastAtOrBefore(values: number[], x: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= x) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo - 1;
}

function origin(trip: Trip): Visit | undefined {
  return trip.visits[0];
}

function originDeparture(trip: Trip): number | null {
  const o = origin(trip);
  return o ? (o.schedDep ?? o.schedArr) : null;
}

/** Delays at each stop's actual departure (else arrival), for `last-stop`. */
export function lastStopSeries(trip: Trip): DelaySeries {
  const events: [number, number][] = [];
  for (const v of trip.visits) {
    if (v.actDep !== null && (v.schedDep ?? v.schedArr) !== null) {
      events.push([v.actDep, v.actDep - (v.schedDep ?? v.schedArr)!]);
    } else if (v.actArr !== null && (v.schedArr ?? v.schedDep) !== null) {
      events.push([v.actArr, v.actArr - (v.schedArr ?? v.schedDep)!]);
    }
  }
  events.sort((a, b) => a[0] - b[0]);
  return { t: events.map((e) => e[0]), delay: events.map((e) => e[1]) };
}

/** The `last-stop` delay at `s`. */
export function lastStopDelay(
  trip: Trip,
  series: DelaySeries,
  s: number
): number | null {
  const d = delayAt(series, s);
  if (d !== null) {
    return d;
  }
  const dep = originDeparture(trip);
  return dep === null ? null : Math.max(0, s - dep);
}

export interface Polyline {
  lat0: number;
  x: number[];
  y: number[];
  /** Distance along the line at each vertex. */
  cum: number[];
  /** Scheduled time leaving each vertex. */
  dep: number[];
  /** Scheduled time reaching each vertex. */
  arr: number[];
}

function toXY(lat: number, lon: number, lat0: number): [number, number] {
  const rad = Math.PI / 180;
  return [lon * rad * EARTH_M * Math.cos(lat0 * rad), lat * rad * EARTH_M];
}

/** The trip's stops in order as a line, with the schedule at each vertex. */
export function stopPolyline(
  trip: Trip,
  stops: Map<string, [number, number]>
): Polyline | null {
  const pts: { lat: number; lon: number; arr: number; dep: number }[] = [];
  for (const v of trip.visits) {
    const at = stops.get(v.stopId);
    const arr = v.schedArr ?? v.schedDep;
    const dep = v.schedDep ?? v.schedArr;
    if (at && arr !== null && dep !== null) {
      pts.push({ lat: at[0], lon: at[1], arr, dep });
    }
  }
  if (pts.length < 2) {
    return null;
  }
  const lat0 = pts[0].lat;
  const line: Polyline = { lat0, x: [], y: [], cum: [], dep: [], arr: [] };
  for (const p of pts) {
    const [x, y] = toXY(p.lat, p.lon, lat0);
    const n = line.x.length;
    const step = n === 0 ? 0 : Math.hypot(x - line.x[n - 1], y - line.y[n - 1]);
    line.cum.push(n === 0 ? 0 : line.cum[n - 1] + step);
    line.x.push(x);
    line.y.push(y);
    line.arr.push(p.arr);
    line.dep.push(p.dep);
  }
  return line;
}

/** Distance along `line` of the nearest point to (lat, lon) within [lo, hi]. */
export function project(
  line: Polyline,
  lat: number,
  lon: number,
  lo: number,
  hi: number
): number {
  const [px, py] = toXY(lat, lon, line.lat0);
  let best = Infinity;
  let bestDist = lo;
  for (let i = 0; i + 1 < line.x.length; i++) {
    const c0 = line.cum[i];
    const c1 = line.cum[i + 1];
    if (c1 < lo || c0 > hi) {
      continue;
    }
    const ax = line.x[i];
    const ay = line.y[i];
    const dx = line.x[i + 1] - ax;
    const dy = line.y[i + 1] - ay;
    const len2 = dx * dx + dy * dy;
    const span = c1 - c0;
    const fLo = span === 0 ? 0 : Math.max(0, (lo - c0) / span);
    const fHi = span === 0 ? 0 : Math.min(1, (hi - c0) / span);
    let f = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    f = Math.min(fHi, Math.max(fLo, f));
    const d = Math.hypot(px - (ax + f * dx), py - (ay + f * dy));
    if (d < best) {
      best = d;
      bestDist = c0 + f * span;
    }
  }
  return bestDist;
}

/** Scheduled time at `dist` along the line, between departure and arrival. */
export function scheduleAt(line: Polyline, dist: number): number {
  const n = line.cum.length;
  if (dist <= 0) {
    return line.dep[0];
  }
  if (dist >= line.cum[n - 1]) {
    return line.arr[n - 1];
  }
  const i = Math.max(0, lastAtOrBefore(line.cum, dist));
  const span = line.cum[i + 1] - line.cum[i];
  const f = span === 0 ? 0 : (dist - line.cum[i]) / span;
  return line.dep[i] + f * (line.arr[i + 1] - line.dep[i]);
}

/**
 * Distance along the line where the schedule has the vehicle at `time`: 0
 * before the first departure, the line length after the last arrival, and
 * the stop's distance while it dwells there.
 */
export function distAtSchedule(line: Polyline, time: number): number {
  const n = line.cum.length;
  const i = lastAtOrBefore(line.dep, time);
  if (i < 0) {
    return 0;
  }
  if (i >= n - 1 || time >= line.arr[i + 1]) {
    return line.cum[Math.min(i + 1, n - 1)];
  }
  const span = line.arr[i + 1] - line.dep[i];
  const f = span <= 0 ? 1 : (time - line.dep[i]) / span;
  return line.cum[i] + f * (line.cum[i + 1] - line.cum[i]);
}

/** [lat, lon] of the point `dist` along the line. */
export function pointAt(line: Polyline, dist: number): [number, number] {
  const n = line.cum.length;
  const d = Math.min(line.cum[n - 1], Math.max(0, dist));
  const i = Math.min(n - 2, Math.max(0, lastAtOrBefore(line.cum, d)));
  const span = line.cum[i + 1] - line.cum[i];
  const f = span === 0 ? 0 : (d - line.cum[i]) / span;
  const x = line.x[i] + f * (line.x[i + 1] - line.x[i]);
  const y = line.y[i] + f * (line.y[i + 1] - line.y[i]);
  const rad = Math.PI / 180;
  return [y / (rad * EARTH_M), x / (rad * EARTH_M * Math.cos(line.lat0 * rad))];
}

/** Delays at each fix of the trip, for `gps`. */
export function gpsSeries(line: Polyline, fixes: Fix[]): DelaySeries {
  const out: DelaySeries = { t: [], delay: [] };
  for (const fix of fixes) {
    const dist = project(
      line,
      fix.lat,
      fix.lon,
      distAtSchedule(line, fix.t - GPS_LATE),
      distAtSchedule(line, fix.t + GPS_EARLY)
    );
    const delay =
      dist <= ORIGIN_M
        ? Math.max(0, fix.t - line.dep[0])
        : fix.t - scheduleAt(line, dist);
    out.t.push(fix.t);
    out.delay.push(delay);
  }
  return out;
}

/** The `gps` delay at `s`, from the latest fix no older than GPS_MAX_AGE. */
export function gpsDelay(series: DelaySeries, s: number): number | null {
  const i = lastAtOrBefore(series.t, s);
  if (i < 0 || s - series.t[i] > GPS_MAX_AGE) {
    return null;
  }
  return series.delay[i];
}

/** A trip's stop polyline and baseline delay series. */
export interface TripBaselines {
  line: Polyline | null;
  lastStop: DelaySeries;
  /** Null without stop positions. */
  gps: DelaySeries | null;
}

/** Builds each trip's baselines once and keeps them for later calls. */
export class BaselineCache {
  private trips = new Map<string, TripBaselines>();

  constructor(
    private data: Dataset,
    /** stop_id to [lat, lon]; without it there is no gps baseline. */
    readonly stops?: Map<string, [number, number]>
  ) {}

  get(trip: Trip): TripBaselines {
    let b = this.trips.get(trip.key);
    if (!b) {
      const line = this.stops ? stopPolyline(trip, this.stops) : null;
      const fixes = this.data.fixes.get(trip.key);
      b = {
        line,
        lastStop: lastStopSeries(trip),
        gps: this.stops
          ? line && fixes
            ? gpsSeries(line, fixes)
            : { t: [], delay: [] }
          : null,
      };
      this.trips.set(trip.key, b);
    }
    return b;
  }
}
