/** The archive selection in the URL hash: `#feed=<id>&from=<date>&to=<date>`. */

export interface ArchiveSelection {
  feed: string;
  from: string;
  to: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readHash(): ArchiveSelection | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const feed = params.get('feed');
  const from = params.get('from');
  const to = params.get('to') ?? from;
  if (!feed || !from || !to || !DATE.test(from) || !DATE.test(to)) {
    return null;
  }
  return { feed, from, to };
}

/** Replaces the hash; null clears it (uploads have no link). */
export function writeHash(selection: ArchiveSelection | null): void {
  const hash = selection ? `#${new URLSearchParams({ ...selection })}` : '';
  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}${hash}`
  );
}
