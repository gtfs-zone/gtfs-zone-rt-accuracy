import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { VehiclePosition } from 'gtfs-zone-web-common/gtfs/rt-types';
import type { MapFocusTarget } from 'gtfs-zone-web-common/map/layer-manager';
import { RtMapController } from 'gtfs-zone-web-common/map/rt-map-controller';
import { CONFIG } from './config';

/** What the map highlights and the panel is narrowed to. */
export type MapFocus =
  | { type: 'home' }
  | { type: 'route'; route_id: string }
  | { type: 'stop'; stop_id: string }
  | { type: 'vehicle'; key: string; tripKey: string };

/** A vehicle on the map, with the service date + trip key of its trip. */
export interface AccuracyVehicle extends VehiclePosition {
  tripKey: string;
}

interface VehicleTarget {
  tripKey: string;
}

/** A predicted position to draw, joined to the real vehicle. */
export interface GhostMark {
  lat: number;
  lon: number;
  fromLat: number;
  fromLon: number;
  color: string;
  /** Baselines get a dashed ring. */
  dashed: boolean;
}

/** The shared vehicle layer the ghost layers sit below. */
const VEHICLES_BELOW = 'vehicles-halo';
const GHOSTS_SOURCE = 'ghosts';
const GHOST_LINES_LAYER = 'ghost-lines';
const GHOST_RINGS_LAYER = 'ghost-rings';
const GHOST_IMAGE = 'ghost-ring|';
const RING_PX = 16;

const EMPTY: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** A hollow ring in `color`, dashed or solid, as image data at 2x. */
function ringImage(color: string, dashed: boolean): ImageData {
  const size = RING_PX * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

export class MapController extends RtMapController<
  MapFocus,
  AccuracyVehicle,
  VehicleTarget
> {
  private ghosts: GeoJSON.FeatureCollection = EMPTY;

  constructor() {
    super(
      {
        viewKey: CONFIG.MAP_VIEW_KEY,
        appearanceKey: CONFIG.MAP_APPEARANCE_KEY,
        workerUrl: maplibreWorkerUrl,
        vehicleExtra: {
          properties: (v) => ({ trip_key: v.tripKey }),
          target: (p) => ({ tripKey: String(p.trip_key ?? '') }),
        },
      },
      { type: 'home' }
    );
  }

  initialize(container: string): void {
    super.initialize(container);
    this.map.on('styleimagemissing', (e) => this.addImage(e.id));
    this.whenLoaded(() => this.addOwnLayers());
  }

  protected onStyleRebuilt(): void {
    this.addOwnLayers();
  }

  protected targetState(target: MapFocusTarget<VehicleTarget>): MapFocus {
    if (target.kind === 'route') {
      return { type: 'route', route_id: target.id };
    }
    if (target.kind === 'stop') {
      return { type: 'stop', stop_id: target.id };
    }
    return { type: 'vehicle', key: target.id, tripKey: target.tripKey };
  }

  protected applyFocus(state: MapFocus): void {
    if (state.type === 'route') {
      this.focusRoute(state.route_id);
    } else if (state.type === 'stop') {
      this.focusStop(state.stop_id);
    } else if (state.type === 'vehicle') {
      const key = state.key;
      this.focusVehicle((ps) => ps.find((p) => p.key === key), key);
    } else {
      this.focusHome();
    }
  }

  /** Draw the ghosts, replacing the previous ones. */
  showGhosts(marks: GhostMark[]): void {
    const features: GeoJSON.Feature[] = [];
    for (const m of marks) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [m.fromLon, m.fromLat],
            [m.lon, m.lat],
          ],
        },
        properties: { color: m.color },
      });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [m.lon, m.lat] },
        properties: {
          image: `${GHOST_IMAGE}${m.color}|${m.dashed ? 1 : 0}`,
        },
      });
    }
    this.ghosts = { type: 'FeatureCollection', features };
    this.whenLoaded(() => {
      (this.map.getSource(GHOSTS_SOURCE) as GeoJSONSource | undefined)?.setData(
        this.ghosts
      );
    });
  }

  private addOwnLayers(): void {
    const map: MapLibreMap = this.map;
    const below = map.getLayer(VEHICLES_BELOW) ? VEHICLES_BELOW : undefined;
    if (!map.getSource(GHOSTS_SOURCE)) {
      map.addSource(GHOSTS_SOURCE, { type: 'geojson', data: this.ghosts });
    }
    if (!map.getLayer(GHOST_LINES_LAYER)) {
      map.addLayer(
        {
          id: GHOST_LINES_LAYER,
          type: 'line',
          source: GHOSTS_SOURCE,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-dasharray': [2, 2],
            'line-opacity': 0.85,
          },
        },
        below
      );
    }
    if (!map.getLayer(GHOST_RINGS_LAYER)) {
      map.addLayer(
        {
          id: GHOST_RINGS_LAYER,
          type: 'symbol',
          source: GHOSTS_SOURCE,
          filter: ['==', ['geometry-type'], 'Point'],
          layout: {
            'icon-image': ['get', 'image'],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        },
        below
      );
    }
  }

  /** Draw a ghost ring the first time a layer asks for it. */
  private addImage(id: string): void {
    if (!id.startsWith(GHOST_IMAGE) || this.map.hasImage(id)) {
      return;
    }
    const [, color, dashed] = id.split('|');
    this.map.addImage(id, ringImage(color, dashed === '1'), {
      pixelRatio: 2,
    });
  }
}
