// Mounts the shell markup; must stay the first import.
import './shell';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  renderAutoZoomControl,
  syncAutoZoomControl,
  wireAutoZoomControl,
} from 'gtfs-zone-web-common/map/auto-zoom';
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
import {
  MapController,
  type AccuracyVehicle,
  type MapFocus,
} from './map-controller';
import type { Ghost } from './metrics/ghosts';
import type { Report, ScoreFilter } from './metrics/score';
import {
  datesInRange,
  fetchArchiveIndex,
  type ArchiveIndex,
} from './modules/archive-index';
import { GhostToggles } from './modules/ghost-toggles';
import {
  readHash,
  writeHash,
  type ArchiveSelection,
} from './modules/hash-state';
import { HELP_PAGES } from './modules/help-pages';
import { showLoadModal, type LoadChoice } from './modules/load-modal';
import { isMetric, type Metric } from './modules/metrics-format';
import { resizeHorizonChart } from './modules/horizon-chart';
import { DOCK_ICONS, NAVBAR_ACTIONS } from './modules/navbar-action-list';
import { isBaseline, producerColor } from './modules/producer-colors';
import { ReportView, type ReportViewState } from './modules/report-view';
import { TimeSlider } from './modules/time-slider';
import type {
  FixColumns,
  RequestBody,
  Response,
  ResponseBody,
  Source,
} from './worker/protocol';

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
mapCtrl.onSelect = (state) => select(state);
mapCtrl.onEmptySelect = () => select({ type: 'home' });
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

reportView.onRoute = (routeId) => select({ type: 'route', route_id: routeId });
reportView.onClearFilter = () => select({ type: 'home' });
reportView.onSeek = (time) => slider.seek(time);

themeController.onThemeChange(() => {
  mapCtrl.refreshAccentColor();
  // Series colors have their own light and dark steps.
  render({});
  ghostToggles.render(fullReport?.producers ?? []);
  drawGhosts();
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
const ghostToggles = new GhostToggles();
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
function vehiclesAt(time: number): AccuracyVehicle[] {
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
    tripKey: fixes!.trip[i] ? `${fixes!.serviceDate[i]}|${fixes!.trip[i]}` : '',
  }));
}

slider.onChange = (time) => {
  const vehicles = vehiclesAt(time);
  slider.setVehicleCount(vehicles.length);
  mapCtrl.showVehicles(vehicles);
  mapCtrl.setActiveRoutes([
    ...new Set(vehicles.flatMap((v) => (v.routeId ? [v.routeId] : []))),
  ]);
  reportView.setTime(time);
  requestGhosts();
};
ghostToggles.onChange = () => requestGhosts();

// ─── Loading ──────────────────────────────────────────────────────────────────

let worker: Worker | null = null;

let nextRequestId = 0;

/** Runs one request; resolves with its first response that is not progress. */
function call(
  w: Worker,
  req: RequestBody,
  onProgress?: (done: number, total: number) => void
): Promise<Exclude<ResponseBody, { type: 'progress' | 'error' }>> {
  const id = ++nextRequestId;
  return new Promise((resolve, reject) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e: MessageEvent<Response>) => {
      const msg = e.data;
      if (msg.id !== id) {
        return;
      }
      if (msg.type === 'progress') {
        onProgress?.(msg.done, msg.total);
        return;
      }
      done();
      if (msg.type === 'error') {
        reject(new Error(msg.message));
      } else {
        resolve(msg);
      }
    };
    const onError = (e: ErrorEvent) => {
      done();
      reject(new Error(e.message));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ ...req, id });
  });
}

// ─── Filter and ghosts ────────────────────────────────────────────────────────

let gtfsFeed: GTFSScheduled | null = null;
let selection: ArchiveSelection | null = null;
let filter: MapFocus = { type: 'home' };
/** The unfiltered report, restored when the filter is cleared. */
let fullReport: Report | null = null;
let scoreSeq = 0;

/** A stop and its descendants, so a station matches its platforms. */
function stopFamily(stopId: string): string[] {
  const out = [stopId];
  for (let i = 0; i < out.length; i++) {
    out.push(...(gtfsFeed?.childrenByParent.get(out[i]) ?? []));
  }
  return out;
}

function scoreFilter(focus: MapFocus): ScoreFilter | undefined {
  switch (focus.type) {
    case 'route':
      return { routeId: focus.route_id };
    case 'stop':
      return { stopIds: stopFamily(focus.stop_id) };
    case 'vehicle':
      return focus.tripKey ? { tripKey: focus.tripKey } : undefined;
    default:
      return undefined;
  }
}

