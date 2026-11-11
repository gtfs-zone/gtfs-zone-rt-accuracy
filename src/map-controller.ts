import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { VehiclePosition } from 'gtfs-zone-web-common/gtfs/rt-types';
import type { GTFSScheduled } from 'gtfs-zone-web-common/gtfs/scheduled';
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

const ROUTES_SOURCE = 'routes';
/** The shared vehicle layer the ghost layers sit below. */
const VEHICLES_BELOW = 'vehicles-halo';
const GHOSTS_SOURCE = 'ghosts';
const GHOST_LINES_LAYER = 'ghost-lines';
const GHOST_RINGS_LAYER = 'ghost-rings';
const ROUTE_LABELS_LAYER = 'route-labels';
const GHOST_IMAGE = 'ghost-ring|';
const LABEL_IMAGE = 'route-label|';
/** Route labels fade in over this zoom range. */
const LABEL_ZOOM_MIN = 11;
const LABEL_ZOOM_MAX = 12;
const LABEL_FONT = '600 12px system-ui, sans-serif';
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

/** `text` in `color` with a light halo, as image data at 2x. */
function labelImage(text: string, color: string): ImageData {
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = LABEL_FONT;
  const w = Math.ceil(probe.measureText(text).width) + 8;
  const h = 18;
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  return ctx.getImageData(0, 0, w * 2, h * 2);
}

export class MapController extends RtMapController<
  MapFocus,
  AccuracyVehicle,
  VehicleTarget
> {
  private ghosts: GeoJSON.FeatureCollection = EMPTY;
  /** Routes labelled on top of the focused one. */
  private activeRoutes: string[] = [];
  private focusedRoute: string | null = null;

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

  loadScheduledFeed(feed: GTFSScheduled): void {
    super.loadScheduledFeed(feed);
    this.focusedRoute = null;
    // Labels of the previous feed's routes would keep their old names.
    this.whenLoaded(() => {
      for (const id of this.map.listImages()) {
        if (id.startsWith(LABEL_IMAGE)) {
          this.map.removeImage(id);
        }
      }
    });
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
    this.focusedRoute = state.type === 'route' ? state.route_id : null;
    this.updateLabelFilter();
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

  /** Label these routes, plus the focused one. */
  setActiveRoutes(routeIds: string[]): void {
    this.activeRoutes = routeIds;
    this.whenLoaded(() => this.updateLabelFilter());
  }

  private addOwnLayers(): void {
    const map: MapLibreMap = this.map;
    const below = map.getLayer(VEHICLES_BELOW) ? VEHICLES_BELOW : undefined;
    if (!map.getSource(GHOSTS_SOURCE)) {
      map.addSource(GHOSTS_SOURCE, { type: 'geojson', data: this.ghosts });
    }
    if (!map.getLayer(ROUTE_LABELS_LAYER) && map.getSource(ROUTES_SOURCE)) {
      map.addLayer(
        {
          id: ROUTE_LABELS_LAYER,
          type: 'symbol',
          source: ROUTES_SOURCE,
          minzoom: LABEL_ZOOM_MIN,
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 400,
            'icon-image': ['concat', LABEL_IMAGE, ['get', 'route_id']],
            'icon-rotation-alignment': 'viewport',
            'icon-allow-overlap': false,
            'icon-padding': 4,
          },
          paint: {
            'icon-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              LABEL_ZOOM_MIN,
              0,
              LABEL_ZOOM_MAX,
              1,
            ],
          },
        },
        below
      );
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
    this.updateLabelFilter();
  }

  private updateLabelFilter(): void {
    if (!this.map?.getLayer(ROUTE_LABELS_LAYER)) {
      return;
    }
    const ids = this.focusedRoute
      ? [...this.activeRoutes, this.focusedRoute]
      : this.activeRoutes;
    this.map.setFilter(ROUTE_LABELS_LAYER, [
      'in',
      ['get', 'route_id'],
      ['literal', ids],
    ]);
  }

  /** Draw a ghost ring or route label the first time a layer asks for it. */
  private addImage(id: string): void {
    if (this.map.hasImage(id)) {
      return;
    }
    if (id.startsWith(GHOST_IMAGE)) {
      const [, color, dashed] = id.split('|');
      this.map.addImage(id, ringImage(color, dashed === '1'), {
        pixelRatio: 2,
      });
    } else if (id.startsWith(LABEL_IMAGE)) {
      const route = this.feed?.routes.get(id.slice(LABEL_IMAGE.length));
      if (route) {
        const text = route.short_name || route.long_name || route.id;
        this.map.addImage(id, labelImage(text, route.color), {
          pixelRatio: 2,
        });
      }
    }
  }
}
