/**
 * Turns the loaded GTFS and the vehicles on the map into search groups for
 * `SearchController`.
 *
 * Stops and routes are built once per GTFS, so the controller's haystack cache
 * hits on every keystroke. Vehicles are the ones of the last drawn frame and
 * are rebuilt per query.
 */

import { VEHICLE_UNMATCHED_COLOR } from 'gtfs-zone-web-common/map/layer-manager';
import type { GTFSScheduled } from 'gtfs-zone-web-common/gtfs/scheduled';
import {
  vehicleDisplayName,
  vehicleRouteId,
} from 'gtfs-zone-web-common/gtfs/entity-render';
import {
  scheduleSearchGroups,
  searchHaystack,
  type ScheduleSearchGroups,
} from 'gtfs-zone-web-common/gtfs/search-entries';
import {
  dotMarker,
  type SearchEntry,
  type SearchGroup,
} from 'gtfs-zone-web-common/ui/search-controller';
import type { AccuracyVehicle, MapFocus } from '../map-controller';
import { t } from '../i18n/messages';

let memo: {
  feed: GTFSScheduled | null;
  groups: ScheduleSearchGroups;
} | null = null;

/** Stops and routes of `feed`, rebuilt only when the GTFS changes. */
function scheduleGroups(feed: GTFSScheduled | null): ScheduleSearchGroups {
  if (memo?.feed !== feed) {
    console.log('[SearchEntries] building schedule search groups');
    memo = { feed, groups: scheduleSearchGroups(feed) };
  }
  return memo.groups;
}

export function buildSearchGroups(
  feed: GTFSScheduled | null,
  vehicles: readonly AccuracyVehicle[]
): SearchGroup<MapFocus>[] {
  const { stops, routes } = scheduleGroups(feed);

  const vehicleEntries: SearchEntry<MapFocus>[] = [];
  for (const vehicle of vehicles) {
    // Same color the map paints it: the vehicle's route, or the unmatched grey.
    const routeId = vehicleRouteId(feed, vehicle);
    const color =
      (routeId ? feed?.routes.get(routeId)?.color : undefined) ??
      VEHICLE_UNMATCHED_COLOR;
    const name = vehicleDisplayName(feed, vehicle);
    vehicleEntries.push({
      payload: { type: 'vehicle', key: vehicle.key, tripKey: vehicle.tripKey },
      icon: dotMarker(color),
      primary: name,
      secondary: vehicle.vehicleId || vehicle.key,
      haystack: searchHaystack(
        name,
        vehicle.vehicleId,
        vehicle.label,
        vehicle.tripId,
        routeId
      ),
    });
  }

  return [
    stops,
    routes,
    { label: t('search.vehicles'), entries: vehicleEntries },
  ];
}
