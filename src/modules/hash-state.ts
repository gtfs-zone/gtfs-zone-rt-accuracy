/**
 * The archive selection and panel filter in the URL hash:
 * `#feed=<id>&from=<date>&to=<date>`, plus one of `route=<id>`,
 * `stop=<id>` or `vehicle=<key>&trip=<trip key>`.
 */

import type { MapFocus } from '../map-controller';

export interface ArchiveSelection {
  feed: string;
  from: string;
  to: string;
}

export interface LinkState extends ArchiveSelection {
  focus: MapFocus;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readFocus(params: URLSearchParams): MapFocus {
  const route = params.get('route');
  const stop = params.get('stop');
  const vehicle = params.get('vehicle');
  const trip = params.get('trip');
  if (route) {
    return { type: 'route', route_id: route };
  }
  if (stop) {
    return { type: 'stop', stop_id: stop };
  }
  if (vehicle && trip) {
    return { type: 'vehicle', key: vehicle, tripKey: trip };
  }
  return { type: 'home' };
}

export function readHash(): LinkState | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const feed = params.get('feed');
  const from = params.get('from');
  const to = params.get('to') ?? from;
  if (!feed || !from || !to || !DATE.test(from) || !DATE.test(to)) {
    return null;
  }
  return { feed, from, to, focus: readFocus(params) };
}

/** Replaces the hash; null clears it (uploads have no link). */
export function writeHash(
  selection: ArchiveSelection | null,
  focus: MapFocus = { type: 'home' }
): void {
  let hash = '';
  if (selection) {
    const params = new URLSearchParams({
      feed: selection.feed,
      from: selection.from,
      to: selection.to,
    });
    if (focus.type === 'route') {
      params.set('route', focus.route_id);
    } else if (focus.type === 'stop') {
      params.set('stop', focus.stop_id);
    } else if (focus.type === 'vehicle') {
      params.set('vehicle', focus.key);
      params.set('trip', focus.tripKey);
    }
    hash = `#${params}`;
  }
  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}${hash}`
  );
}
