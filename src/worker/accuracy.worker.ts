/**
 * Loads TIDES packages and scores them off the main thread. A `load` keeps
 * the joined dataset; each `score` reuses it, and the trip baselines built
 * while scoring are kept for later scores and for `frame`. The fixes stay
 * here: the page asks for the vehicles at a time (`frame`) and the timeline
 * bins (`timeline`) instead of holding them.
 */

import { BaselineCache } from '../metrics/baselines';
import { DatasetBuilder, type Dataset } from '../metrics/dataset';
import { ghostsAt } from '../metrics/ghosts';
import { score } from '../metrics/score';
import { streamSource } from './load';
import { timelineDays } from '../metrics/timeline';
import { vehiclesAt } from '../metrics/vehicles';
import type { PackageMeta, Request, ResponseBody } from './protocol';

let dataset: Dataset | null = null;
let cache: BaselineCache | null = null;
/** Recorded coverage of the loaded packages, as epoch-second intervals. */
let spans: [number, number][] = [];

function post(id: number, msg: ResponseBody, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage({ ...msg, id }, transfer);
}

async function load(req: Extract<Request, { type: 'load' }>): Promise<void> {
  const id = req.id;
  const total = req.packages.length + (req.actuals ? 1 : 0);
  let done = 0;
  dataset = null;
  cache = null;
  const builder = new DatasetBuilder(req.actuals !== null);
  // One package at a time: its rows are folded in and dropped before the
  // next one is read.
  const metas: PackageMeta[] = [];
  let predictions = 0;
  for (const source of req.packages) {
    const pkg = await streamSource(source, builder, 'predictions');
    if (pkg) {
      metas.push(pkg.meta);
      predictions += pkg.predictions;
    }
    post(id, { type: 'progress', done: ++done, total });
  }
  if (req.actuals) {
    await streamSource(req.actuals, builder, 'actuals');
    post(id, { type: 'progress', done: done + 1, total });
  }
  if (metas.length === 0) {
    throw new Error('no packages for the selection');
  }
  dataset = builder.finish();
  cache = new BaselineCache(dataset);
  spans = metas.flatMap((m) =>
    m.coverage.map(
      (c) =>
        [Date.parse(c.start) / 1000, Date.parse(c.end) / 1000] as [
          number,
          number,
        ]
    )
  );
  post(id, { type: 'loaded', metas, predictions });
}

function timelineRequest(
  data: Dataset,
  req: Extract<Request, { type: 'timeline' }>
) {
  const f = data.fixes;
  const str = (col: Int32Array) => Array.from(col, (i) => f.strings[i]);
  const days = timelineDays(
    f.t,
    str(f.vehicle),
    str(f.trip),
    spans,
    req.timeZone,
    req.binS
  );
  const [start, end] = f.t.length
    ? [f.t[0], f.t[f.t.length - 1]]
    : [Math.min(...spans.flat()), Math.max(...spans.flat())];
  post(req.id, { type: 'timeline', days, start, end });
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
    } else if (req.type === 'timeline') {
      timelineRequest(dataset, req);
    } else {
      post(req.id, {
        type: 'frame',
        vehicles: vehiclesAt(dataset, req.time, req.maxAge),
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
