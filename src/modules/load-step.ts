/**
 * The step after the shared load modal: a date range for an archive feed,
 * or a TIDES package upload for any other feed, plus optional actuals.
 */

import type { CacheInput } from 'gtfs-zone-web-common/gtfs/parse-cache';
import {
  ISO_DATE_CODEC,
  openCalendar,
  type CalendarDayInfo,
} from 'gtfs-zone-web-common/ui/calendar-input';
import { showModal } from 'gtfs-zone-web-common/ui/modal-utils';
import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { CONFIG } from '../config';
import { t } from '../i18n/messages';
import { datesInRange, spanDays, type ArchiveIndex } from './archive-index';

/** A schedule picked in the shared modal, loaded through the parse cache. */
export interface GtfsPick {
  input: CacheInput;
  label: string;
  /** The schedule URL without the proxy. */
  sourceUrl?: string;
}

/** What the shared modal closed with. */
export type FeedPick =
  | { kind: 'archive'; feed: string }
  | { kind: 'gtfs'; gtfs: GtfsPick }
  | { kind: 'package' };

export type LoadChoice =
  | {
      kind: 'archive';
      feed: string;
      from: string;
      to: string;
      actuals: File[] | null;
    }
  | {
      kind: 'upload';
      files: File[];
      /** Null takes the GTFS the package's meta names, if any. */
      gtfs: GtfsPick | null;
      actuals: File[] | null;
    };

/** What the dates open with: the last archive selection. */
export interface LoadDefaults {
  feed?: string;
  from?: string;
  to?: string;
}

/** Monday. */
const WEEK_START = 1;
/** Days recorded at least this share count as fully recorded. */
const FULL_COVERAGE = 0.9;
/** Underlines by coverage: solid for full days, faint for partial ones. */
const FULL_CLASS = 'border-b-3! border-b-success!';
const FULL_SWATCH = 'border-b-3 border-b-success';
const PARTIAL_CLASS = 'border-b-3! border-b-success/35!';
const PARTIAL_SWATCH = 'border-b-3 border-b-success/35';
/** Days in the chosen range, drawn as one band. */
const IN_RANGE_CLASS = 'bg-primary/20! rounded-none!';
const IN_RANGE_SWATCH = 'bg-primary/20';

export function sortedDates(index: ArchiveIndex, feed: string): string[] {
  return Object.keys(index.feeds[feed]?.dates ?? {}).sort();
}

function slot(title: string, body: string): string {
  return `
    <section class="rounded-lg border border-base-300 p-3 space-y-2">
      <h4 class="font-medium text-sm">${title}</h4>
      ${body}
    </section>`;
}

function dateField(id: string, label: string): string {
  return `
    <label class="flex items-center gap-2">
      <span class="text-xs w-10 shrink-0 opacity-70">${label}</span>
      <input id="${id}" type="text" class="input input-bordered input-sm w-36 font-mono tabular-nums" placeholder="YYYY-MM-DD" spellcheck="false" autocomplete="off" />
    </label>`;
}

function fileInput(id: string, label: string, accept: string) {
  return `
    <label class="form-control">
      <span class="label-text text-xs">${label}</span>
      <input id="${id}" type="file" class="file-input file-input-sm w-full" accept="${accept}" multiple />
    </label>`;
}

function stepTitle(pick: FeedPick): string {
  switch (pick.kind) {
    case 'archive':
      return escapeHtml(pick.feed);
    case 'gtfs':
      return escapeHtml(pick.gtfs.label);
    case 'package':
      return t('load.upload');
  }
}

/**
 * Opens the step for `pick`; resolves to the choice, 'back' to return to the
 * shared modal, or null when cancelled.
 */
