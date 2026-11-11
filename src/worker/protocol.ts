/** Messages between the page and `accuracy.worker.ts`. */

import type { Ghost } from '../metrics/ghosts';
import type { Report, ScoreFilter } from '../metrics/score';

/** One TIDES package: a day from the archive, or uploaded files. */
export type Source =
  | { kind: 'archive'; feed: string; date: string }
  /** A zip, or the files of one package folder. */
  | { kind: 'files'; files: File[] };

export interface CoverageInterval {
  start: string;
  end: string;
}

export interface PackageMeta {
  name: string;
  title: string;
  /** UTC intervals the feed was recorded, from `gtfs_zone.coverage`. */
  coverage: CoverageInterval[];
  /** The GTFS snapshot the package was built against. */
  gtfs: string | null;
}

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

export type RequestBody =
  | { type: 'load'; packages: Source[]; actuals: Source | null }
  | {
      type: 'score';
      /**
       * [stop_id, lat, lon]; null skips the gps baseline, absent reuses the
       * stops of the last score.
       */
      stops?: [string, number, number][] | null;
      timeZone: string;
      filter?: ScoreFilter;
    }
  | {
      type: 'ghosts';
      time: number;
      producers: string[];
      /** Seconds a fix stays current. */
      maxAge: number;
      filter?: ScoreFilter;
    };

/** Every request carries an id that its responses echo. */
export type Request = RequestBody & { id: number };

export type ResponseBody =
  | { type: 'progress'; done: number; total: number }
  | {
      type: 'loaded';
      metas: PackageMeta[];
      fixes: FixColumns;
      predictions: number;
    }
  | { type: 'report'; report: Report }
  | { type: 'ghosts'; ghosts: Ghost[] }
  | { type: 'error'; message: string };

export type Response = ResponseBody & { id: number };
