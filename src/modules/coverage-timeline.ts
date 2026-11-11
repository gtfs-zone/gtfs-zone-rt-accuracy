/**
 * Recording coverage as a timeline: one row per package, 00:00 to 24:00 in
 * the agency zone (longer when a span runs past midnight). Recorded spans
 * are bars, gaps of GAP_MIN_S or more are tinted, and a marker shows the
 * slider time. A visually hidden list repeats the gaps for screen readers.
 */

import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { t } from '../i18n/messages';
import type { PackageMeta } from '../worker/protocol';

/** Recording gaps shorter than this are not shown, in seconds. */
const GAP_MIN_S = 120;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Offset of `zone` from UTC at `ms`, in ms. */
function zoneOffset(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const n = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const local = Date.UTC(
    n('year'),
    n('month') - 1,
    n('day'),
    n('hour'),
    n('minute'),
    n('second')
  );
  return local - Math.floor(ms / 1000) * 1000;
}

/** Epoch seconds of local midnight starting `y-m-d` in `zone`. */
function midnight(y: number, m: number, d: number, zone: string): number {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffset(guess, zone);
  return (guess - zoneOffset(first, zone)) / 1000;
}

/** Local midnight of the package's day: its name when a date, else its first span. */
function rowStart(meta: PackageMeta, zone: string): number {
  const named = DATE.exec(meta.name);
  if (named) {
    return midnight(+named[1], +named[2], +named[3], zone);
  }
  const first = Date.parse(meta.coverage[0].start);
  const local = new Date(first + zoneOffset(first, zone));
  return midnight(
    local.getUTCFullYear(),
    local.getUTCMonth() + 1,
    local.getUTCDate(),
    zone
  );
}

interface Row {
  label: string;
  start: number;
  spans: [number, number][];
  gaps: [number, number][];
}

function rows(metas: PackageMeta[], zone: string): Row[] {
  return metas
    .filter((m) => m.coverage.length)
    .map((meta) => {
      const spans = meta.coverage.map(
        (c) =>
          [Date.parse(c.start) / 1000, Date.parse(c.end) / 1000] as [
            number,
            number,
          ]
      );
      const gaps: [number, number][] = [];
      for (let i = 1; i < spans.length; i++) {
        if (spans[i][0] - spans[i - 1][1] >= GAP_MIN_S) {
          gaps.push([spans[i - 1][1], spans[i][0]]);
        }
      }
      return { label: meta.name, start: rowStart(meta, zone), spans, gaps };
    });
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

/** The timeline markup, or a note when nothing was recorded. */
export function coverageTimeline(metas: PackageMeta[], zone: string): string {
  const list = rows(metas, zone);
  if (!list.length) {
    return `<p class="text-xs opacity-70">${t('report.noGaps')}</p>`;
  }
  const hours = Math.max(
    24,
    ...list.map((r) =>
      Math.ceil((Math.max(...r.spans.map((s) => s[1])) - r.start) / 3600)
    )
  );
  const length = hours * 3600;
  const clock = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  });
  const hhmm = (s: number) => clock.format(new Date(s * 1000));
  const x = (r: Row, s: number) => pct((s - r.start) / length);
  const w = (a: number, b: number) => pct(Math.max(0, b - a) / length);

  const gapText = (a: number, b: number) =>
    t('report.gap', {
      from: hhmm(a),
      to: hhmm(b),
      minutes: Math.round((b - a) / 60),
    });

  const body = list
    .map((r) => {
      const bars = r.spans
        .map(
          ([a, b]) =>
            `<rect class="cursor-pointer" data-seek x="${x(r, a)}" y="3" width="${w(a, b)}" height="10" rx="1" fill="var(--color-base-content)" fill-opacity="0.55"><title>${escapeHtml(`${hhmm(a)} - ${hhmm(b)}`)}</title></rect>`
        )
        .join('');
      const gaps = r.gaps
        .map(
          ([a, b]) =>
            `<rect x="${x(r, a)}" y="1" width="${w(a, b)}" height="14" fill="var(--color-warning)" fill-opacity="0.6"><title>${escapeHtml(gapText(a, b))}</title></rect>`
        )
        .join('');
      return `<span class="text-xs tabular-nums whitespace-nowrap">${escapeHtml(r.label)}</span>
        <svg class="w-full h-4 overflow-visible" data-row-start="${r.start}" data-row-length="${length}" aria-hidden="true">
          <rect x="0" y="7" width="100%" height="2" fill="var(--color-base-content)" fill-opacity="0.1"/>
          ${bars}${gaps}
          <line data-marker x1="0" x2="0" y1="0" y2="16" stroke="var(--color-primary)" stroke-width="2" visibility="hidden"/>
        </svg>`;
    })
    .join('');

  const ticks = Array.from({ length: Math.floor(hours / 6) + 1 }, (_, i) => {
    const h = i * 6;
    const anchor = h === 0 ? 'start' : h === hours ? 'end' : 'middle';
    return `<text x="${pct(h / hours)}" y="10" text-anchor="${anchor}" font-size="10" fill="var(--color-base-content)" fill-opacity="0.6">${String(h % 24).padStart(2, '0')}:00</text>`;
  }).join('');

  const spoken = list
    .flatMap((r) => [
      t('report.recorded', {
        date: r.label,
        from: hhmm(r.spans[0][0]),
        to: hhmm(r.spans[r.spans.length - 1][1]),
      }),
      ...r.gaps.map(([a, b]) => gapText(a, b)),
    ])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('');

  return `<div class="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1" data-coverage-timeline>
      ${body}
      <span></span><svg class="w-full h-3 overflow-visible" aria-hidden="true">${ticks}</svg>
    </div>
    <ul class="sr-only">${spoken}</ul>`;
}

/** Move each row's marker to `time`; hidden on rows that do not cover it. */
export function placeTimelineMarker(root: HTMLElement, time: number): void {
  for (const svg of root.querySelectorAll<SVGSVGElement>('[data-row-start]')) {
    const start = Number(svg.dataset.rowStart);
    const length = Number(svg.dataset.rowLength);
    const marker = svg.querySelector('[data-marker]');
    const f = (time - start) / length;
    if (!marker) {
      continue;
    }
    const inside = f >= 0 && f <= 1;
    marker.setAttribute('visibility', inside ? 'visible' : 'hidden');
    marker.setAttribute('x1', pct(f));
    marker.setAttribute('x2', pct(f));
  }
}

/** The time under a click on a recorded bar, or null. */
export function timelineClickTime(e: MouseEvent): number | null {
  const bar = (e.target as Element).closest('[data-seek]');
  const svg = bar?.closest<SVGSVGElement>('[data-row-start]');
  if (!bar || !svg) {
    return null;
  }
  const box = svg.getBoundingClientRect();
  const f = (e.clientX - box.left) / box.width;
  return Number(svg.dataset.rowStart) + f * Number(svg.dataset.rowLength);
}
