/** The panel: what was loaded, recording coverage, and the scores. */

import type { GTFSScheduled } from 'gtfs-zone-web-common/gtfs/scheduled';
import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { t } from '../i18n/messages';
import type { MapFocus } from '../map-controller';
import type { GroupStats, Report } from '../metrics/score';
import type { PackageMeta } from '../worker/protocol';
import {
  coverageTimeline,
  placeTimelineMarker,
  timelineClickTime,
} from './coverage-timeline';
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
  metas: PackageMeta[];
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
  const tag = dashed
    ? ` <span class="opacity-60">(${t('report.baseline')})</span>`
    : '';
  return `<span class="inline-flex items-center gap-1 whitespace-nowrap"><svg width="16" height="10" aria-hidden="true">${line}</svg>${escapeHtml(producer)}${tag}</span>`;
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

function filterText(filter: MapFocus, feed: GTFSScheduled | null): string {
  switch (filter.type) {
    case 'route': {
      const r = feed?.routes.get(filter.route_id);
      return t('filter.route', {
        name: r?.short_name || r?.long_name || filter.route_id,
      });
    }
    case 'stop':
      return t('filter.stop', {
        name: feed?.stops.get(filter.stop_id)?.name || filter.stop_id,
      });
    case 'vehicle':
      return filter.tripKey
        ? t('filter.vehicleTrip', {
            vehicle: filter.key,
            trip: filter.tripKey.slice(filter.tripKey.indexOf('|') + 1),
          })
        : t('filter.vehicle', { vehicle: filter.key });
    default:
      return '';
  }
}

function filterChip(filter: MapFocus, feed: GTFSScheduled | null): string {
  return `<div class="flex items-center gap-2"><span class="badge badge-primary badge-outline gap-1 h-auto py-0.5">${escapeHtml(filterText(filter, feed))}<button class="btn btn-ghost btn-xs btn-circle -mr-2" data-clear-filter aria-label="${t('filter.clear')}" title="${t('filter.clear')}"><svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></div>`;
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
  /** Called when a By route row is clicked. */
  onRoute: ((routeId: string) => void) | null = null;
  /** Called when the filter chip is cleared. */
  onClearFilter: (() => void) | null = null;
  /** Called with the time under a click on the coverage timeline. */
  onSeek: ((time: number) => void) | null = null;
  private time: number | null = null;

  constructor(private el: HTMLElement) {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest<HTMLElement>('[data-metric]');
      if (btn?.dataset.metric) {
        this.onMetric?.(btn.dataset.metric as Metric);
        return;
      }
      if (target.closest('[data-clear-filter]')) {
        this.onClearFilter?.();
        return;
      }
      const row = target.closest<HTMLElement>('[data-route]');
      if (row?.dataset.route) {
        this.onRoute?.(row.dataset.route);
        return;
      }
      const time = timelineClickTime(e);
      if (time !== null) {
        this.onSeek?.(time);
      }
    });
  }

  /** Move the coverage timeline's marker to the slider time. */
  setTime(time: number | null): void {
    this.time = time;
    if (time !== null) {
      placeTimelineMarker(this.el, time);
    }
  }

  render(state: ReportViewState): void {
    const parts: string[] = [
      `<h2 class="text-lg font-semibold">${escapeHtml(state.label)}</h2>`,
    ];
    if (state.status) {
      parts.push(
        `<p class="flex items-center gap-2 text-sm"><span class="loading loading-spinner loading-xs"></span>${escapeHtml(state.status)}</p>`
      );
    }
    if (state.metas.length) {
      parts.push(
        section(
          t('report.coverage'),
          coverageTimeline(state.metas, state.timeZone)
        )
      );
    }
    const filter = state.filter;
    if (filter.type !== 'home') {
      parts.push(filterChip(filter, state.feed));
    }
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
    this.el.innerHTML = `<div class="flex flex-col gap-4">${parts.join('')}</div>`;
    const chartEl = this.el.querySelector<HTMLElement>('#horizon-chart');
    if (r && chartEl) {
      renderHorizonChart(chartEl, r, state.metric, formatMetric(state.metric));
    }
    this.setTime(this.time);
  }
}
