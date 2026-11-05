/**
 * The in-browser baseline predictions. Each one reduces to a delay that is
 * added to the scheduled time of the stop being predicted:
 *
 * - `schedule`: no delay.
 * - `last-stop`: the delay at the last stop the vehicle has left (or reached),
 *   or how late the origin departure is when it has not left yet.
 * - `gps`: the latest fix projected onto the stop polyline, compared with the
 *   schedule interpolated at that distance.
 */

import type { Fix, Trip, Visit } from './dataset';

/** Fixes older than this at sample time give no gps prediction. */
export const GPS_MAX_AGE = 300;
/** A projection may step back this far along the trip, in metres. */
const BACKTRACK_M = 200;
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

interface Polyline {
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

/** Distance along `line` of the nearest point to (lat, lon) past `minDist`. */
export function project(
  line: Polyline,
  lat: number,
  lon: number,
  minDist: number
): number {
  const [px, py] = toXY(lat, lon, line.lat0);
  let best = Infinity;
  let bestDist = Math.max(0, minDist);
  for (let i = 0; i + 1 < line.x.length; i++) {
    if (line.cum[i + 1] < minDist) {
      continue;
    }
    const ax = line.x[i];
    const ay = line.y[i];
    const dx = line.x[i + 1] - ax;
    const dy = line.y[i + 1] - ay;
    const len2 = dx * dx + dy * dy;
    let f = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    f = Math.min(1, Math.max(0, f));
    const d = Math.hypot(px - (ax + f * dx), py - (ay + f * dy));
    const along = line.cum[i] + f * (line.cum[i + 1] - line.cum[i]);
    if (d < best && along >= minDist) {
      best = d;
      bestDist = along;
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

/** Delays at each fix of the trip, for `gps`. */
export function gpsSeries(line: Polyline, fixes: Fix[]): DelaySeries {
  const out: DelaySeries = { t: [], delay: [] };
  let prev = 0;
  for (const fix of fixes) {
    const dist = project(line, fix.lat, fix.lon, prev - BACKTRACK_M);
    prev = Math.max(prev, dist);
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
