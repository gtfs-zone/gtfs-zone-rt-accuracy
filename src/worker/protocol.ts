/** Messages between the page and `accuracy.worker.ts`. */

import type { Ghost } from '../metrics/ghosts';
import type { Report, ScoreFilter } from '../metrics/score';
import type { TimelineDay } from '../metrics/timeline';
import type { FrameVehicle } from '../metrics/vehicles';

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
      /** The vehicles at `time`, and the ghosts of `producers` around them. */
      type: 'frame';
      time: number;
      producers: string[];
      /** Seconds a fix stays current. */
      maxAge: number;
      filter?: ScoreFilter;
    }
  | { type: 'timeline'; timeZone: string; binS: number };

/** Every request carries an id that its responses echo. */
export type Request = RequestBody & { id: number };

export type ResponseBody =
  | { type: 'progress'; done: number; total: number }
  | {
      type: 'loaded';
      metas: PackageMeta[];
      predictions: number;
    }
  | { type: 'report'; report: Report }
  | { type: 'frame'; vehicles: FrameVehicle[]; ghosts: Ghost[] }
  | {
      type: 'timeline';
      days: TimelineDay[];
      /** First and last fix, else the recorded coverage. */
      start: number;
      end: number;
    }
  | { type: 'error'; message: string };

export type Response = ResponseBody & { id: number };
