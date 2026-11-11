/**
 * One checkbox per producer in the time slider card, turning its ghost
 * vehicles on or off. The choice is kept per device; all are off by default.
 */

import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { CONFIG } from '../config';
import { t } from '../i18n/messages';
import { isBaseline, producerColor } from './producer-colors';

function stored(): Set<string> {
  try {
    const raw = localStorage.getItem(CONFIG.GHOSTS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(list)
        ? list.filter((v): v is string => typeof v === 'string')
        : []
    );
  } catch {
    return new Set();
  }
}

function swatch(color: string, dashed: boolean): string {
  return `<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="${color}" stroke-width="2"${dashed ? ' stroke-dasharray="3 2"' : ''}/></svg>`;
}

export class GhostToggles {
  private root = document.getElementById('ghost-toggles')!;
  private on = stored();
  private producers: string[] = [];

  /** Called with the enabled producers whenever one is toggled. */
  onChange: ((producers: string[]) => void) | null = null;

  constructor() {
    this.root.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      const producer = box.dataset.ghost;
      if (!producer) {
        return;
      }
      if (box.checked) {
        this.on.add(producer);
      } else {
        this.on.delete(producer);
      }
      try {
        localStorage.setItem(CONFIG.GHOSTS_KEY, JSON.stringify([...this.on]));
      } catch {
        // The choice just won't persist.
      }
      this.onChange?.(this.enabled());
    });
  }

  /** The producers whose ghosts are on, in display order. */
  enabled(): string[] {
    return this.producers.filter((p) => this.on.has(p));
  }

  /** Build a toggle per producer; an empty list hides the row. */
  render(producers: string[]): void {
    this.producers = producers;
    const recorded = producers.filter((p) => !isBaseline(p));
    const boxes = producers
      .map((p) => {
        const color = producerColor(p, recorded);
        return `<label class="flex items-center gap-1 cursor-pointer whitespace-nowrap">
          <input type="checkbox" class="checkbox checkbox-xs" data-ghost="${escapeHtml(p)}" ${this.on.has(p) ? 'checked' : ''} />
          ${swatch(color, isBaseline(p))}${escapeHtml(p)}</label>`;
      })
      .join('');
    this.root.innerHTML = `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-1 pt-1 border-t border-base-content/10"><span class="opacity-70">${t('slider.ghosts')}</span>${boxes}</div>`;
    this.root.classList.toggle('hidden', producers.length === 0);
  }
}
