/**
 * Loads TIDES packages and scores them off the main thread. A `load` keeps
 * the joined dataset; each `score` reuses it, and the trip baselines built
 * while scoring are kept for later scores and for `ghosts`.
 */

import { BaselineCache } from '../metrics/baselines';
import { buildDataset, epoch, type Dataset } from '../metrics/dataset';
import { ghostsAt } from '../metrics/ghosts';
import { score } from '../metrics/score';
import { loadSource, type LoadedPackage } from './load';
import type { FixColumns, Request, ResponseBody, Source } from './protocol';

let dataset: Dataset | null = null;
let cache: BaselineCache | null = null;

function post(id: number, msg: ResponseBody, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage({ ...msg, id }, transfer);
}

/** Every vehicle fix of the packages, sorted by time. */
function fixColumns(packages: LoadedPackage[]): FixColumns {
  const rows: {
    t: number;
    lat: number;
    lon: number;
    heading: number;
    vehicle: string;
    trip: string;
    route: string;
    serviceDate: string;
  }[] = [];
  for (const { tables } of packages) {
    const performed = new Map<string, { route: string; trip: string }>();
    for (const r of tables.trips_performed) {
      performed.set(`${r.service_date}|${r.trip_id_performed}`, {
        route: r.route_id ?? '',
        trip: r.trip_id_scheduled ?? '',
      });
    }
    for (const r of tables.vehicle_locations) {
      const t = epoch(r.event_timestamp);
      if (t === null || !r.latitude || !r.longitude) {
        continue;
      }
      const p = performed.get(`${r.service_date}|${r.trip_id_performed}`);
      rows.push({
        t,
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        heading: r.heading ? Number(r.heading) : NaN,
        vehicle: r.vehicle_id ?? '',
        trip: r.trip_id_scheduled || p?.trip || r.trip_id_performed || '',
        route: p?.route ?? '',
        serviceDate: r.service_date ?? '',
      });
    }
  }
  rows.sort((a, b) => a.t - b.t);
  return {
    t: Float64Array.from(rows, (r) => r.t),
    lat: Float64Array.from(rows, (r) => r.lat),
    lon: Float64Array.from(rows, (r) => r.lon),
    heading: Float64Array.from(rows, (r) => r.heading),
    vehicle: rows.map((r) => r.vehicle),
    trip: rows.map((r) => r.trip),
    route: rows.map((r) => r.route),
    serviceDate: rows.map((r) => r.serviceDate),
  };
}

async function load(req: Extract<Request, { type: 'load' }>): Promise<void> {
  const id = req.id;
  const total = req.packages.length + (req.actuals ? 1 : 0);
  let done = 0;
  const step = async (source: Source) => {
    const pkg = await loadSource(source);
    post(id, { type: 'progress', done: ++done, total });
    return pkg;
  };
  const loaded = await Promise.all(req.packages.map(step));
  const packages = loaded.filter((p): p is LoadedPackage => p !== null);
  const actuals = req.actuals ? await step(req.actuals) : null;
  if (packages.length === 0) {
    throw new Error('no packages for the selection');
  }
  dataset = buildDataset(
    packages.map((p) => p.tables),
    actuals?.tables
  );
  cache = new BaselineCache(dataset);
  const fixes = fixColumns(packages);
  post(
    id,
    {
      type: 'loaded',
      metas: packages.map((p) => p.meta),
      fixes,
      predictions: packages.reduce(
        (n, p) => n + p.tables.stop_time_predictions.length,
        0
      ),
    },
    [fixes.t.buffer, fixes.lat.buffer, fixes.lon.buffer, fixes.heading.buffer]
  );
}

function scoreRequest(data: Dataset, req: Extract<Request, { type: 'score' }>) {
  if (req.stops !== undefined || !cache) {
    const stops = req.stops
      ? new Map(
          req.stops.map(([id, lat, lon]) => [
            id,
            [lat, lon] as [number, number],
          ])
        )
      : undefined;
    cache = new BaselineCache(data, stops);
  }
  post(req.id, {
    type: 'report',
    report: score(data, {
      baselines: cache,
      timeZone: req.timeZone,
      filter: req.filter,
    }),
  });
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    if (req.type === 'load') {
      await load(req);
    } else if (!dataset) {
      throw new Error('nothing loaded');
    } else if (req.type === 'score') {
      scoreRequest(dataset, req);
    } else {
      post(req.id, {
        type: 'ghosts',
        ghosts: cache
          ? ghostsAt(
              dataset,
              cache,
              req.time,
              req.producers,
              req.maxAge,
              req.filter
            )
          : [],
      });
    }
  } catch (err) {
    post(req.id, {
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
