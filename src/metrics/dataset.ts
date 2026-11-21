/**
 * Joins TIDES tables into the shapes the scorer reads. Every join uses the
 * GTFS key service_date + trip_id_scheduled + scheduled_stop_sequence, so
 * predictions from one package can be scored against stop visits from
 * another.
 *
 * Trips and their visits are objects (one per scheduled stop). Predictions
 * and vehicle fixes, which outnumber them 10 to 1, are typed-array tables
 * reached through per-visit and per-trip offsets.
 */

import { Grow, Interner } from './columns';

export type Row = Record<string, string | undefined>;

/** The TIDES tables of one package; missing tables are empty. */
export interface PackageTables {
  trips_performed: Row[];
  stop_visits: Row[];
  vehicle_locations: Row[];
  stop_time_predictions: Row[];
}

export interface Visit {
  seq: number;
  stopId: string;
  schedArr: number | null;
  schedDep: number | null;
  actArr: number | null;
  actDep: number | null;
}

export interface Trip {
  key: string;
  serviceDate: string;
  tripId: string;
  routeId: string;
  /** Sorted by GTFS stop_sequence. */
  visits: Visit[];
}

/** One trip's fix, as `gpsSeries` reads it. */
export interface Fix {
  t: number;
  lat: number;
  lon: number;
  /** vehicle_id, or '' when absent. */
  vehicle: string;
}

/** Prediction rows; a missing time is NaN. */
export interface PredictionTable {
  /** Index into `Dataset.producers`. */
  producer: Uint16Array;
  ts: Float64Array;
  arr: Float64Array;
  dep: Float64Array;
}

/** Every vehicle fix, sorted by time. String columns index `strings`. */
export interface FixTable {
  t: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  /** NaN when absent. */
  heading: Float64Array;
  vehicle: Int32Array;
  /** The scheduled trip_id, or '' when unresolved. */
  trip: Int32Array;
  route: Int32Array;
  serviceDate: Int32Array;
  strings: string[];
}

export interface Dataset {
  trips: Map<string, Trip>;
  /** The trips by number. */
  tripList: Trip[];
  /** Trip key to its number, which indexes `visitStart` and `fixStart`. */
  tripIndex: Map<string, number>;
  /** Visit `v` of trip `n` is visit number `visitStart[n] + v`. */
  visitStart: Uint32Array;
  /**
   * Prediction rows of visit number `g` are `predStart[g]` to
   * `predStart[g + 1]`, by producer, then by prediction_timestamp.
   */
  predStart: Uint32Array;
  predictions: PredictionTable;
  fixes: FixTable;
  /** Fixes of trip `n`, by time: `fixByTrip[fixStart[n]..fixStart[n + 1]]`. */
  fixStart: Uint32Array;
  fixByTrip: Uint32Array;
  /** Numbers of the trips with fixes, in the order their first fix was read. */
  fixTrips: Uint32Array;
  producers: string[];
  /** Prediction rows whose trip or stop could not be resolved. */
  unresolvedPredictions: number;
}

/** Rows `[start, end)` of `producer` among visit number `g`'s predictions. */
export function producerRows(
  data: Dataset,
  g: number,
  producer: number
): [number, number] {
  const p = data.predictions.producer;
  let i = data.predStart[g];
  const end = data.predStart[g + 1];
  while (i < end && p[i] !== producer) {
    i++;
  }
  let j = i;
  while (j < end && p[j] === producer) {
    j++;
  }
  return [i, j];
}

/** A trip's fixes by time, as objects. */
export function tripFixes(data: Dataset, n: number): Fix[] {
  const f = data.fixes;
  const out: Fix[] = [];
  for (let k = data.fixStart[n]; k < data.fixStart[n + 1]; k++) {
    const i = data.fixByTrip[k];
    out.push({
      t: f.t[i],
      lat: f.lat[i],
      lon: f.lon[i],
      vehicle: f.strings[f.vehicle[i]],
    });
  }
  return out;
}

/** Epoch seconds from an ISO 8601 timestamp, or null when empty. */
export function epoch(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms / 1000;
}

