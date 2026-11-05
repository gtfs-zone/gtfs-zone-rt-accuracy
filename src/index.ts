// Mounts the shell markup; must stay the first import.
import './shell';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  renderAutoZoomControl,
  syncAutoZoomControl,
  wireAutoZoomControl,
} from 'gtfs-zone-web-common/map/auto-zoom';
import type { VehiclePosition } from 'gtfs-zone-web-common/gtfs/rt-types';
import { GTFSScheduled } from 'gtfs-zone-web-common/gtfs/scheduled';
import {
  setHelpPages,
  showHelpModal,
  showHelpPageOnce,
} from 'gtfs-zone-web-common/ui/help-modal';
import {
  HELP_GROUP_ORDER,
  setHelpRuntimeData,
} from 'gtfs-zone-web-common/ui/help-pages';
import { notify } from 'gtfs-zone-web-common/ui/notification-system';
import {
  PanelResizer,
  restorePanelWidth,
} from 'gtfs-zone-web-common/ui/panel-resizer';
import { BottomSheetController } from 'gtfs-zone-web-common/ui/bottom-sheet';
import { ThemeController } from 'gtfs-zone-web-common/ui/theme-controller';
import {
  renderDockIcons,
  renderNavbarActions,
} from 'gtfs-zone-web-common/ui/navbar-actions';
import { CONFIG } from './config';
import { t } from './i18n/messages';
import { MapController } from './map-controller';
import {
  datesInRange,
  fetchArchiveIndex,
  type ArchiveIndex,
} from './modules/archive-index';
import { readHash, writeHash } from './modules/hash-state';
import { HELP_PAGES } from './modules/help-pages';
import { showLoadModal, type LoadChoice } from './modules/load-modal';
import { isMetric, type Metric } from './modules/metrics-format';
import { resizeHorizonChart } from './modules/horizon-chart';
import { DOCK_ICONS, NAVBAR_ACTIONS } from './modules/navbar-action-list';
import { ReportView, type ReportViewState } from './modules/report-view';
import { TimeSlider } from './modules/time-slider';
import type { FixColumns, Request, Response, Source } from './worker/protocol';

// ─── Shell ────────────────────────────────────────────────────────────────────

renderNavbarActions(document.getElementById('navbar-actions')!, NAVBAR_ACTIONS);
renderDockIcons(DOCK_ICONS);
document.title = t('app.title');

const appContainer = document.querySelector<HTMLElement>('.app-container')!;
restorePanelWidth(appContainer);
notify.initialize();
const themeController = new ThemeController();
themeController.initialize();

const mapCtrl = new MapController();
try {
  mapCtrl.initialize('map');
} catch (e) {
  console.error('[map] failed to initialize:', e);
  document.getElementById('map')!.innerHTML =
    `<div class="h-full flex items-center justify-center p-6 text-center text-sm opacity-70">${t('app.noWebgl')}</div>`;
}
mapCtrl.onSelect = (state) => mapCtrl.focus(state);
mapCtrl.onEmptySelect = () => mapCtrl.focus({ type: 'home' });
new PanelResizer(appContainer, mapCtrl);

document.getElementById('auto-zoom-mount')!.innerHTML = renderAutoZoomControl();
syncAutoZoomControl(mapCtrl.isAutoZoomEnabled());
wireAutoZoomControl(mapCtrl.getAutoZoom());

const bottomSheet = new BottomSheetController(
  document.getElementById('right-panel')!,
  [
    { id: 'dock-browse' },
    { id: 'dock-help', snap: null, onSelect: () => void showHelpModal() },
  ]
);
bottomSheet.onSnapChange((covered) => mapCtrl.setBottomPadding(covered));

setHelpPages(HELP_PAGES, HELP_GROUP_ORDER);
setHelpRuntimeData({ version: __APP_VERSION__, shortcuts: [] });
document.getElementById('app-version')!.textContent = __APP_VERSION__;
document
  .getElementById('help-btn')!
  .addEventListener('click', () => void showHelpModal());

// ─── Panel ────────────────────────────────────────────────────────────────────

