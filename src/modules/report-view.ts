/** The panel: what was loaded, recording coverage, and the scores. */

import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { t } from '../i18n/messages';
import type { GroupStats, Report } from '../metrics/score';
import type { PackageMeta } from '../worker/protocol';
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

/** Recording gaps shorter than this are not listed, in seconds. */
const GAP_MIN_S = 120;

export interface ReportViewState {
  label: string;
  metas: PackageMeta[];
  timeZone: string;
  /** Set while loading or scoring. */
  status: string | null;
  report: Report | null;
  gpsMissing: boolean;
  metric: Metric;
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

function table(head: string[], rows: string[][]): string {
  const th = head.map((h) => `<th>${h}</th>`).join('');
  const tr = rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td class="${i ? 'text-right tabular-nums' : ''}">${c}</td>`).join('')}</tr>`
    )
    .join('');
  return `<div class="overflow-x-auto"><table class="table table-xs"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/** Producers as columns, one row per group, showing `metric`. */
function breakdown(groups: GroupStats[], report: Report, metric: Metric) {
  const recorded = report.producers.filter((p) => !isBaseline(p));
  const fmt = formatMetric(metric);
  return table(
    ['', ...report.producers.map((p) => swatch(p, recorded))],
    groups.map((g) => [
      escapeHtml(g.key),
      ...report.producers.map((p) => fmt(metricValue(g.producers[p], metric))),
    ])
  );
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

function coverage(metas: PackageMeta[], timeZone: string): string {
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const fmt = (iso: string) => time.format(new Date(iso));
  const lines: string[] = [];
  for (const meta of metas) {
    const spans = meta.coverage;
    if (!spans.length) {
      continue;
    }
    lines.push(
      `<li>${escapeHtml(
        t('report.recorded', {
          date: meta.name,
          from: fmt(spans[0].start),
          to: fmt(spans[spans.length - 1].end),
        })
      )}</li>`
    );
    for (let i = 1; i < spans.length; i++) {
      const gap =
        (Date.parse(spans[i].start) - Date.parse(spans[i - 1].end)) / 1000;
      if (gap >= GAP_MIN_S) {
        lines.push(
          `<li class="pl-4 text-warning">${escapeHtml(
            t('report.gap', {
              from: fmt(spans[i - 1].end),
              to: fmt(spans[i].start),
              minutes: Math.round(gap / 60),
            })
          )}</li>`
        );
      }
    }
  }
  return lines.length
    ? `<ul class="text-xs space-y-0.5">${lines.join('')}</ul>`
    : `<p class="text-xs opacity-70">${t('report.noGaps')}</p>`;
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

  constructor(private el: HTMLElement) {
    el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(
        '[data-metric]'
      );
      if (btn?.dataset.metric) {
        this.onMetric?.(btn.dataset.metric as Metric);
      }
    });
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
        section(t('report.coverage'), coverage(state.metas, state.timeZone))
      );
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
        parts.push(
          section(t('report.overall'), overall(r)),
          metricPicker(m),
          section(
            t('report.chart', { metric: metricLongLabel(m) }),
            '<div id="horizon-chart" class="w-full"></div>'
          ),
          section(t('report.byHorizon'), breakdown(r.byHorizon, r, m)),
          section(t('report.byRoute'), breakdown(r.byRoute, r, m)),
          section(t('report.byDate'), breakdown(r.byDate, r, m)),
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
  }
}