export async function showLoadStep(
  pick: FeedPick,
  index: ArchiveIndex | null,
  defaults: LoadDefaults
): Promise<LoadChoice | 'back' | null> {
  let choice: LoadChoice | 'back' | null = null;
  let root: HTMLElement | null = null;
  const $ = <E extends HTMLElement>(id: string) =>
    root!.querySelector<E>(`#${id}`)!;
  const files = (id: string): File[] => [
    ...($<HTMLInputElement>(id).files ?? []),
  ];
  const feed = pick.kind === 'archive' ? pick.feed : '';
  const archived = index?.feeds[feed];
  const all = index ? sortedDates(index, feed) : [];

  const top =
    pick.kind === 'archive'
      ? slot(
          t('load.dates'),
          `<div class="flex flex-wrap gap-x-4 gap-y-2">
            ${dateField('load-from', t('load.from'))}
            ${dateField('load-to', t('load.to'))}
          </div>
          <p id="load-days" class="text-xs opacity-70"></p>`
        )
      : slot(
          t('load.packageTitle'),
          `${fileInput('load-package', t('load.package'), '.zip,.csv,.json')}
          <p class="text-xs opacity-70">${
            pick.kind === 'gtfs'
              ? escapeHtml(t('load.gtfsPicked', { label: pick.gtfs.label }))
              : t('load.gtfsFromMeta')
          }</p>`
        );

  const body = `
    <div class="flex flex-col gap-3" id="load-root">
      ${top}
      ${slot(
        t('load.actuals'),
        `${fileInput('load-actuals', t('load.actualsFiles'), '.zip,.csv,.json')}
        <p class="text-xs opacity-70">${t('load.actualsHint')}</p>`
      )}
      <p id="load-error" class="text-sm text-error empty:hidden"></p>
    </div>`;

  /** The count of archived days in the chosen range. */
  const syncDays = () => {
    if (!archived) {
      return;
    }
    $('load-days').textContent = t('load.days', {
      n: datesInRange(
        archived,
        $<HTMLInputElement>('load-from').value,
        $<HTMLInputElement>('load-to').value
      ).length,
      total: all.length,
      first: all[0] ?? '-',
      last: all[all.length - 1] ?? '-',
    });
  };

  /** Archive state of a day for the calendar. */
  const dayInfo = (date: string): CalendarDayInfo => {
    const day = archived?.dates[date];
    const from = $<HTMLInputElement>('load-from').value;
    const to = $<HTMLInputElement>('load-to').value;
    if (!day) {
      return { disabled: true, title: t('load.notRecorded') };
    }
    const classes = [
      day.coverage >= FULL_COVERAGE ? FULL_CLASS : PARTIAL_CLASS,
      date >= from && date <= to ? IN_RANGE_CLASS : '',
    ];
    return {
      className: classes.join(' '),
      title: t('load.dayInfo', {
        trips: day.trips.toLocaleString(),
        predictions: day.predictions.toLocaleString(),
        coverage: Math.round(day.coverage * 100),
      }),
    };
  };

  /** Open the calendar under a date input, with the feed's archive state. */
  const wireDate = (input: HTMLInputElement, isFrom: boolean) => {
    let close: (() => void) | null = null;
    const open = () => {
      if (close) {
        return;
      }
      close = openCalendar(input, {
        value: input.value,
        codec: ISO_DATE_CODEC,
        weekStart: WEEK_START,
        min: all[0],
        max: all[all.length - 1],
        dayInfo,
        legend: [
          { className: IN_RANGE_SWATCH, label: t('load.inRange') },
          { className: FULL_SWATCH, label: t('load.full') },
          { className: PARTIAL_SWATCH, label: t('load.partial') },
        ],
        onPick: (value) => {
          input.value = value;
          const other = $<HTMLInputElement>(isFrom ? 'load-to' : 'load-from');
          // Keep the range running forwards.
          if (isFrom ? other.value < value : other.value > value) {
            other.value = value;
          }
          syncDays();
        },
        onClose: () => {
          close = null;
        },
      });
    };
    input.addEventListener('focus', open);
    input.addEventListener('click', open);
    input.addEventListener('input', syncDays);
  };

  await showModal({
    title: stepTitle(pick),
    body,
    boxClassName: 'max-w-2xl',
    escapeAction: 2,
    enterAction: 0,
    onMount: () => {
      root = document.getElementById('load-root');
      if (pick.kind !== 'archive') {
        return;
      }
      const last = all[all.length - 1] ?? '';
      const keep = defaults.feed === feed && defaults.from && defaults.to;
      $<HTMLInputElement>('load-from').value = keep ? defaults.from! : last;
      $<HTMLInputElement>('load-to').value = keep ? defaults.to! : last;
      syncDays();
      wireDate($<HTMLInputElement>('load-from'), true);
      wireDate($<HTMLInputElement>('load-to'), false);
    },
    actions: [
      {
        label: t('load.submit'),
        className: 'btn-primary',
        onClick: () => {
          const error = $('load-error');
          const actualsFiles = files('load-actuals');
          const actuals = actualsFiles.length ? actualsFiles : null;
          if (pick.kind !== 'archive') {
            const pkg = files('load-package');
            if (!pkg.length) {
              error.textContent = t('load.pickPackage');
              return true;
            }
            choice = {
              kind: 'upload',
              files: pkg,
              gtfs: pick.kind === 'gtfs' ? pick.gtfs : null,
              actuals,
            };
            return false;
          }
          const from = $<HTMLInputElement>('load-from').value;
          const to = $<HTMLInputElement>('load-to').value;
          const span = spanDays(from, to);
          if (!(span >= 1 && span <= CONFIG.MAX_RANGE_DAYS)) {
            error.textContent = t('load.badRange', {
              max: CONFIG.MAX_RANGE_DAYS,
            });
            return true;
          }
          choice = { kind: 'archive', feed, from, to, actuals };
          return false;
        },
      },
      {
        label: t('load.back'),
        className: 'btn-ghost',
        onClick: () => {
          choice = 'back';
        },
      },
      { label: t('load.cancel'), className: 'btn-ghost', onClick: () => {} },
    ],
  });
  return choice;
}