const panel = document.getElementById('panel-content')!;
const reportView = new ReportView(panel);

function storedMetric(): Metric {
  try {
    const v = localStorage.getItem(CONFIG.METRIC_KEY);
    return isMetric(v) ? v : 'mae';
  } catch {
    return 'mae';
  }
}

let view: ReportViewState | null = null;
let metric = storedMetric();

function render(patch: Partial<ReportViewState>): void {
  if (!view) {
    return;
  }
  view = { ...view, ...patch };
  reportView.render(view);
}

reportView.onMetric = (next) => {
  metric = next;
  try {
    localStorage.setItem(CONFIG.METRIC_KEY, next);
  } catch {
    // The choice just won't persist.
  }
  render({ metric });
};

themeController.onThemeChange(() => {
  mapCtrl.refreshAccentColor();
  // Series colors have their own light and dark steps.
  render({});
});
new ResizeObserver(() => {
  const el = document.getElementById('horizon-chart');
  if (el) {
    resizeHorizonChart(el);
  }
}).observe(panel);

function renderEmpty(): void {
  panel.innerHTML = `
    <section class="space-y-3 text-sm">
      <h1 class="text-lg font-semibold">${t('help.welcome.title')}</h1>
      <p>${t('help.welcome.lede')}</p>
      <p>${t('help.welcome.loadText')}</p>
      <button class="btn btn-primary btn-sm" data-empty-load>${t('nav.load')}</button>
    </section>`;
  panel
    .querySelector('[data-empty-load]')
    ?.addEventListener('click', () => void openLoad());
}

// ─── Map time ─────────────────────────────────────────────────────────────────

const slider = new TimeSlider();
let fixes: FixColumns | null = null;

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

/** Each vehicle at its latest fix in (time - FIX_MAX_AGE_S, time]. */
function vehiclesAt(time: number): VehiclePosition[] {
  if (!fixes) {
    return [];
  }
  const from = lowerBound(fixes.t, time - CONFIG.FIX_MAX_AGE_S);
  const latest = new Map<string, number>();
  for (let i = from; i < fixes.t.length && fixes.t[i] <= time; i++) {
    latest.set(fixes.vehicle[i] || `#${i}`, i);
  }
  return [...latest].map(([key, i]) => ({
    key,
    vehicleId: fixes!.vehicle[i],
    entityId: key,
    lat: fixes!.lat[i],
    lon: fixes!.lon[i],
    bearing: Number.isNaN(fixes!.heading[i]) ? undefined : fixes!.heading[i],
    tripId: fixes!.trip[i] || undefined,
    routeId: fixes!.route[i] || undefined,
    timestamp: fixes!.t[i],
    raw: null,
  }));
}

slider.onChange = (time) => {
  const vehicles = vehiclesAt(time);
  slider.setVehicleCount(vehicles.length);
  mapCtrl.showVehicles(vehicles);
};

// ─── Loading ──────────────────────────────────────────────────────────────────

let worker: Worker | null = null;

/** Runs one request; resolves with the first message that is not progress. */
function call(
  w: Worker,
  req: Request,
  onProgress?: (done: number, total: number) => void
): Promise<Exclude<Response, { type: 'progress' | 'error' }>> {
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<Response>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.done, msg.total);
        return;
      }
      w.removeEventListener('message', onMessage);
      if (msg.type === 'error') {
        reject(new Error(msg.message));
      } else {
        resolve(msg);
      }
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', (e) => reject(new Error(e.message)), {
      once: true,
    });
    w.postMessage(req);
  });
}

async function loadGtfs(
  choice: LoadChoice,
  url: string | null
): Promise<GTFSScheduled | null> {
  const feed = new GTFSScheduled();
  if (choice.kind === 'upload' && choice.gtfs) {
    await feed.loadFromFile(choice.gtfs);
    return feed;
  }
  if (!url) {
    return null;
  }
  await feed.loadFromUrl(url);
  return feed;
}

