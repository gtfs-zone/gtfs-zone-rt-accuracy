/**
 * Loads TIDES packages and scores them off the main thread. A `load` keeps
 * the joined dataset; each `score` reuses it, so the page can score once
 * without and once with the GTFS stop positions.
 */

import { buildDataset, epoch, type Dataset } from '../metrics/dataset';
import { score } from '../metrics/score';
import { loadSource, type LoadedPackage } from './load';
import type { FixColumns, Request, Response, Source } from './protocol';

let dataset: Dataset | null = null;

function post(msg: Response, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
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
  }[] = [];
  for (const { tables } of packages) {
    const routes = new Map<string, string>();
    for (const r of tables.trips_performed) {
      routes.set(`${r.service_date}|${r.trip_id_performed}`, r.route_id ?? '');
    }
    for (const r of tables.vehicle_locations) {
      const t = epoch(r.event_timestamp);
      if (t === null || !r.latitude || !r.longitude) {
        continue;
      }
      rows.push({
        t,
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        heading: r.heading ? Number(r.heading) : NaN,
        vehicle: r.vehicle_id ?? '',
        trip: r.trip_id_scheduled ?? r.trip_id_performed ?? '',
        route: routes.get(`${r.service_date}|${r.trip_id_performed}`) ?? '',
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
  };
}

async function load(req: Extract<Request, { type: 'load' }>): Promise<void> {
  const total = req.packages.length + (req.actuals ? 1 : 0);
  let done = 0;
  const step = async (source: Source) => {
    const pkg = await loadSource(source);
    post({ type: 'progress', done: ++done, total });
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
  const fixes = fixColumns(packages);
  post(
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

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  try {
    if (req.type === 'load') {
      await load(req);
    } else if (dataset) {
      const stops = req.stops
        ? new Map(
            req.stops.map(([id, lat, lon]) => [
              id,
              [lat, lon] as [number, number],
            ])
          )
        : undefined;
      post({
        type: 'report',
        report: score(dataset, { stops, timeZone: req.timeZone }),
      });
    }
  } catch (err) {
    post({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
