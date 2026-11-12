/** The panel: a breadcrumb trail over what was loaded, and the scores. */

import {
  routeCrumb,
  stopCrumbs,
  truncateCrumb,
} from 'gtfs-zone-web-common/gtfs/breadcrumbs';
import type { GTFSScheduled } from 'gtfs-zone-web-common/gtfs/scheduled';
import {
  renderBreadcrumbTrail,
  type BreadcrumbItem,
} from 'gtfs-zone-web-common/ui/breadcrumb-trail';
import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { t } from '../i18n/messages';
import type { MapFocus } from '../map-controller';
import type { GroupStats, Report } from '../metrics/score';
import { renderHorizonChart } from './horizon-chart';
import {
  formatMetric,
  metricLabel,
  metricLongLabel,
  metricValue,
  METRICS,
  type Metric,
} from './metrics-format';
import { isBaseline, producerColor } from './producer-colors';

export interface ReportViewState {
  label: string;
  timeZone: string;
  /** Set while loading or scoring. */
  status: string | null;
  report: Report | null;
  gpsMissing: boolean;
  metric: Metric;
  /** Route and stop names; null without a GTFS snapshot. */
  feed: GTFSScheduled | null;
  /** What the scores are narrowed to. */
  filter: MapFocus;
}

function swatch(producer: string, recorded: string[]): string {
  const color = producerColor(producer, recorded);
  const dashed = isBaseline(producer);
  const line = dashed
    ? `<line x1="1" y1="5" x2="15" y2="5" stroke="${color}" stroke-width="2" stroke-dasharray="4 3"/>`
    : `<line x1="1" y1="5" x2="15" y2="5" stroke="${color}" stroke-width="2"/>`;
  return `<span class="inline-flex items-center gap-1 whitespace-nowrap"><svg width="16" height="10" aria-hidden="true">${line}</svg>${escapeHtml(producer)}</span>`;
}

function section(title: string, body: string): string {
  return `<section class="space-y-2"><h3 class="text-sm font-semibold">${title}</h3>${body}</section>`;
}