function describe(choice: LoadChoice): string {
  if (choice.kind === 'upload') {
    return choice.files.length === 1
      ? choice.files[0].name
      : `${choice.files.length} files`;
  }
  return choice.from === choice.to
    ? `${choice.feed} ${choice.from}`
    : `${choice.feed} ${choice.from} to ${choice.to}`;
}

let generation = 0;

async function load(choice: LoadChoice, index: ArchiveIndex | null) {
  const gen = ++generation;
  const label = describe(choice);
  worker?.terminate();
  const w = new Worker(
    new URL('./worker/accuracy.worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );
  worker = w;
  fixes = null;
  slider.hide();
  mapCtrl.clearVehicles();
  view = {
    label,
    metas: [],
    timeZone: 'UTC',
    status: t('load.progress', { done: 0, total: 1 }),
    report: null,
    gpsMissing: false,
    metric,
  };
  render({});
  bottomSheet.close();

  let packages: Source[];
  if (choice.kind === 'archive') {
    const feed = index?.feeds[choice.feed];
    const dates = feed ? datesInRange(feed, choice.from, choice.to) : [];
    packages = dates.map((date) => ({
      kind: 'archive',
      feed: choice.feed,
      date,
    }));
    writeHash({ feed: choice.feed, from: choice.from, to: choice.to });
  } else {
    packages = [{ kind: 'files', files: choice.files }];
    writeHash(null);
  }
  const actuals: Source | null = choice.actuals
    ? { kind: 'files', files: choice.actuals }
    : null;

  try {
    const loaded = await call(
      w,
      { type: 'load', packages, actuals },
      (done, total) => {
        if (gen === generation) {
          render({ status: t('load.progress', { done, total }) });
        }
      }
    );
    if (gen !== generation || loaded.type !== 'loaded') {
      return;
    }
    fixes = loaded.fixes;
    render({ metas: loaded.metas, status: t('load.gtfsLoading') });

    let gtfs: GTFSScheduled | null = null;
    try {
      gtfs = await loadGtfs(
        choice,
        loaded.metas[loaded.metas.length - 1]?.gtfs ?? null
      );
    } catch (err) {
      notify.warning(
        t('load.gtfsFailed', { reason: String((err as Error).message ?? err) })
      );
    }
    if (gen !== generation) {
      return;
    }
    const timeZone = gtfs?.agencies[0]?.timezone || 'UTC';
    if (gtfs) {
      mapCtrl.loadScheduledFeed(gtfs);
    } else {
      mapCtrl.clearScheduledFeed();
    }
    if (fixes.t.length) {
      slider.setRange(fixes.t[0], fixes.t[fixes.t.length - 1], timeZone);
    }
    render({ timeZone, status: t('load.scoring') });

    const stops: [string, number, number][] | null = gtfs
      ? [...gtfs.stops.values()].map((s) => [s.id, s.lat, s.lon])
      : null;
    const scored = await call(w, { type: 'score', stops, timeZone });
    if (gen !== generation || scored.type !== 'report') {
      return;
    }
    render({ report: scored.report, status: null, gpsMissing: !gtfs });
    notify.success(t('load.loaded', { label }));
  } catch (err) {
    if (gen !== generation) {
      return;
    }
    const reason = err instanceof Error ? err.message : String(err);
    render({ status: null });
    notify.error(t('load.failed', { label, reason }));
  }
}

async function archiveIndex(): Promise<[ArchiveIndex | null, string | null]> {
  try {
    return [await fetchArchiveIndex(), null];
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return [null, t('load.indexFailed', { reason })];
  }
}

async function openLoad(): Promise<void> {
  const [index, error] = await archiveIndex();
  const choice = await showLoadModal(index, error, readHash() ?? {});
  if (choice) {
    await load(choice, index);
  }
}

document
  .getElementById('load-btn')!
  .addEventListener('click', () => void openLoad());

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const linked = readHash();
  if (linked) {
    const [index, error] = await archiveIndex();
    if (index) {
      await load({ kind: 'archive', ...linked, actuals: null }, index);
      return;
    }
    notify.error(error ?? '');
  }
  renderEmpty();
  await showHelpPageOnce('welcome', { continueLabel: t('help.welcome.start') });
}

void boot();
