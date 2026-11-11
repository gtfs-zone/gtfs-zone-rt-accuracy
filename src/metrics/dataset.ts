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

/** (service_date, trip_id_performed) to the scheduled trip and its route. */
function performedTrips(tables: PackageTables): Map<string, PerformedTrip> {
  const out = new Map<string, PerformedTrip>();
  for (const r of tables.trips_performed) {
    const performed = r.trip_id_performed ?? '';
    out.set(tripKey(r.service_date ?? '', performed), {
      tripId: r.trip_id_scheduled || performed,
      routeId: r.route_id ?? '',
    });
  }
  return out;
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

function buildTrips(tables: PackageTables): Map<string, Trip> {
  const performed = performedTrips(tables);
  const trips = new Map<string, Trip>();
  const seen = new Set<string>();
  for (const r of tables.stop_visits) {
    const serviceDate = r.service_date ?? '';
    const tripId = scheduledTripId(r, performed);
    const seq = int(r.scheduled_stop_sequence) ?? int(r.trip_stop_sequence);
    if (!tripId || seq === null) {
      continue;
    }
    const key = tripKey(serviceDate, tripId);
    const vkey = visitKey(key, seq);
    // Two performed trips on one scheduled trip: the first one wins.
    if (seen.has(vkey)) {
      continue;
    }
    seen.add(vkey);
    let trip = trips.get(key);
    if (!trip) {
      const p = performed.get(tripKey(serviceDate, r.trip_id_performed ?? ''));
      trip = {
        key,
        serviceDate,
        tripId,
        routeId: p?.routeId ?? '',
        visits: [],
      };
      trips.set(key, trip);
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
  for (const trip of trips.values()) {
    trip.visits.sort((a, b) => a.seq - b.seq);
  }
  return trips;
}

/**
 * Predictions written before `scheduled_stop_sequence` was added to the
 * table resolve it through their own package's stop_visits.
 */
function stopSequenceLookup(tables: PackageTables): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of tables.stop_visits) {
    const seq = int(r.scheduled_stop_sequence);
    if (seq !== null) {
      out.set(
        `${r.service_date}|${r.trip_id_performed}|${r.trip_stop_sequence}`,
        seq
      );
    }
  }
  return out;
}

/**
 * Join packages into one dataset. Predictions and vehicle locations come from
 * `packages`; stop visits come from `actuals` when given, else from
 * `packages`.
 */
export function buildDataset(
  packages: PackageTables[],
  actuals?: PackageTables
): Dataset {
  const trips = new Map<string, Trip>();
  for (const tables of actuals ? [actuals] : packages) {
    for (const [key, trip] of buildTrips(tables)) {
      if (!trips.has(key)) {
        trips.set(key, trip);
      }
    }
  }

  const predictions = new Map<string, Map<string, PredictionRow[]>>();
  const fixes = new Map<string, Fix[]>();
  const producers = new Set<string>();
  let unresolvedPredictions = 0;

  for (const tables of packages) {
    const performed = performedTrips(tables);
    const seqs = stopSequenceLookup(tables);

    for (const r of tables.stop_time_predictions) {
      const tripId = scheduledTripId(r, performed);
      const seq =
        int(r.scheduled_stop_sequence) ??
        seqs.get(
          `${r.service_date}|${r.trip_id_performed}|${r.trip_stop_sequence}`
        ) ??
        null;
      const ts = epoch(r.prediction_timestamp);
      if (!tripId || seq === null || ts === null) {
        unresolvedPredictions++;
        continue;
      }
      const producer = r.producer || 'unknown';
      producers.add(producer);
      const vkey = visitKey(tripKey(r.service_date ?? '', tripId), seq);
      let byProducer = predictions.get(vkey);
      if (!byProducer) {
        byProducer = new Map();
        predictions.set(vkey, byProducer);
      }
      let rows = byProducer.get(producer);
      if (!rows) {
        rows = [];
        byProducer.set(producer, rows);
      }
      rows.push({
        ts,
        arr: epoch(r.predicted_arrival_time),
        dep: epoch(r.predicted_departure_time),
      });
    }

    for (const r of tables.vehicle_locations) {
      const tripId = scheduledTripId(r, performed);
      const t = epoch(r.event_timestamp);
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      if (!tripId || t === null || !r.latitude || !r.longitude) {
        continue;
      }
      const key = tripKey(r.service_date ?? '', tripId);
      let list = fixes.get(key);
      if (!list) {
        list = [];
        fixes.set(key, list);
      }
      list.push({ t, lat, lon, vehicle: r.vehicle_id ?? '' });
    }
  }

  for (const byProducer of predictions.values()) {
    for (const rows of byProducer.values()) {
      rows.sort((a, b) => a.ts - b.ts);
    }
  }
  for (const list of fixes.values()) {
    list.sort((a, b) => a.t - b.t);
  }

  return {
    trips,
    predictions,
    fixes,
    producers: [...producers].sort(),
    unresolvedPredictions,
  };
}
