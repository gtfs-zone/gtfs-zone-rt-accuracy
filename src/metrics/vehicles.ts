/** The vehicles on the map at a moment, from the dataset's fix table. */

import type { Dataset } from './dataset';

/** A vehicle at its latest fix, as the page draws it. */
export interface FrameVehicle {
  /** vehicle_id, or `#<fix index>` when absent. */
  key: string;
  vehicleId: string;
  lat: number;
  lon: number;
  bearing?: number;
  tripId?: string;
  routeId?: string;
  timestamp: number;
  /** service_date|trip_id, or '' without a trip. */
  tripKey: string;
}

/** First index with `values[i] >= x`. */
function lowerBound(values: Float64Array, x: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < x) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Each vehicle at its latest fix in [time - maxAge, time]. */
export function vehiclesAt(
  data: Dataset,
  time: number,
  maxAge: number
): FrameVehicle[] {
  const f = data.fixes;
  const s = f.strings;
  const from = lowerBound(f.t, time - maxAge);
  const latest = new Map<string, number>();
  for (let i = from; i < f.t.length && f.t[i] <= time; i++) {
    latest.set(s[f.vehicle[i]] || `#${i}`, i);
  }
  return [...latest].map(([key, i]) => {
    const trip = s[f.trip[i]];
    return {
      key,
      vehicleId: s[f.vehicle[i]],
      lat: f.lat[i],
      lon: f.lon[i],
      bearing: Number.isNaN(f.heading[i]) ? undefined : f.heading[i],
      tripId: trip || undefined,
      routeId: s[f.route[i]] || undefined,
      timestamp: f.t[i],
      tripKey: trip ? `${s[f.serviceDate[i]]}|${trip}` : '',
    };
  });
}
