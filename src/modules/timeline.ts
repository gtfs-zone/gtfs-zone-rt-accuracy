/**
 * The panel's timeline: play button and map time, a strip of the loaded days
 * tinted by how much of each was recorded, a histogram of vehicles on the
 * selected day with unrecorded stretches hatched, and the ghost toggles.
 * Dragging or clicking the histogram seeks the map time.
 */

import { SELECTED_ROW_CLASS } from 'gtfs-zone-web-common/ui/selectable-row';
import { escapeHtml } from 'gtfs-zone-web-common/util/escape-html';
import { CONFIG } from '../config';
import { t } from '../i18n/messages';
import type { TimelineDay } from '../metrics/timeline';
import { isBaseline, producerColor } from './producer-colors';

const PLAY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

/** Keyboard steps on the histogram, in seconds. */
const KEY_STEP_S = 5 * 60;
const KEY_STEP_LARGE_S = 3600;

function storedGhosts(): Set<string> {
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

function ring(color: string, dashed: boolean): string {
  return `<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="${color}" stroke-width="2"${dashed ? ' stroke-dasharray="3 2"' : ''}/></svg>`;
}

/** Chip tint for the share of a day that was recorded. */
function recordedTint(share: number): string {
  if (share >= 0.9) {
    return 'bg-success/40';
  }
  if (share >= 0.5) {
    return 'bg-success/25';
  }
  return share > 0 ? 'bg-warning/25' : '';
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

export interface TimelineData {
  days: TimelineDay[];
  zone: string;
  binS: number;
  /** The span the map time may move in. */
  start: number;
  end: number;
}

export class Timeline {
  private data: TimelineData | null = null;
  private producers: string[] = [];
  private ghostsOn = storedGhosts();
  private time = 0;
  private day = -1;
  private vehicles = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private dragging = false;
  private stamp = new Intl.DateTimeFormat();
  private clock = new Intl.DateTimeFormat();
  private dayName = new Intl.DateTimeFormat();

  /** Called with the map time on every change. */
  onChange: ((time: number) => void) | null = null;
  /** Called with the enabled ghost producers whenever one is toggled. */
  onGhosts: ((producers: string[]) => void) | null = null;

  constructor(private el: HTMLElement) {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-play]')) {
        if (this.timer) {
          this.stop();
        } else {
          this.start();
        }
        return;
      }
      const chip = target.closest<HTMLElement>('[data-day]');
      if (chip && this.data) {
        this.seekDay(Number(chip.dataset.day));
      }
    });
    el.addEventListener('change', (e) => {
      const box = e.target as HTMLInputElement;
      const producer = box.dataset.ghost;
      if (!producer) {
        return;
      }
      if (box.checked) {
        this.ghostsOn.add(producer);
      } else {
        this.ghostsOn.delete(producer);
      }
      try {
        localStorage.setItem(
          CONFIG.GHOSTS_KEY,
          JSON.stringify([...this.ghostsOn])
        );
      } catch {
        // The choice just won't persist.
      }
      this.onGhosts?.(this.enabledGhosts());
    });
    el.addEventListener('pointerdown', (e) => {
      const plot = (e.target as Element).closest<HTMLElement>('[data-plot]');
      if (!plot || e.button !== 0) {
        return;
      }
      this.dragging = true;
      plot.setPointerCapture(e.pointerId);
      this.seekAt(plot, e.clientX);
    });
    el.addEventListener('pointermove', (e) => {
      const plot = (e.target as Element).closest<HTMLElement>('[data-plot]');
      if (this.dragging && plot) {
        this.seekAt(plot, e.clientX);
      }
    });
    const endDrag = () => {
      this.dragging = false;
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('keydown', (e) => {
      if (!(e.target as Element).closest('[data-plot]')) {
        return;
      }
      const step = e.shiftKey ? KEY_STEP_LARGE_S : KEY_STEP_S;
      const delta =
        e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      if (delta) {
        e.preventDefault();
        this.seek(this.time + delta);
      }
    });
  }

  /** The map time, in epoch seconds. */
  get current(): number {
    return this.time;
  }

  /** The producers whose ghosts are on, in display order. */
  enabledGhosts(): string[] {
    return this.producers.filter((p) => this.ghostsOn.has(p));
  }

  /** Show `data`, starting at its first moment; null hides the timeline. */
  setData(data: TimelineData | null): void {
    this.stop();
    this.data = data;
    this.day = -1;
    if (!data || !data.days.length) {
      this.el.innerHTML = '';
      this.data = null;
      return;
    }
    const opts = { timeZone: data.zone };
    this.stamp = new Intl.DateTimeFormat(undefined, {
      ...opts,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    this.clock = new Intl.DateTimeFormat(undefined, {
      ...opts,
      hour: '2-digit',
      minute: '2-digit',
    });
    this.dayName = new Intl.DateTimeFormat(undefined, {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    this.seek(data.start);
  }

  /** Build a ghost toggle per producer. */
  setProducers(producers: string[]): void {
    this.producers = producers;
    this.draw();
  }

  setVehicleCount(n: number): void {
    this.vehicles = n;
    const label = this.el.querySelector('[data-vehicles]');
    if (label) {
      label.textContent = t('slider.vehicles', { n });
    }
  }

  /** Move to `time`, clamped to the data span, and emit the change. */
  seek(time: number): void {
    const data = this.data;
    if (!data) {
      return;
    }
    this.time = Math.min(data.end, Math.max(data.start, time));
    const day = data.days.findIndex(
      (d) => this.time >= d.start && this.time < d.end
    );
    const next = day < 0 ? data.days.length - 1 : day;
    if (next !== this.day) {
      this.day = next;
      this.draw();
    } else {
      this.placeCursor();
    }
    this.onChange?.(this.time);
  }

  /** Redraw, for a theme change. */
  redraw(): void {
    this.draw();
  }

  private seekDay(index: number): void {
    const data = this.data!;
    const from = data.days[this.day];
    const to = data.days[index];
    if (!to) {
      return;
    }
    // The same time of day, or the day's first recorded moment.
    const target = to.start + (this.time - from.start);
    this.seek(Math.max(target, to.start));
  }

  private seekAt(plot: HTMLElement, clientX: number): void {
    const day = this.data?.days[this.day];
    if (!day) {
      return;
    }
    const box = plot.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const raw = day.start + f * (day.end - day.start);
    const step = CONFIG.SLIDER_STEP_S;
    this.seek(Math.min(day.end - 1, Math.round(raw / step) * step));
  }

  private start(): void {
    const data = this.data;
    if (!data) {
      return;
    }
    if (this.time >= data.end) {
      this.seek(data.start);
    }
    this.timer = setInterval(() => {
      this.seek(this.time + CONFIG.PLAY_STEP_S);
      if (this.time >= data.end) {
        this.stop();
      }
    }, CONFIG.PLAY_TICK_MS);
    this.syncPlay();
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.syncPlay();
  }

  private syncPlay(): void {
    const btn = this.el.querySelector('[data-play]');
    if (!btn) {
      return;
    }
    btn.innerHTML = this.timer ? PAUSE_ICON : PLAY_ICON;
    btn.setAttribute(
      'aria-label',
      t(this.timer ? 'slider.pause' : 'slider.play')
    );
  }

  private placeCursor(): void {
    const day = this.data?.days[this.day];
    if (!day) {
      return;
    }
    const f = (this.time - day.start) / (day.end - day.start);
    const cursor = this.el.querySelector<HTMLElement>('[data-cursor]');
    if (cursor) {
      cursor.style.left = pct(Math.min(1, Math.max(0, f)));
    }
    const text = this.stamp.format(new Date(this.time * 1000));
    const label = this.el.querySelector('[data-time]');
    if (label) {
      label.textContent = text;
    }
    const plot = this.el.querySelector('[data-plot]');
    plot?.setAttribute('aria-valuenow', String(Math.round(this.time)));
    plot?.setAttribute('aria-valuetext', text);
  }

  private draw(): void {
    const data = this.data;
    const day = data?.days[this.day];
    if (!data || !day) {
      return;
    }
    const refocus = Boolean(document.activeElement?.closest('[data-plot]'));
    const length = day.end - day.start;
    const hhmm = (s: number) => this.clock.format(new Date(s * 1000));

    const chips =
      data.days.length > 1
        ? `<div class="flex flex-wrap gap-1">${data.days
            .map((d, i) => {
              const share = Math.round(d.recorded * 100);
              const name = this.dayName.format(new Date(`${d.date}T00:00:00Z`));
              const classes =
                i === this.day ? SELECTED_ROW_CLASS : recordedTint(d.recorded);
              return `<button type="button" class="btn btn-xs btn-ghost font-normal tabular-nums ${classes}" data-day="${i}" title="${escapeHtml(t('timeline.recorded', { date: d.date, share }))}"${i === this.day ? ' aria-current="date"' : ''}>${escapeHtml(name)}</button>`;
            })
            .join('')}</div>`
        : '';

    const max = Math.max(1, ...day.counts);
    const bins = day.counts.length;
    const bars = Array.from(day.counts, (n, i) => {
      if (!n) {
        return '';
      }
      const h = (n / max) * 100;
      const from = day.start + i * data.binS;
      return `<rect x="${i}" y="${100 - h}" width="0.85" height="${h}"><title>${escapeHtml(`${hhmm(from)}: ${t('slider.vehicles', { n })}`)}</title></rect>`;
    }).join('');
    const gaps = day.gaps
      .map(
        ([a, b]) =>
          `<div class="timeline-gap absolute inset-y-0" style="left:${pct((a - day.start) / length)};width:${pct((b - a) / length)}"></div>`
      )
      .join('');
    const ticks = [0, 6, 12, 18, 24]
      .map((h) => `<span>${String(h % 24).padStart(2, '0')}:00</span>`)
      .join('');
    const spoken = day.gaps
      .map(
        ([a, b]) =>
          `<li>${escapeHtml(
            t('report.gap', {
              from: hhmm(a),
              to: hhmm(b),
              minutes: Math.round((b - a) / 60),
            })
          )}</li>`
      )
      .join('');

    const recorded = this.producers.filter((p) => !isBaseline(p));
    const toggles = this.producers.length
      ? `<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span class="opacity-70">${t('slider.ghosts')}</span>
          ${this.producers
            .map(
              (
                p
              ) => `<label class="flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
                <input type="checkbox" class="toggle toggle-xs" data-ghost="${escapeHtml(p)}" ${this.ghostsOn.has(p) ? 'checked' : ''} />
                ${ring(producerColor(p, recorded), isBaseline(p))}${escapeHtml(p)}</label>`
            )
            .join('')}
        </div>`
      : '';

    this.el.innerHTML = `
      <section class="space-y-2" aria-label="${t('timeline.title')}">
        <div class="flex items-center gap-2 text-sm">
          <button type="button" class="btn btn-ghost btn-xs btn-square" data-play></button>
          <span class="tabular-nums" data-time></span>
          <span class="ml-auto text-xs opacity-70 tabular-nums" data-vehicles></span>
        </div>
        ${chips}
        <div>
          <div class="relative h-16 rounded bg-base-200 cursor-pointer touch-none select-none focus:outline-2 focus:outline-primary" data-plot role="slider" tabindex="0" aria-label="${t('slider.time')}" aria-valuemin="${Math.round(day.start)}" aria-valuemax="${Math.round(day.end)}">
            ${gaps}
            <svg class="absolute inset-0 w-full h-full text-base-content/60" viewBox="0 0 ${bins} 100" preserveAspectRatio="none" fill="currentColor" aria-hidden="true">${bars}</svg>
            <div class="absolute inset-y-0 w-0.5 -ml-px bg-primary pointer-events-none" data-cursor></div>
          </div>
          <div class="flex justify-between text-[10px] opacity-60 tabular-nums mt-0.5">${ticks}</div>
        </div>
        ${spoken ? `<ul class="sr-only">${spoken}</ul>` : ''}
        ${toggles}
      </section>`;
    this.syncPlay();
    this.setVehicleCount(this.vehicles);
    this.placeCursor();
    if (refocus) {
      this.el.querySelector<HTMLElement>('[data-plot]')?.focus();
    }
  }
}
