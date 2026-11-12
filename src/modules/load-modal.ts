/**
 * The load dialog: a feed and date range from the archive, or an uploaded
 * package, either one optionally scored against uploaded actuals.
 */

import {
  ISO_DATE_CODEC,
  openCalendar,
  type CalendarDayInfo,
} from 'gtfs-zone-web-common/ui/calendar-input';
import { showModal } from 'gtfs-zone-web-common/ui/modal-utils';
import { SELECTED_ROW_CLASS } from 'gtfs-zone-web-common/ui/selectable-row';
import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { CONFIG } from '../config';
import { t } from '../i18n/messages';
import { datesInRange, spanDays, type ArchiveIndex } from './archive-index';

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
      gtfs: File | null;
      actuals: File[] | null;
    };

/** What the dialog opens with: the last archive selection. */
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

function sortedDates(index: ArchiveIndex, feed: string): string[] {
  return Object.keys(index.feeds[feed]?.dates ?? {}).sort();
}

function slot(title: string, body: string, extra = ''): string {
  return `
    <section class="shrink-0 rounded-lg border border-base-300 p-3 space-y-2" ${extra}>
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

function archivePane(index: ArchiveIndex | null, error: string | null) {
  if (!index) {
    return `<p class="text-sm text-error">${escapeHtml(error ?? '')}</p>`;
  }
  return `
    <input type="text" id="load-search" class="input input-bordered input-sm w-full shrink-0" placeholder="${escapeHtml(t('load.search'))}" spellcheck="false" autocomplete="off" />
    <div id="load-feeds" class="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden"></div>
    ${slot(
      t('load.dates'),
      `<div class="flex flex-wrap gap-x-4 gap-y-2">
        ${dateField('load-from', t('load.from'))}
        ${dateField('load-to', t('load.to'))}
      </div>
      <p id="load-days" class="text-xs opacity-70"></p>`
    )}`;
}

function fileInput(
  id: string,
  label: string,
  multiple: boolean,
  accept: string
) {
  return `
    <label class="form-control">
      <span class="label-text text-xs">${label}</span>
      <input id="${id}" type="file" class="file-input file-input-sm w-full" accept="${accept}" ${multiple ? 'multiple' : ''} />
    </label>`;
}

/** Opens the dialog; resolves to the choice, or null when cancelled. */
export async function showLoadModal(
  index: ArchiveIndex | null,
  indexError: string | null,
  defaults: LoadDefaults
): Promise<LoadChoice | null> {
  let choice: LoadChoice | null = null;
  let root: HTMLElement | null = null;
  const $ = <E extends HTMLElement>(id: string) =>
    root!.querySelector<E>(`#${id}`)!;
  const files = (id: string): File[] => [
    ...($<HTMLInputElement>(id).files ?? []),
  ];

  const body = `
    <div class="flex h-full min-h-0 flex-col gap-3" id="load-root">
      <div role="tablist" class="tabs tabs-box tabs-sm shrink-0">
        <button role="tab" class="tab tab-active" data-load-tab="archive">${t('load.archive')}</button>
        <button role="tab" class="tab" data-load-tab="upload">${t('load.upload')}</button>
      </div>
      <div data-load-pane="archive" class="flex min-h-0 flex-1 flex-col gap-3">${archivePane(index, indexError)}</div>
      <div data-load-pane="upload" class="hidden min-h-0 flex-1">
        ${slot(
          t('load.upload'),
          `${fileInput('load-package', t('load.package'), true, '.zip,.csv,.json')}
          ${fileInput('load-gtfs', t('load.gtfs'), false, '.zip')}`
        )}
      </div>
      ${slot(
        t('load.actuals'),
        `${fileInput('load-actuals', t('load.actualsFiles'), true, '.zip,.csv,.json')}
        <p class="text-xs opacity-70">${t('load.actualsHint')}</p>`
      )}
      <p id="load-error" class="text-sm text-error shrink-0 empty:hidden"></p>
    </div>`;

  let tab: 'archive' | 'upload' = index ? 'archive' : 'upload';
  let feed = '';

  const showTab = (next: 'archive' | 'upload') => {
    tab = next;
    root!
      .querySelectorAll<HTMLElement>('[data-load-tab]')
      .forEach((el) =>
        el.classList.toggle('tab-active', el.dataset.loadTab === next)
      );
    root!
      .querySelectorAll<HTMLElement>('[data-load-pane]')
      .forEach((el) =>
        el.classList.toggle('hidden', el.dataset.loadPane !== next)
      );
  };

  /** The feed rows matching the search, the selected one highlighted. */
  const renderFeeds = () => {
    if (!index) {
      return;
    }
    const query = $<HTMLInputElement>('load-search').value.trim().toLowerCase();
    const rows = Object.keys(index.feeds)
      .sort()
      .filter(
        (f) =>
          !query ||
          f.toLowerCase().includes(query) ||
          index.feeds[f].producer.toLowerCase().includes(query)
      )
      .map((f) => {
        const dates = sortedDates(index, f);
        const classes = f === feed ? SELECTED_ROW_CLASS : 'hover:bg-base-200';
        const subtitle = t('load.feedDays', {
          producer: index.feeds[f].producer,
          n: dates.length,
          last: dates[dates.length - 1] ?? '-',
        });
        return `
          <button type="button" class="w-full text-left px-3 py-2 rounded-lg ${classes}" data-feed="${escapeHtml(f)}"${f === feed ? ' aria-current="true"' : ''}>
            <p class="text-sm font-medium truncate">${escapeHtml(f)}</p>
            <p class="text-xs opacity-60 truncate">${escapeHtml(subtitle)}</p>
          </button>`;
      });
    $('load-feeds').innerHTML = rows.length
      ? rows.join('')
      : `<p class="text-sm opacity-40 text-center py-8">${t('load.noFeeds')}</p>`;
  };

  /** The count of archived days in the chosen range. */
  const syncDays = () => {
    if (!index) {
      return;
    }
    const from = $<HTMLInputElement>('load-from').value;
    const to = $<HTMLInputElement>('load-to').value;
    const archived = index.feeds[feed];
    const all = sortedDates(index, feed);
    $('load-days').textContent = archived
      ? t('load.days', {
          n: datesInRange(archived, from, to).length,
          total: all.length,
          first: all[0] ?? '-',
          last: all[all.length - 1] ?? '-',
        })
      : '';
  };

  const pickFeed = (next: string) => {
    feed = next;
    const dates = sortedDates(index!, feed);
    const last = dates[dates.length - 1] ?? '';
    $<HTMLInputElement>('load-from').value = last;
    $<HTMLInputElement>('load-to').value = last;
    renderFeeds();
    syncDays();
  };

  /** Archive state of a day for the calendar. */
  const dayInfo = (date: string): CalendarDayInfo => {
    const day = index?.feeds[feed]?.dates[date];
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
      if (close || !index) {
        return;
      }
      const dates = sortedDates(index, feed);
      close = openCalendar(input, {
        value: input.value,
        codec: ISO_DATE_CODEC,
        weekStart: WEEK_START,
        min: dates[0],
        max: dates[dates.length - 1],
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
    title: t('load.title'),
    body,
    boxClassName: 'h-[80vh] max-w-2xl',
    escapeAction: 0,
    enterAction: 1,
    onMount: () => {
      root = document.getElementById('load-root');
      root!
        .querySelectorAll<HTMLElement>('[data-load-tab]')
        .forEach((el) =>
          el.addEventListener('click', () =>
            showTab(el.dataset.loadTab as 'archive' | 'upload')
          )
        );
      showTab(tab);
      if (!index) {
        return;
      }
      const feeds = Object.keys(index.feeds).sort();
      pickFeed(
        defaults.feed && index.feeds[defaults.feed]
          ? defaults.feed
          : (feeds[0] ?? '')
      );
      if (defaults.feed === feed && defaults.from && defaults.to) {
        $<HTMLInputElement>('load-from').value = defaults.from;
        $<HTMLInputElement>('load-to').value = defaults.to;
        syncDays();
      }
      $('load-search').addEventListener('input', renderFeeds);
      $('load-feeds').addEventListener('click', (e) => {
        const row = (e.target as Element).closest<HTMLElement>('[data-feed]');
        if (row?.dataset.feed) {
          pickFeed(row.dataset.feed);
        }
      });
      wireDate($<HTMLInputElement>('load-from'), true);
      wireDate($<HTMLInputElement>('load-to'), false);
      $<HTMLElement>('load-feeds')
        .querySelector<HTMLElement>('[aria-current]')
        ?.scrollIntoView({ block: 'nearest' });
    },
    actions: [
      { label: t('load.cancel'), className: 'btn-ghost', onClick: () => {} },
      {
        label: t('load.submit'),
        className: 'btn-primary',
        onClick: () => {
          const error = $('load-error');
          const actualsFiles = files('load-actuals');
          const actuals = actualsFiles.length ? actualsFiles : null;
          if (tab === 'upload') {
            const pkg = files('load-package');
            if (!pkg.length) {
              error.textContent = t('load.pickPackage');
              return true;
            }
            choice = {
              kind: 'upload',
              files: pkg,
              gtfs: files('load-gtfs')[0] ?? null,
              actuals,
            };
            return false;
          }
          if (!index || !feed) {
            error.textContent = t('load.pickPackage');
            return true;
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
    ],
  });
  return choice;
}
