/** `index.json` of archive.rt.gtfs.zone, written by gtfs-zone-rt-archive. */

import { CONFIG } from '../config';

export interface ArchiveDay {
  trips: number;
  predictions: number;
  /** Share of the service day the feed was recorded. */
  coverage: number;
}

export interface ArchiveFeed {
  producer: string;
  dates: Record<string, ArchiveDay>;
}

export interface ArchiveIndex {
  generated?: string;
  feeds: Record<string, ArchiveFeed>;
}

let cached: Promise<ArchiveIndex> | null = null;

export function fetchArchiveIndex(): Promise<ArchiveIndex> {
  cached ??= fetch(`${CONFIG.ARCHIVE_BASE}/index.json`).then(async (res) => {
    if (!res.ok) {
      cached = null;
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as ArchiveIndex;
  });
  return cached;
}

/** The archive's dates for `feed` in [from, to], sorted. */
export function datesInRange(
  feed: ArchiveFeed,
  from: string,
  to: string
): string[] {
  return Object.keys(feed.dates)
    .filter((d) => d >= from && d <= to)
    .sort();
}

/** Days from `from` to `to` inclusive, or NaN for a malformed date. */
export function spanDays(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
}
