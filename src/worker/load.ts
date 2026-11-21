/**
 * Streams TIDES packages from the archive or from uploaded files into a
 * `DatasetBuilder`, one table at a time, so no table is held whole.
 */

import { Unzip, UnzipInflate } from 'fflate';
import { CONFIG } from '../config';
import { TABLE_ORDER, type DatasetBuilder } from '../metrics/dataset';
import { streamCsv } from './csv';
import type { PackageMeta, Source } from './protocol';

interface DataPackage {
  name?: string;
  title?: string;
  resources?: { name?: string; path?: string }[];
  gtfs_zone?: { coverage?: PackageMeta['coverage']; gtfs?: string };
}

/** Opens a file of the package by path, or null when it is missing. */
type Opener = (path: string) => Promise<ReadableStream<Uint8Array> | null>;

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * One entry of a zip, inflated as it is read. Each call reads the zip from
 * the start, which is cheap for a local file and frees the tables from
 * having to sit in the zip in `TABLE_ORDER`.
 */
function zipEntry(
  zip: File,
  name: string
): Promise<ReadableStream<Uint8Array> | null> {
  return new Promise((resolve, reject) => {
    let found = false;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const out = new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
      },
    });
    const uz = new Unzip((file) => {
      if (found || basename(file.name) !== name) {
        return;
      }
      found = true;
      resolve(out);
      file.ondata = (err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        if (chunk.length) {
          controller.enqueue(chunk);
        }
        if (final) {
          controller.close();
        }
      };
      file.start();
    });
    uz.register(UnzipInflate);
    const read = async (): Promise<void> => {
      const reader = zip.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        uz.push(value, false);
      }
      uz.push(new Uint8Array(0), true);
      if (!found) {
        resolve(null);
      }
    };
    read().catch((err) => {
      if (found) {
        controller.error(err);
      } else {
        reject(err);
      }
    });
  });
}

/** Files keyed by base name, so a package nested in a folder still reads. */
function fileOpener(files: File[]): Opener {
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
    const zip = files[0];
    return (path) => zipEntry(zip, basename(path));
  }
  const byName = new Map(files.map((f) => [basename(f.name), f]));
  return async (path) => byName.get(basename(path))?.stream() ?? null;
}

export function archiveUrl(feed: string, date: string, path = ''): string {
  return `${CONFIG.ARCHIVE_BASE}/tides/${encodeURIComponent(feed)}/${date}/${path}`;
}

function archiveOpener(feed: string, date: string): Opener {
  return async (path) => {
    // Packages are served gzipped with Content-Encoding, so fetch decodes them.
    const res = await fetch(archiveUrl(feed, date, path));
    if (res.status === 404 || res.status === 403) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`${path}: HTTP ${res.status}`);
    }
    return res.body;
  };
}

export interface StreamedPackage {
  meta: PackageMeta;
  /** stop_time_predictions rows read. */
  predictions: number;
}

/**
 * Stream one source into `builder` as a package of `role`. Null for an
 * archive day with no package, in which case the builder is not touched.
 */
export async function streamSource(
  source: Source,
  builder: DatasetBuilder,
  role: 'predictions' | 'actuals'
): Promise<StreamedPackage | null> {
  let open: Opener;
  let fallbackName: string;
  if (source.kind === 'files') {
    open = fileOpener(source.files);
    fallbackName = source.files[0]?.name ?? 'upload';
  } else {
    open = archiveOpener(source.feed, source.date);
    fallbackName = `${source.feed}-${source.date}`;
  }

  const dpStream = await open('datapackage.json');
  if (!dpStream && source.kind === 'archive') {
    return null;
  }
  const dp: DataPackage = dpStream
    ? JSON.parse(await new Response(dpStream).text())
    : {};
  const paths = new Map<string, string>();
  for (const r of dp.resources ?? []) {
    if (r.name && r.path) {
      paths.set(r.name, r.path);
    }
  }

  builder.beginPackage(role);
  let found = 0;
  let predictions = 0;
  for (const table of TABLE_ORDER) {
    const stream = await open(paths.get(table) ?? `${table}.csv`);
    if (!stream) {
      continue;
    }
    found++;
    const rows = await streamCsv(stream, (batch) => builder.rows(table, batch));
    if (table === 'stop_time_predictions') {
      predictions = rows;
    }
    console.log(`[Load] ${fallbackName} ${table}: ${rows} rows`);
  }
  builder.endPackage();
  if (found === 0) {
    throw new Error(`no TIDES tables in ${fallbackName}`);
  }
  return {
    meta: {
      name: dp.name ?? fallbackName,
      title: dp.title ?? dp.name ?? fallbackName,
      coverage: dp.gtfs_zone?.coverage ?? [],
      gtfs: dp.gtfs_zone?.gtfs ?? null,
    },
    predictions,
  };
}
