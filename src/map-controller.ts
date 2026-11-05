import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { MapFocusTarget } from 'gtfs-zone-web-common/map/layer-manager';
import { RtMapController } from 'gtfs-zone-web-common/map/rt-map-controller';
import { CONFIG } from './config';

/** What the map highlights: nothing, or one route. */
export type MapFocus = { type: 'home' } | { type: 'route'; route_id: string };

export class MapController extends RtMapController<MapFocus> {
  constructor() {
    super(
      {
        viewKey: CONFIG.MAP_VIEW_KEY,
        appearanceKey: CONFIG.MAP_APPEARANCE_KEY,
        workerUrl: maplibreWorkerUrl,
      },
      { type: 'home' }
    );
  }

  protected targetState(target: MapFocusTarget): MapFocus | null {
    if (target.kind === 'route') {
      return { type: 'route', route_id: target.id };
    }
    if (target.kind === 'vehicle') {
      const v = this.positions.find((p) => p.key === target.id);
      return v?.routeId ? { type: 'route', route_id: v.routeId } : null;
    }
    return null;
  }

  protected applyFocus(state: MapFocus): void {
    if (state.type === 'route') {
      this.focusRoute(state.route_id);
    } else {
      this.focusHome();
    }
  }
}
