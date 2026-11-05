/** Reads TIDES packages from the archive or from uploaded files. */

import JSZip from 'jszip';
import Papa from 'papaparse';
import { CONFIG } from '../config';
import type { PackageTables, Row } from '../metrics/dataset';
import type { PackageMeta, Source } from './protocol';

const TABLES = [
  'trips_performed',
  'stop_visits',
  'vehicle_locations',
  'stop_time_predictions',
] as const;

export interface LoadedPackage {
  meta: PackageMeta;
  tables: PackageTables;
}

interface DataPackage {
  name?: string;
  title?: string;
  resources?: { name?: string; path?: string }[];
  gtfs_zone?: { coverage?: PackageMeta['coverage']; gtfs?: string };
}

/** Reads a file of the package by path, or null when it is missing. */
type Reader = (path: string) => Promise<string | null>;

function parseCsv(text: string | null): Row[] {
  if (!text) {
    return [];
  }
  return Papa.parse<Row>(text, { header: true, skipEmptyLines: true }).data;
}

async function readPackage(
  read: Reader,
  fallbackName: string
): Promise<LoadedPackage> {
  const raw = await read('datapackage.json');
  const dp: DataPackage = raw ? JSON.parse(raw) : {};
  const paths = new Map<string, string>();
  for (const r of dp.resources ?? []) {
    if (r.name && r.path) {
      paths.set(r.name, r.path);
    }
  }
  const texts = await Promise.all(
    TABLES.map((table) => read(paths.get(table) ?? `${table}.csv`))
  );
  if (texts.every((t) => t === null)) {
    throw new Error(`no TIDES tables in ${fallbackName}`);
  }
  const tables = Object.fromEntries(
    TABLES.map((table, i) => [table, parseCsv(texts[i])])
  ) as unknown as PackageTables;
  return {
    meta: {
      name: dp.name ?? fallbackName,
      title: dp.title ?? dp.name ?? fallbackName,
      coverage: dp.gtfs_zone?.coverage ?? [],
      gtfs: dp.gtfs_zone?.gtfs ?? null,
    },
    tables,
  };
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Files keyed by base name, so a package nested in a folder still reads. */
async function fileReader(files: File[]): Promise<Reader> {
  if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
    const zip = await JSZip.loadAsync(files[0]);
    const entries = new Map<string, JSZip.JSZipObject>();
    zip.forEach((path, entry) => {
      if (!entry.dir) {
        entries.set(basename(path), entry);
      }
    });
    return async (path) =>
      (await entries.get(basename(path))?.async('text')) ?? null;
  }
  const byName = new Map(files.map((f) => [basename(f.name), f]));
  return async (path) => (await byName.get(basename(path))?.text()) ?? null;
}

export function archiveUrl(feed: string, date: string, path = ''): string {
  return `${CONFIG.ARCHIVE_BASE}/tides/${encodeURIComponent(feed)}/${date}/${path}`;
}

/** Loads one source; null for an archive day with no package. */
export async function loadSource(
  source: Source
): Promise<LoadedPackage | null> {
  if (source.kind === 'files') {
    const name = source.files[0]?.name ?? 'upload';
    return readPackage(await fileReader(source.files), name);
  }
  const fetched = new Map<string, Promise<string | null>>();
  const fetchText = async (path: string): Promise<string | null> => {
    // Packages are served gzipped with Content-Encoding, so fetch decodes them.
    const res = await fetch(archiveUrl(source.feed, source.date, path));
    if (res.status === 404 || res.status === 403) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`${path}: HTTP ${res.status}`);
    }
    return res.text();
  };
  const read: Reader = (path) => {
    if (!fetched.has(path)) {
      fetched.set(path, fetchText(path));
    }
    return fetched.get(path)!;
  };
  if ((await read('datapackage.json')) === null) {
    return null;
  }
  return readPackage(read, `${source.feed}-${source.date}`);
}
