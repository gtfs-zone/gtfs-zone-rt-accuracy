// Mounts the shell markup; must stay the first import.
import './shell';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  renderAutoZoomControl,
  syncAutoZoomControl,
  wireAutoZoomControl,
} from 'gtfs-zone-web-common/map/auto-zoom';
import type {
  GTFSScheduled,
  LoadHooks,
} from 'gtfs-zone-web-common/gtfs/scheduled';
import {
  ParseCache,
  type CachedLoad,
} from 'gtfs-zone-web-common/gtfs/parse-cache';
import { resolvedScheduledUrl } from 'gtfs-zone-web-common/gtfs/feed-selection';
import {
  showLoadModal,
  type LoadModalResult,
  type OfferSection,
} from 'gtfs-zone-web-common/ui/load-modal';
import { formatBytes } from 'gtfs-zone-web-common/gtfs/feed-download';
import type { LoadProgress } from 'gtfs-zone-web-common/gtfs/store/store-client';
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
import {
  hashFor,
  readHash,
  writeHash,
  type ArchiveSelection,
} from './modules/hash-state';
import { HELP_PAGES } from './modules/help-pages';
import {
  showLoadStep,
  sortedDates,
  type FeedPick,
  type LoadChoice,
} from './modules/load-step';
import { isMetric, type Metric } from './modules/metrics-format';
import { resizeHorizonChart } from './modules/horizon-chart';
import { DOCK_ICONS, NAVBAR_ACTIONS } from './modules/navbar-action-list';
import { isBaseline, producerColor } from './modules/producer-colors';
import { ReportView, type ReportViewState } from './modules/report-view';
import { Timeline } from './modules/timeline';
import type {
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
panel.innerHTML = `<div class="flex flex-col gap-4">
  <div id="report-head"></div>
  <div id="timeline"></div>
  <div id="report-body"></div>
</div>`;
const reportBody = document.getElementById('report-body')!;
const reportView = new ReportView(
  document.getElementById('report-head')!,
  reportBody,
  (focus) => hashFor(selection, focus) || '#'
);

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

reportView.onNavigate = (focus) => select(focus);

themeController.onThemeChange(() => {
  mapCtrl.refreshAccentColor();
  // Series colors have their own light and dark steps.
  render({});
  timeline.redraw();
  drawGhosts();
});
new ResizeObserver(() => {
  const el = document.getElementById('horizon-chart');
  if (el) {
    resizeHorizonChart(el);
  }
}).observe(panel);

function renderEmpty(): void {
  document.getElementById('report-head')!.innerHTML = '';
  timeline.setData(null);
  reportBody.innerHTML = `
    <section class="space-y-3 text-sm">
      <h1 class="text-lg font-semibold">${t('help.welcome.title')}</h1>
      <p>${t('help.welcome.lede')}</p>
      <p>${t('help.welcome.loadText')}</p>
      <button class="btn btn-primary btn-sm" data-empty-load>${t('nav.load')}</button>
    </section>`;
  reportBody
    .querySelector('[data-empty-load]')
    ?.addEventListener('click', () => void openLoad());
}

// ─── Map time ─────────────────────────────────────────────────────────────────

const timeline = new Timeline(document.getElementById('timeline')!);
/** The worker whose dataset is loaded, or null while a load runs. */
let ready: Worker | null = null;

timeline.onChange = () => requestFrame();
timeline.onGhosts = () => requestFrame();

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
  requestFrame();
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

/**
 * Ask for the vehicles and ghosts at the slider time; one request runs at a
 * time, and the latest slider time is asked for when it finishes.
 */
function requestFrame(): void {
  const seq = ++ghostSeq;
  if (!ready || ready !== worker) {
    timeline.setVehicleCount(0);
    mapCtrl.showVehicles([]);
    ghosts = [];
    drawGhosts();
    return;
  }
  if (ghostBusy) {
    ghostAgain = true;
    return;
  }
  ghostBusy = true;
  const w = ready;
  call(w, {
    type: 'frame',
    time: timeline.current,
    producers: fullReport ? timeline.enabledGhosts() : [],
    maxAge: CONFIG.FIX_MAX_AGE_S,
    filter: scoreFilter(filter),
  })
    .then((msg) => {
      if (seq === ghostSeq && w === worker && msg.type === 'frame') {
        const vehicles: AccuracyVehicle[] = msg.vehicles.map((v) => ({
          ...v,
          entityId: v.key,
          raw: null,
        }));
        timeline.setVehicleCount(vehicles.length);
        mapCtrl.showVehicles(vehicles);
        ghosts = msg.ghosts;
        drawGhosts();
      }
    })
    .catch(() => {
      // A failed frame request leaves the last frame drawn.
    })
    .finally(() => {
      ghostBusy = false;
      if (ghostAgain) {
        ghostAgain = false;
        requestFrame();
      }
    });
}

/** GTFS tables accuracy never reads. */
const SKIP_TABLES = [
  'calendar_dates',
  'transfers',
  'translations',
  'frequencies',
  'pathways',
  'levels',
  'attributions',
  'fare_attributes',
  'fare_rules',
  'fare_media',
  'fare_products',
  'fare_leg_rules',
  'fare_leg_join_rules',
  'fare_transfer_rules',
  'rider_categories',
  'timeframes',
  'areas',
  'stop_areas',
  'networks',
  'route_networks',
  'location_groups',
  'location_group_stops',
  'booking_rules',
];

/** The status line for one GTFS load step. */
function gtfsProgressText(p: LoadProgress): string {
  if (p.stage === 'index') {
    return t('load.gtfsIndexing');
  }
  const bytes = p.total
    ? `${formatBytes(p.bytes)} / ${formatBytes(p.total)}`
    : formatBytes(p.bytes);
  return t('load.gtfsProgress', {
    file: p.table ? `${p.table}.txt` : '',
    bytes,
  });
}

/** What the parse cache keeps with a stored GTFS. */
interface StoredExtra {
  /** The archive feed it came with, so "Your feeds" reopens its dates. */
  archive?: string;
}

const parseCache = new ParseCache('accuracy');
/** The parse cache entry of the loaded GTFS, or null. */
let gtfsEntryId: string | null = null;

async function loadGtfs(
  choice: LoadChoice,
  metaUrl: string | null,
  label: string,
  hooks: LoadHooks
): Promise<CachedLoad | null> {
  // Every trip stays on the main thread for the report; stop_times only as
  // stop lists, for route geometry where the feed has no shapes.
  const options = {
    mirror: 'trips',
    stopTimes: 'patterns',
    skipTables: SKIP_TABLES,
  } as const;
  if (choice.kind === 'upload' && choice.gtfs) {
    const { input, sourceUrl } = choice.gtfs;
    return parseCache.load(
      input,
      { label: choice.gtfs.label, sourceUrl },
      options,
      hooks
    );
  }
  if (!metaUrl) {
    return null;
  }
  const extra: StoredExtra =
    choice.kind === 'archive' ? { archive: choice.feed } : {};
  return parseCache.load(
    { url: metaUrl },
    { label: choice.kind === 'archive' ? choice.feed : label, extra },
    options,
    hooks
  );
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
/** Aborts the GTFS load of a superseded `load`. */
let gtfsAbort = new AbortController();

async function load(
  choice: LoadChoice,
  index: ArchiveIndex | null,
  focus: MapFocus = { type: 'home' }
) {
  const gen = ++generation;
  gtfsAbort.abort();
  gtfsAbort = new AbortController();
  const label = describe(choice);
  worker?.terminate();
  const w = new Worker(
    new URL('./worker/accuracy.worker.ts', import.meta.url),
    {
      type: 'module',
    }
  );
  worker = w;
  ready = null;
  fullReport = null;
  // The old schedule's worker goes before the new one is built.
  gtfsFeed?.release();
  gtfsFeed = null;
  gtfsEntryId = null;
  mapCtrl.clearScheduledFeed();
  filter = focus;
  ghosts = [];
  ghostBusy = false;
  ghostAgain = false;
  timeline.setProducers([]);
  timeline.setData(null);
  mapCtrl.clearVehicles();
  mapCtrl.showGhosts([]);
  view = {
    label,
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
    ready = w;
    render({ status: t('load.gtfsLoading') });

    let cached: CachedLoad | null = null;
    try {
      cached = await loadGtfs(
        choice,
        loaded.metas[loaded.metas.length - 1]?.gtfs ?? null,
        label,
        {
          signal: gtfsAbort.signal,
          onProgress: (p) => {
            if (gen === generation) {
              render({ status: gtfsProgressText(p) });
            }
          },
        }
      );
    } catch (err) {
      // A superseded load's GTFS is aborted on purpose.
      if (gen === generation) {
        notify.warning(
          t('load.gtfsFailed', {
            reason: String((err as Error).message ?? err),
          })
        );
      }
    }
    const gtfs = cached?.feed ?? null;
    if (gen !== generation) {
      gtfs?.release();
      return;
    }
    gtfsEntryId = cached?.entry?.id ?? null;
    if (cached?.restored) {
      notify.info(t('load.gtfsRestored', { label: cached.entry?.label ?? '' }));
    }
    if (cached?.storeError) {
      notify.warning(cached.storeError);
    }
    const timeZone = gtfs?.agencies[0]?.timezone || 'UTC';
    gtfsFeed = gtfs;
    if (gtfs) {
      mapCtrl.loadScheduledFeed(gtfs);
    } else {
      mapCtrl.clearScheduledFeed();
    }
    const bins = await call(w, {
      type: 'timeline',
      timeZone,
      binS: CONFIG.TIMELINE_BIN_S,
    });
    if (gen !== generation || bins.type !== 'timeline') {
      return;
    }
    if (bins.days.length) {
      timeline.setData({
        days: bins.days,
        zone: timeZone,
        binS: CONFIG.TIMELINE_BIN_S,
        start: bins.start,
        end: bins.end,
      });
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
    timeline.setProducers(scored.report.producers);
    notify.success(t('load.loaded', { label }));
    if (filter.type !== 'home') {
      select(filter);
    } else {
      requestFrame();
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

/** The archive feeds as the shared modal's first section. */
function archiveSection(
  index: ArchiveIndex | null,
  error: string | null
): OfferSection {
  const feeds = index ? Object.keys(index.feeds).sort() : [];
  return {
    heading: t('load.archive'),
    note: error ?? undefined,
    offers: feeds.map((feed) => {
      const dates = sortedDates(index!, feed);
      return {
        id: feed,
        name: feed,
        subtitle: t('load.feedDays', {
          producer: index!.feeds[feed].producer,
          n: dates.length,
          last: dates[dates.length - 1] ?? '-',
        }),
        active: feed === selection?.feed,
      };
    }),
  };
}

/** The shared modal's result as a pick for the next step, or null. */
function feedPick(
  result: LoadModalResult,
  index: ArchiveIndex | null
): FeedPick | null {
  switch (result?.kind) {
    case 'offer':
      return { kind: 'archive', feed: result.id };
    case 'stored': {
      const entry = parseCache.get(result.id);
      if (!entry) {
        notify.error(t('load.storedMissing'));
        return null;
      }
      const archive = (entry.extra as StoredExtra | undefined)?.archive;
      if (archive && index?.feeds[archive]) {
        return { kind: 'archive', feed: archive };
      }
      return {
        kind: 'gtfs',
        gtfs: {
          input: { stored: entry.id },
          label: entry.label,
          sourceUrl: entry.sourceUrl,
        },
      };
    }
    case 'update':
    case 'selection': {
      const scheduled = result.selection.scheduled;
      if (!scheduled) {
        return null;
      }
      return {
        kind: 'gtfs',
        gtfs:
          scheduled.kind === 'file'
            ? { input: { file: scheduled.file }, label: scheduled.label }
            : {
                input: { url: resolvedScheduledUrl(scheduled) },
                label: scheduled.label,
                sourceUrl: scheduled.url,
              },
      };
    }
    default:
      return null;
  }
}

async function openLoad(): Promise<void> {
  const [index, error] = await archiveIndex();
  for (;;) {
    let packageOnly = false;
    const result = await showLoadModal(null, {
      realtime: false,
      sections: [archiveSection(index, error)],
      library: {
        feeds: parseCache.offers(gtfsEntryId),
        onDelete: (id) => parseCache.delete(id),
      },
      extraActions: [
        {
          label: t('load.uploadPackage'),
          className: 'btn-ghost',
          onClick: () => {
            packageOnly = true;
          },
        },
      ],
    });
    const pick: FeedPick | null = packageOnly
      ? { kind: 'package' }
      : feedPick(result, index);
    if (!pick) {
      return;
    }
    console.log(`[load] picked ${pick.kind}`);
    const choice = await showLoadStep(pick, index, readHash() ?? {});
    if (choice === 'back') {
      continue;
    }
    if (choice) {
      await load(choice, index);
    }
    return;
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
