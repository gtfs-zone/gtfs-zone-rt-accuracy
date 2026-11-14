/**
 * Joins TIDES tables into the shapes the scorer reads. Every join uses the
 * GTFS key service_date + trip_id_scheduled + scheduled_stop_sequence, so
 * predictions from one package can be scored against stop visits from
 * another.
 */

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

export interface PredictionRow {
  ts: number;
  arr: number | null;
  dep: number | null;
}

export interface Fix {
  t: number;
  lat: number;
  lon: number;
  /** vehicle_id, or '' when absent. */
  vehicle: string;
}

export interface Dataset {
  trips: Map<string, Trip>;
  /** Visit key to producer to rows sorted by prediction_timestamp. */
  predictions: Map<string, Map<string, PredictionRow[]>>;
  /** Trip key to fixes sorted by time. */
  fixes: Map<string, Fix[]>;
  producers: string[];
  /** Prediction rows whose trip or stop could not be resolved. */
  unresolvedPredictions: number;
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

export function visitKey(trip: string, seq: number): string {
  return `${trip}|${seq}`;
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

/** Vehicle fixes as columns, sorted by time, for the map. */
export interface FixColumns {
  t: Float64Array;
  lat: Float64Array;
  lon: Float64Array;
  /** NaN when absent. */
  heading: Float64Array;
  vehicle: string[];
  trip: string[];
  route: string[];
  serviceDate: string[];
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
  private predictions = new Map<string, Map<string, PredictionRow[]>>();
  private fixes = new Map<string, Fix[]>();
  private producers = new Set<string>();
  private unresolvedPredictions = 0;
  private fixRows: {
    t: number;
    lat: number;
    lon: number;
    heading: number;
    vehicle: string;
    trip: string;
    route: string;
    serviceDate: string;
  }[] = [];

  // State of the package being fed.
  private role: 'predictions' | 'actuals' = 'predictions';
  private performed = new Map<string, PerformedTrip>();
  private seqs = new Map<string, number>();
  private pkgTrips = new Map<string, Trip>();
  private seen = new Set<string>();

  constructor(private readonly hasActuals: boolean) {}

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
        tripId: r.trip_id_scheduled || performed,
        routeId: r.route_id ?? '',
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
    const vkey = visitKey(key, seq);
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
        key,
        serviceDate,
        tripId,
        routeId: p?.routeId ?? '',
        visits: [],
      };
      this.pkgTrips.set(key, trip);
    }
    trip.visits.push({
      seq,
      stopId: r.stop_id ?? '',
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
      const producer = r.producer || 'unknown';
      this.producers.add(producer);
      const vkey = visitKey(tripKey(r.service_date ?? '', tripId), seq);
      let byProducer = this.predictions.get(vkey);
      if (!byProducer) {
        byProducer = new Map();
        this.predictions.set(vkey, byProducer);
      }
      let list = byProducer.get(producer);
      if (!list) {
        list = [];
        byProducer.set(producer, list);
      }
      list.push({
        ts,
        arr: epoch(r.predicted_arrival_time),
        dep: epoch(r.predicted_departure_time),
      });
    }
  }

  private vehicleLocations(rows: Row[]): void {
    for (const r of rows) {
      const t = epoch(r.event_timestamp);
      if (t === null || !r.latitude || !r.longitude) {
        continue;
      }
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      const tripId = scheduledTripId(r, this.performed);
      const p = this.performed.get(
        tripKey(r.service_date ?? '', r.trip_id_performed ?? '')
      );
      this.fixRows.push({
        t,
        lat,
        lon,
        heading: r.heading ? Number(r.heading) : NaN,
        vehicle: r.vehicle_id ?? '',
        trip: tripId ?? '',
        route: p?.routeId ?? '',
        serviceDate: r.service_date ?? '',
      });
      if (!tripId) {
        continue;
      }
      const key = tripKey(r.service_date ?? '', tripId);
      let list = this.fixes.get(key);
      if (!list) {
        list = [];
        this.fixes.set(key, list);
      }
      list.push({ t, lat, lon, vehicle: r.vehicle_id ?? '' });
    }
  }

  finish(): { dataset: Dataset; fixes: FixColumns } {
    for (const byProducer of this.predictions.values()) {
      for (const list of byProducer.values()) {
        list.sort((a, b) => a.ts - b.ts);
      }
    }
    for (const list of this.fixes.values()) {
      list.sort((a, b) => a.t - b.t);
    }
    const rows = this.fixRows;
    this.fixRows = [];
    rows.sort((a, b) => a.t - b.t);
    return {
      dataset: {
        trips: this.trips,
        predictions: this.predictions,
        fixes: this.fixes,
        producers: [...this.producers].sort(),
        unresolvedPredictions: this.unresolvedPredictions,
      },
      fixes: {
        t: Float64Array.from(rows, (r) => r.t),
        lat: Float64Array.from(rows, (r) => r.lat),
        lon: Float64Array.from(rows, (r) => r.lon),
        heading: Float64Array.from(rows, (r) => r.heading),
        vehicle: rows.map((r) => r.vehicle),
        trip: rows.map((r) => r.trip),
        route: rows.map((r) => r.route),
        serviceDate: rows.map((r) => r.serviceDate),
      },
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
  return builder.finish().dataset;
}