/** `rowAttrs` holds extra attributes per row, such as a click target. */
function table(head: string[], rows: string[][], rowAttrs?: string[]): string {
  const th = head.map((h) => `<th>${h}</th>`).join('');
  const tr = rows
    .map(
      (r, n) =>
        `<tr ${rowAttrs?.[n] ?? ''}>${r.map((c, i) => `<td class="${i ? 'text-right tabular-nums' : ''}">${c}</td>`).join('')}</tr>`
    )
    .join('');
  return `<div class="overflow-x-auto"><table class="table table-xs"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/** A route's short-name badge in its color and its long name, else its id. */
function routeLabel(routeId: string, feed: GTFSScheduled | null): string {
  const route = feed?.routes.get(routeId);
  if (!route) {
    return escapeHtml(routeId);
  }
  const short = route.short_name || route.long_name || route.id;
  const long =
    route.short_name && route.long_name
      ? ` <span class="text-xs opacity-80">${escapeHtml(route.long_name)}</span>`
      : '';
  return `<span class="inline-flex items-center gap-1 whitespace-nowrap"><span class="badge badge-sm font-semibold border-0 ring-1 ring-base-content/20" style="background:${escapeHtml(route.color)};color:${escapeHtml(route.text_color)}">${escapeHtml(short)}</span>${long}</span>`;
}

/** Producers as columns, one row per group, showing `metric`. */
function breakdown(
  groups: GroupStats[],
  report: Report,
  metric: Metric,
  label: (key: string) => string = escapeHtml,
  rowAttrs?: (key: string) => string
) {
  const recorded = report.producers.filter((p) => !isBaseline(p));
  const fmt = formatMetric(metric);
  return table(
    ['', ...report.producers.map((p) => swatch(p, recorded))],
    groups.map((g) => [
      label(g.key),
      ...report.producers.map((p) => fmt(metricValue(g.producers[p], metric))),
    ]),
    rowAttrs ? groups.map((g) => rowAttrs(g.key)) : undefined
  );
}

/** The loaded data, then what the scores are narrowed to. */
function trail(state: ReportViewState): BreadcrumbItem<MapFocus>[] {
  const root: BreadcrumbItem<MapFocus> = {
    typeLabel: t('crumb.data'),
    label: truncateCrumb(state.label),
    pageState: { type: 'home' },
  };
  const { filter, feed } = state;
  switch (filter.type) {
    case 'route':
      return [root, routeCrumb(feed, filter.route_id)];
    case 'stop':
      return [root, ...stopCrumbs(feed, filter.stop_id)];
    case 'vehicle': {
      const trip = filter.tripKey.slice(filter.tripKey.indexOf('|') + 1);
      const routeId = trip ? feed?.trips.get(trip)?.route_id : undefined;
      return [
        root,
        ...(routeId ? [routeCrumb(feed, routeId)] : []),
        {
          typeLabel: t('crumb.vehicle'),
          label: truncateCrumb(
            trip
              ? t('crumb.vehicleTrip', { vehicle: filter.key, trip })
              : filter.key
          ),
          pageState: filter,
        },
      ];
    }
    default:
      return [root];
  }
}

function overall(report: Report): string {
  const recorded = report.producers.filter((p) => !isBaseline(p));
  return table(
    [t('report.producer'), ...METRICS.map(metricLabel)],
    report.producers.map((p) => [
      swatch(p, recorded),
      ...METRICS.map((m) =>
        formatMetric(m)(metricValue(report.overall.producers[p], m))
      ),
    ])
  );
}

function metricPicker(metric: Metric): string {
  const buttons = METRICS.map(
    (m) =>
      `<button class="join-item btn btn-xs ${m === metric ? 'btn-active btn-primary' : ''}" data-metric="${m}" title="${escapeHtml(metricLongLabel(m))}">${metricLabel(m)}</button>`
  ).join('');
  return `<div class="flex items-center gap-2 flex-wrap"><span class="text-xs opacity-70">${t('report.metric')}</span><div class="join">${buttons}</div></div>`;
}

export class ReportView {
  /** Called when the reader picks another metric. */
  onMetric: ((metric: Metric) => void) | null = null;
  /** Called when a By route row or a breadcrumb is clicked. */
  onNavigate: ((focus: MapFocus) => void) | null = null;

  /**
   * `head` gets the trail and status, `body` the scores. `href` gives a
   * crumb's link, for clicks that open it elsewhere.
   */
  constructor(
    private head: HTMLElement,
    private body: HTMLElement,
    private href: (focus: MapFocus) => string
  ) {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>('[data-metric]');
      if (btn?.dataset.metric) {
        this.onMetric?.(btn.dataset.metric as Metric);
        return;
      }
      const crumb = target.closest<HTMLElement>('[data-nav]');
      if (crumb?.dataset.nav) {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) {
          return;
        }
        e.preventDefault();
        this.onNavigate?.(JSON.parse(crumb.dataset.nav) as MapFocus);
        return;
      }
      const row = target.closest<HTMLElement>('[data-route]');
      if (row?.dataset.route) {
        this.onNavigate?.({ type: 'route', route_id: row.dataset.route });
      }
    };
    head.addEventListener('click', onClick);
    body.addEventListener('click', onClick);
  }

  render(state: ReportViewState): void {
    const status = state.status
      ? `<p class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-xs"></span>${escapeHtml(state.status)}</p>`
      : '';
    this.head.innerHTML = `<div class="flex flex-col gap-2">${renderBreadcrumbTrail(trail(state), this.href)}${status}</div>`;

    const parts: string[] = [];
    const filter = state.filter;
    const r = state.report;
    if (r) {
      parts.push(
        `<p class="text-sm">${escapeHtml(
          t('report.summary', {
            trips: r.counts.trips.toLocaleString(),
            visits: r.counts.visitsScored.toLocaleString(),
            samples: r.counts.samples.toLocaleString(),
          })
        )}</p>`
      );
      if (r.counts.unresolvedPredictions) {
        parts.push(
          `<p class="text-xs text-warning">${escapeHtml(t('report.unresolved', { n: r.counts.unresolvedPredictions.toLocaleString() }))}</p>`
        );
      }
      if (state.gpsMissing) {
        parts.push(`<p class="text-xs opacity-70">${t('report.noGps')}</p>`);
      }
      if (r.counts.samples === 0) {
        parts.push(`<p class="text-sm">${t('report.noSamples')}</p>`);
      } else {
        const m = state.metric;
        const byTrip = filter.type === 'vehicle';
        const byRoute = filter.type !== 'route' && !byTrip;
        parts.push(
          section(t('report.overall'), overall(r)),
          metricPicker(m),
          section(
            t('report.chart', { metric: metricLongLabel(m) }),
            '<div id="horizon-chart" class="w-full"></div>'
          ),
          section(t('report.byHorizon'), breakdown(r.byHorizon, r, m)),
          byRoute
            ? section(
                t('report.byRoute'),
                breakdown(
                  r.byRoute,
                  r,
                  m,
                  (key) => routeLabel(key, state.feed),
                  (key) =>
                    key === '-'
                      ? ''
                      : `class="cursor-pointer hover" data-route="${escapeHtml(key)}"`
                )
              )
            : '',
          byTrip ? '' : section(t('report.byDate'), breakdown(r.byDate, r, m)),
          section(
            t('report.byHour', { zone: state.timeZone }),
            breakdown(r.byHour, r, m)
          ),
          `<p class="text-xs opacity-70">${t('report.method')}</p>`
        );
      }
    }
    this.body.innerHTML = `<div class="flex flex-col gap-4">${parts.join('')}</div>`;
    const chartEl = this.body.querySelector<HTMLElement>('#horizon-chart');
    if (r && chartEl) {
      renderHorizonChart(chartEl, r, state.metric, formatMetric(state.metric));
    }
  }
}
