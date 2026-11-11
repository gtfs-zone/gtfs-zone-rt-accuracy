/**
 * The map's time slider: a range input over the loaded data's time span,
 * a play button, and the current time in the agency's zone.
 */

import { CONFIG } from '../config';
import { t } from '../i18n/messages';

const PLAY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

/** Markup for `mapControlsExtra`; hidden until data is loaded. */
export function renderTimeSlider(): string {
  return `
    <div id="time-slider" class="hidden flex-1 max-w-xl card card-bordered bg-base-100 shadow-lg px-3 py-2 pointer-events-auto">
      <div class="flex items-center gap-2">
        <button id="time-play" class="btn btn-ghost btn-xs btn-square" aria-label="${t('slider.play')}">${PLAY_ICON}</button>
        <input id="time-range" type="range" class="range range-xs range-primary flex-1" min="0" max="1" step="${CONFIG.SLIDER_STEP_S}" value="0" aria-label="${t('slider.time')}" />
      </div>
      <div class="flex justify-between text-xs opacity-70 mt-1">
        <span id="time-label"></span>
        <span id="time-vehicles"></span>
      </div>
      <div id="ghost-toggles" class="hidden"></div>
    </div>`;
}

export class TimeSlider {
  private root = document.getElementById('time-slider')!;
  private range = document.getElementById('time-range') as HTMLInputElement;
  private play = document.getElementById('time-play') as HTMLButtonElement;
  private label = document.getElementById('time-label')!;
  private vehicles = document.getElementById('time-vehicles')!;
  private timer: ReturnType<typeof setInterval> | null = null;
  private fmt = this.formatter('UTC');

  /** Called with the selected epoch second on every change. */
  onChange: ((t: number) => void) | null = null;

  constructor() {
    this.range.addEventListener('input', () => this.emit());
    this.play.addEventListener('click', () =>
      this.timer ? this.stop() : this.start()
    );
  }

  private formatter(timeZone: string): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  /** Show the slider over [start, end], starting at `start`. */
  setRange(start: number, end: number, timeZone: string): void {
    this.stop();
    this.fmt = this.formatter(timeZone);
    this.range.min = String(start);
    this.range.max = String(Math.max(start, end));
    this.range.value = String(start);
    this.root.classList.toggle('hidden', end <= start);
    this.emit();
  }

  hide(): void {
    this.stop();
    this.root.classList.add('hidden');
  }

  /** The selected epoch second. */
  get time(): number {
    return this.value();
  }

  /** Move to `t`, clamped to the range, and emit the change. */
  seek(t: number): void {
    const min = Number(this.range.min);
    const max = Number(this.range.max);
    this.range.value = String(Math.min(max, Math.max(min, t)));
    this.emit();
  }

  setVehicleCount(n: number): void {
    this.vehicles.textContent = t('slider.vehicles', { n });
  }

  private value(): number {
    return Number(this.range.value);
  }

  private emit(): void {
    const v = this.value();
    this.label.textContent = this.fmt.format(new Date(v * 1000));
    this.onChange?.(v);
  }

  private start(): void {
    if (this.value() >= Number(this.range.max)) {
      this.range.value = this.range.min;
    }
    this.play.innerHTML = PAUSE_ICON;
    this.play.setAttribute('aria-label', t('slider.pause'));
    this.timer = setInterval(() => {
      const next = this.value() + CONFIG.PLAY_STEP_S;
      this.range.value = String(next);
      this.emit();
      if (next >= Number(this.range.max)) {
        this.stop();
      }
    }, CONFIG.PLAY_TICK_MS);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.play.innerHTML = PLAY_ICON;
    this.play.setAttribute('aria-label', t('slider.play'));
  }
}