function int(value: string | undefined): number | null {
  if (value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

export function tripKey(serviceDate: string, tripId: string): string {
  return `${serviceDate}|${tripId}`;
}

interface PerformedTrip {
  tripId: string;
  routeId: string;
}

function scheduledTripId(
  r: Row,
  performed: Map<string, PerformedTrip>
): string | null {
  if (r.trip_id_scheduled) {
    return r.trip_id_scheduled;
  }
  const p = performed.get(
    tripKey(r.service_date ?? '', r.trip_id_performed ?? '')
  );
  return p?.tripId ?? r.trip_id_performed ?? null;
}

export type TableName = keyof PackageTables;

/** Tables in the order a package must be fed: lookups before what uses them. */
export const TABLE_ORDER: readonly TableName[] = [
  'trips_performed',
  'stop_visits',
  'stop_time_predictions',
  'vehicle_locations',
];

/** Index of `seq` in visits sorted by seq, or -1. */
function visitIndex(visits: Visit[], seq: number): number {
  let lo = 0;
  let hi = visits.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = visits[mid].seq;
    if (s === seq) {
      return mid;
    }
    if (s < seq) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}

/**
 * Builds a dataset one package at a time, so a package's rows can be dropped
 * as soon as they are folded in. Each package is fed table by table in
 * `TABLE_ORDER`, between `beginPackage` and `endPackage`.
 *
 * Predictions and vehicle locations come from `predictions` packages; stop
 * visits come from the `actuals` package when there is one, else from the
 * `predictions` packages.
 */
export class DatasetBuilder {
  private trips = new Map<string, Trip>();
  /** Trip keys, shared by predictions and fixes. */
  private keys = new Interner();
  /** Every other string the dataset keeps. */
  private strings = new Interner();
  private producerIds = new Interner();
  private unresolvedPredictions = 0;

  private predKey = new Grow(Int32Array);
  private predSeq = new Grow(Int32Array);
  private predProducer = new Grow(Int32Array);
  private predTs = new Grow(Float64Array);
  private predArr = new Grow(Float64Array);
  private predDep = new Grow(Float64Array);

  private fixT = new Grow(Float64Array);
  private fixLat = new Grow(Float64Array);
  private fixLon = new Grow(Float64Array);
  private fixHeading = new Grow(Float64Array);
  private fixVehicle = new Grow(Int32Array);
  private fixTrip = new Grow(Int32Array);
  private fixRoute = new Grow(Int32Array);
  private fixDate = new Grow(Int32Array);
  /** Trip key id, or -1 when the fix has no trip. */
  private fixKey = new Grow(Int32Array);

  // State of the package being fed.
  private role: 'predictions' | 'actuals' = 'predictions';
  private performed = new Map<string, PerformedTrip>();
  private seqs = new Map<string, number>();
  private pkgTrips = new Map<string, Trip>();
  private seen = new Set<string>();

  constructor(private readonly hasActuals: boolean) {
    this.strings.id('');
  }

  /** A copy of `s` that holds no parse chunk alive. */
  private str(s: string): string {
    return this.strings.strs[this.strings.id(s)];
  }

  beginPackage(role: 'predictions' | 'actuals'): void {
    this.role = role;
    this.performed = new Map();
    this.seqs = new Map();
    this.pkgTrips = new Map();
    this.seen = new Set();
  }

  rows(table: TableName, rows: Row[]): void {
    switch (table) {
      case 'trips_performed':
        return this.tripsPerformed(rows);
      case 'stop_visits':
        return this.stopVisits(rows);
      case 'stop_time_predictions':
        return this.role === 'predictions'
          ? this.stopTimePredictions(rows)
          : undefined;
      case 'vehicle_locations':
        return this.role === 'predictions'
          ? this.vehicleLocations(rows)
          : undefined;
    }
  }

  endPackage(): void {
    for (const trip of this.pkgTrips.values()) {
      trip.visits.sort((a, b) => a.seq - b.seq);
      if (!this.trips.has(trip.key)) {
        this.trips.set(trip.key, trip);
      }
    }
    this.performed = new Map();
    this.seqs = new Map();
    this.pkgTrips = new Map();
    this.seen = new Set();
  }

  /** (service_date, trip_id_performed) to the scheduled trip and its route. */
  private tripsPerformed(rows: Row[]): void {
    for (const r of rows) {
      const performed = r.trip_id_performed ?? '';
      this.performed.set(tripKey(r.service_date ?? '', performed), {
        tripId: this.str(r.trip_id_scheduled || performed),
        routeId: this.str(r.route_id ?? ''),
      });
    }
  }

  private stopVisits(rows: Row[]): void {
    const takeVisits = this.role === 'actuals' || !this.hasActuals;
    for (const r of rows) {
      // Predictions written before `scheduled_stop_sequence` was added to
      // the table resolve it through their own package's stop_visits.
      if (this.role === 'predictions') {
        const seq = int(r.scheduled_stop_sequence);
        if (seq !== null) {
          this.seqs.set(
            `${r.service_date}|${r.trip_id_performed}|${r.trip_stop_sequence}`,
            seq
          );
        }
      }
      if (takeVisits) {
        this.visit(r);
      }
    }
  }

  private visit(r: Row): void {
    const serviceDate = r.service_date ?? '';
    const tripId = scheduledTripId(r, this.performed);
    const seq = int(r.scheduled_stop_sequence) ?? int(r.trip_stop_sequence);
    if (!tripId || seq === null) {
      return;
    }
    const key = tripKey(serviceDate, tripId);
    const vkey = `${key}|${seq}`;
    // Two performed trips on one scheduled trip: the first one wins.
    if (this.seen.has(vkey)) {
      return;
    }
    this.seen.add(vkey);
    let trip = this.pkgTrips.get(key);
    if (!trip) {
      const p = this.performed.get(
        tripKey(serviceDate, r.trip_id_performed ?? '')
      );
      trip = {
        key: this.keys.strs[this.keys.id(key)],
        serviceDate: this.str(serviceDate),
        tripId: this.str(tripId),
        routeId: p?.routeId ?? '',
        visits: [],
      };
      this.pkgTrips.set(trip.key, trip);
    }
    trip.visits.push({
      seq,
      stopId: this.str(r.stop_id ?? ''),
      schedArr: epoch(r.schedule_arrival_time),
      schedDep: epoch(r.schedule_departure_time),
      actArr: epoch(r.actual_arrival_time),
      actDep: epoch(r.actual_departure_time),
    });
  }

  private stopTimePredictions(rows: Row[]): void {
    for (const r of rows) {
      const tripId = scheduledTripId(r, this.performed);
      const seq =
        int(r.scheduled_stop_sequence) ??
        this.seqs.get(
          `${r.service_date}|${r.trip_id_performed}|${r.trip_stop_sequence}`
        ) ??
        null;
      const ts = epoch(r.prediction_timestamp);
      if (!tripId || seq === null || ts === null) {
        this.unresolvedPredictions++;
        continue;
      }
      this.predKey.push(this.keys.id(tripKey(r.service_date ?? '', tripId)));
      this.predSeq.push(seq);
      this.predProducer.push(this.producerIds.id(r.producer || 'unknown'));
      this.predTs.push(ts);
      this.predArr.push(epoch(r.predicted_arrival_time) ?? NaN);
      this.predDep.push(epoch(r.predicted_departure_time) ?? NaN);
    }
  }

  private vehicleLocations(rows: Row[]): void {
    for (const r of rows) {
      const t = epoch(r.event_timestamp);
      if (t === null || !r.latitude || !r.longitude) {
        continue;
      }
      const serviceDate = r.service_date ?? '';
      const tripId = scheduledTripId(r, this.performed);
      const p = this.performed.get(
        tripKey(serviceDate, r.trip_id_performed ?? '')
      );
      this.fixT.push(t);
      this.fixLat.push(Number(r.latitude));
      this.fixLon.push(Number(r.longitude));
      this.fixHeading.push(r.heading ? Number(r.heading) : NaN);
      this.fixVehicle.push(this.strings.id(r.vehicle_id ?? ''));
      this.fixTrip.push(this.strings.id(tripId ?? ''));
      this.fixRoute.push(this.strings.id(p?.routeId ?? ''));
      this.fixDate.push(this.strings.id(serviceDate));
      this.fixKey.push(
        tripId ? this.keys.id(tripKey(serviceDate, tripId)) : -1
      );
    }
  }

  finish(): Dataset {
    // Trip numbers, and each trip's first visit number.
    const trips = [...this.trips.values()];
    const tripIndex = new Map<string, number>();
    const visitStart = new Uint32Array(trips.length + 1);
    /** Trip number by trip key id, -1 for keys with no trip. */
    const tripOfKey = new Int32Array(this.keys.strs.length).fill(-1);
    trips.forEach((trip, n) => {
      tripIndex.set(trip.key, n);
      tripOfKey[this.keys.lookup(trip.key)] = n;
      visitStart[n + 1] = visitStart[n] + trip.visits.length;
    });
    const visits = visitStart[trips.length];

    // Producers sorted by name; rows refer to them by sorted index.
    const names = this.producerIds.strs;
    const producers = [...names].sort();
    const producerOf = Uint16Array.from(names, (n) => producers.indexOf(n));

    // Bucket prediction rows by visit number, dropping rows for visits the
    // dataset does not have.
    const keyCol = this.predKey.take();
    const seqCol = this.predSeq.take();
    const n = keyCol.length;
    const visitOf = new Int32Array(n);
    const predStart = new Uint32Array(visits + 1);
    for (let i = 0; i < n; i++) {
      const t = tripOfKey[keyCol[i]];
      const v = t < 0 ? -1 : visitIndex(trips[t].visits, seqCol[i]);
      const g = v < 0 ? -1 : visitStart[t] + v;
      visitOf[i] = g;
      if (g >= 0) {
        predStart[g + 1]++;
      }
    }
    for (let g = 0; g < visits; g++) {
      predStart[g + 1] += predStart[g];
    }
    const kept = predStart[visits];
    const order = new Uint32Array(kept);
    const fill = predStart.slice(0, visits);
    for (let i = 0; i < n; i++) {
      const g = visitOf[i];
      if (g >= 0) {
        order[fill[g]++] = i;
      }
    }

    const prodCol = this.predProducer.take();
    const tsCol = this.predTs.take();
    // Within a visit: by producer, then time, then read order.
    for (let g = 0; g < visits; g++) {
      const a = predStart[g];
      const b = predStart[g + 1];
      if (b - a > 1) {
        order
          .subarray(a, b)
          .sort(
            (x, y) =>
              producerOf[prodCol[x]] - producerOf[prodCol[y]] ||
              tsCol[x] - tsCol[y] ||
              x - y
          );
      }
    }
    const arrCol = this.predArr.take();
    const depCol = this.predDep.take();
    const predictions: PredictionTable = {
      producer: new Uint16Array(kept),
      ts: new Float64Array(kept),
      arr: new Float64Array(kept),
      dep: new Float64Array(kept),
    };
    for (let k = 0; k < kept; k++) {
      const i = order[k];
      predictions.producer[k] = producerOf[prodCol[i]];
      predictions.ts[k] = tsCol[i];
      predictions.arr[k] = arrCol[i];
      predictions.dep[k] = depCol[i];
    }
    console.log(
      `[Dataset] ${trips.length} trips, ${visits} visits, ${kept} of ${n} predictions on a visit`
    );

    // Fixes by time, ties in read order.
    const t = this.fixT.take();
    const nf = t.length;
    const byTime = new Uint32Array(nf);
    for (let i = 0; i < nf; i++) {
      byTime[i] = i;
    }
    byTime.sort((x, y) => t[x] - t[y] || x - y);
    const permF64 = (col: Float64Array): Float64Array =>
      Float64Array.from(byTime, (i) => col[i]);
    const permI32 = (col: Int32Array): Int32Array =>
      Int32Array.from(byTime, (i) => col[i]);
    const fixKey = permI32(this.fixKey.take());
    const fixes: FixTable = {
      t: permF64(t),
      lat: permF64(this.fixLat.take()),
      lon: permF64(this.fixLon.take()),
      heading: permF64(this.fixHeading.take()),
      vehicle: permI32(this.fixVehicle.take()),
      trip: permI32(this.fixTrip.take()),
      route: permI32(this.fixRoute.take()),
      serviceDate: permI32(this.fixDate.take()),
      strings: this.strings.strs,
    };

    // Per-trip fix lists, and the trips in the order of their first fix read.
    const fixStart = new Uint32Array(trips.length + 1);
    const firstRead = new Float64Array(trips.length).fill(Infinity);
    for (let k = 0; k < nf; k++) {
      const tn = fixKey[k] < 0 ? -1 : tripOfKey[fixKey[k]];
      if (tn >= 0) {
        fixStart[tn + 1]++;
        firstRead[tn] = Math.min(firstRead[tn], byTime[k]);
      }
    }
    for (let tn = 0; tn < trips.length; tn++) {
      fixStart[tn + 1] += fixStart[tn];
    }
    const fixByTrip = new Uint32Array(fixStart[trips.length]);
    const at = fixStart.slice(0, trips.length);
    for (let k = 0; k < nf; k++) {
      const tn = fixKey[k] < 0 ? -1 : tripOfKey[fixKey[k]];
      if (tn >= 0) {
        fixByTrip[at[tn]++] = k;
      }
    }
    const withFixes: number[] = [];
    for (let tn = 0; tn < trips.length; tn++) {
      if (fixStart[tn + 1] > fixStart[tn]) {
        withFixes.push(tn);
      }
    }
    withFixes.sort((a, b) => firstRead[a] - firstRead[b]);

    return {
      trips: this.trips,
      tripList: trips,
      tripIndex,
      visitStart,
      predStart,
      predictions,
      fixes,
      fixStart,
      fixByTrip,
      fixTrips: Uint32Array.from(withFixes),
      producers,
      unresolvedPredictions: this.unresolvedPredictions,
    };
  }
}

/** Join whole packages into one dataset; see `DatasetBuilder`. */
export function buildDataset(
  packages: PackageTables[],
  actuals?: PackageTables
): Dataset {
  const builder = new DatasetBuilder(actuals !== undefined);
  const feed = (tables: PackageTables, role: 'predictions' | 'actuals') => {
    builder.beginPackage(role);
    for (const table of TABLE_ORDER) {
      builder.rows(table, tables[table]);
    }
    builder.endPackage();
  };
  for (const tables of packages) {
    feed(tables, 'predictions');
  }
  if (actuals) {
    feed(actuals, 'actuals');
  }
  return builder.finish();
}
