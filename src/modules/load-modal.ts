/**
 * The load dialog: a feed and date range from the archive, or an uploaded
 * package, either one optionally scored against uploaded actuals.
 */

import { showModal } from 'gtfs-zone-web-common/ui/modal-utils';
import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { CONFIG } from '../config';
import { t } from '../i18n/messages';
import { spanDays, type ArchiveIndex } from './archive-index';

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

function sortedDates(index: ArchiveIndex, feed: string): string[] {
  return Object.keys(index.feeds[feed]?.dates ?? {}).sort();
}

function archiveSection(index: ArchiveIndex | null, error: string | null) {
  if (!index) {
    return `<p class="text-sm text-error">${escapeHtml(error ?? '')}</p>`;
  }
  const options = Object.keys(index.feeds)
    .sort()
    .map(
      (f) =>
        `<option value="${escapeHtml(f)}">${escapeHtml(f)} (${escapeHtml(index.feeds[f].producer)})</option>`
    )
    .join('');
  return `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <label class="form-control">
        <span class="label-text text-xs">${t('load.feed')}</span>
        <select id="load-feed" class="select select-sm w-full">${options}</select>
      </label>
      <label class="form-control">
        <span class="label-text text-xs">${t('load.from')}</span>
        <input id="load-from" type="date" class="input input-sm w-full" />
      </label>
      <label class="form-control">
        <span class="label-text text-xs">${t('load.to')}</span>
        <input id="load-to" type="date" class="input input-sm w-full" />
      </label>
    </div>
    <p id="load-days" class="text-xs opacity-70 mt-1"></p>`;
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
    <div class="flex flex-col gap-4" id="load-root">
      <div role="tablist" class="tabs tabs-box tabs-sm">
        <button role="tab" class="tab tab-active" data-load-tab="archive">${t('load.archive')}</button>
        <button role="tab" class="tab" data-load-tab="upload">${t('load.upload')}</button>
      </div>
      <section data-load-pane="archive">${archiveSection(index, indexError)}</section>
      <section data-load-pane="upload" class="hidden flex flex-col gap-2">
        ${fileInput('load-package', t('load.package'), true, '.zip,.csv,.json')}
        ${fileInput('load-gtfs', t('load.gtfs'), false, '.zip')}
      </section>
      <section class="flex flex-col gap-1">
        ${fileInput('load-actuals', t('load.actuals'), true, '.zip,.csv,.json')}
        <p class="text-xs opacity-70">${t('load.actualsHint')}</p>
      </section>
      <p id="load-error" class="text-sm text-error"></p>
    </div>`;

  let tab: 'archive' | 'upload' = index ? 'archive' : 'upload';

  const syncDays = () => {
    if (!index) {
      return;
    }
    const feed = $<HTMLSelectElement>('load-feed').value;
    const dates = sortedDates(index, feed);
    const from = $<HTMLInputElement>('load-from');
    const to = $<HTMLInputElement>('load-to');
    for (const input of [from, to]) {
      input.min = dates[0] ?? '';
      input.max = dates[dates.length - 1] ?? '';
    }
    $('load-days').textContent = dates.length
      ? t('load.days', {
          n: dates.length,
          first: dates[0],
          last: dates[dates.length - 1],
        })
      : '';
  };

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

  await showModal({
    title: t('load.title'),
    body,
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
      const feedSelect = $<HTMLSelectElement>('load-feed');
      if (defaults.feed && index.feeds[defaults.feed]) {
        feedSelect.value = defaults.feed;
      }
      const setDefaultDates = () => {
        const dates = sortedDates(index, feedSelect.value);
        const last = dates[dates.length - 1] ?? '';
        $<HTMLInputElement>('load-from').value = last;
        $<HTMLInputElement>('load-to').value = last;
      };
      setDefaultDates();
      if (defaults.feed === feedSelect.value && defaults.from && defaults.to) {
        $<HTMLInputElement>('load-from').value = defaults.from;
        $<HTMLInputElement>('load-to').value = defaults.to;
      }
      feedSelect.addEventListener('change', () => {
        setDefaultDates();
        syncDays();
      });
      syncDays();
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
          if (!index) {
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
          choice = {
            kind: 'archive',
            feed: $<HTMLSelectElement>('load-feed').value,
            from,
            to,
            actuals,
          };
          return false;
        },
      },
    ],
  });
  return choice;
}