/** Focus the map on `focus` and narrow the panel and ghosts to it. */
function select(focus: MapFocus): void {
  mapCtrl.focus(focus);
  void applyFilter(focus);
}

async function applyFilter(focus: MapFocus): Promise<void> {
  filter = focus;
  writeHash(selection, focus);
  requestGhosts();
  const seq = ++scoreSeq;
  const narrowed = scoreFilter(focus);
  if (!fullReport || !worker) {
    render({ filter });
    return;
  }
  if (!narrowed) {
    render({ filter, report: fullReport, status: null });
    return;
  }
  render({ filter, status: t('load.scoring') });
  try {
    const scored = await call(worker, {
      type: 'score',
      timeZone: view?.timeZone ?? 'UTC',
      filter: narrowed,
    });
    if (seq === scoreSeq && scored.type === 'report') {
      render({ report: scored.report, status: null });
    }
  } catch (err) {
    if (seq === scoreSeq) {
      render({ status: null });
      notify.error(String((err as Error).message ?? err));
    }
  }
}

let ghosts: Ghost[] = [];
let ghostSeq = 0;
let ghostBusy = false;
let ghostAgain = false;

function drawGhosts(): void {
  const recorded = (fullReport?.producers ?? []).filter((p) => !isBaseline(p));
  mapCtrl.showGhosts(
    ghosts.map((g) => ({
      ...g,
      color: producerColor(g.producer, recorded),
      dashed: isBaseline(g.producer),
    }))
  );
}

/** Ask for the ghosts at the slider time; one request runs at a time. */
function requestGhosts(): void {
  const producers = ghostToggles.enabled();
  const seq = ++ghostSeq;
  if (!worker || !fullReport || !fixes || producers.length === 0) {
    ghosts = [];
    drawGhosts();
    return;
  }
  if (ghostBusy) {
    ghostAgain = true;
    return;
  }
  ghostBusy = true;
  const w = worker;
  call(w, {
    type: 'ghosts',
    time: slider.time,
    producers,
    maxAge: CONFIG.FIX_MAX_AGE_S,
    filter: scoreFilter(filter),
  })
    .then((msg) => {
      if (seq === ghostSeq && w === worker && msg.type === 'ghosts') {
        ghosts = msg.ghosts;
        drawGhosts();
      }
    })
    .catch(() => {
      // A failed ghost request leaves the last ghosts drawn.
    })
    .finally(() => {
      ghostBusy = false;
      if (ghostAgain) {
        ghostAgain = false;
        requestGhosts();
      }
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

async function load(
  choice: LoadChoice,
  index: ArchiveIndex | null,
  focus: MapFocus = { type: 'home' }
) {
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
  fullReport = null;
  gtfsFeed = null;
  filter = focus;
  ghosts = [];
  ghostBusy = false;
  ghostAgain = false;
  ghostToggles.render([]);
  slider.hide();
  mapCtrl.clearVehicles();
  mapCtrl.showGhosts([]);
  view = {
    label,
    metas: [],
    timeZone: 'UTC',
    status: t('load.progress', { done: 0, total: 1 }),
    report: null,
    gpsMissing: false,
    metric,
    feed: null,
    filter: { type: 'home' },
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
    selection = { feed: choice.feed, from: choice.from, to: choice.to };
  } else {
    packages = [{ kind: 'files', files: choice.files }];
    selection = null;
  }
  writeHash(selection, focus);
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
    gtfsFeed = gtfs;
    if (gtfs) {
      mapCtrl.loadScheduledFeed(gtfs);
    } else {
      mapCtrl.clearScheduledFeed();
    }
    if (fixes.t.length) {
      slider.setRange(fixes.t[0], fixes.t[fixes.t.length - 1], timeZone);
    }
    render({ timeZone, feed: gtfs, status: t('load.scoring') });

    const stops: [string, number, number][] | null = gtfs
      ? [...gtfs.stops.values()].map((s) => [s.id, s.lat, s.lon])
      : null;
    const scored = await call(w, { type: 'score', stops, timeZone });
    if (gen !== generation || scored.type !== 'report') {
      return;
    }
    fullReport = scored.report;
    render({ report: scored.report, status: null, gpsMissing: !gtfs });
    ghostToggles.render(scored.report.producers);
    notify.success(t('load.loaded', { label }));
    if (filter.type !== 'home') {
      select(filter);
    } else {
      requestGhosts();
    }
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
      const { focus, ...range } = linked;
      await load({ kind: 'archive', ...range, actuals: null }, index, focus);
      return;
    }
    notify.error(error ?? '');
  }
  renderEmpty();
  await showHelpPageOnce('welcome', { continueLabel: t('help.welcome.start') });
}

void boot();
