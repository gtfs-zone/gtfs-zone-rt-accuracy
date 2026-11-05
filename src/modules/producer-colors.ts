/**
 * Producer colors. Recorded producers take categorical slots 1-3 in name
 * order; each baseline has its own fixed slot, so a baseline keeps its color
 * whatever was loaded. Validated light and dark steps (dataviz reference
 * palette).
 */

const LIGHT = ['#2a78d6', '#eb6834', '#1baf7a'];
const DARK = ['#3987e5', '#d95926', '#199e70'];
const BASELINE_LIGHT: Record<string, string> = {
  schedule: '#eda100',
  'last-stop': '#e87ba4',
  gps: '#6250d6',
};
const BASELINE_DARK: Record<string, string> = {
  schedule: '#c98500',
  'last-stop': '#d55181',
  gps: '#9085e9',
};
const OTHER = '#8a8984';

export function isDark(): boolean {
  return document.documentElement.dataset.theme === 'dark';
}

export function isBaseline(producer: string): boolean {
  return producer in BASELINE_LIGHT;
}

/** Color of `producer`, given the recorded producers in display order. */
export function producerColor(producer: string, recorded: string[]): string {
  const dark = isDark();
  if (isBaseline(producer)) {
    return (dark ? BASELINE_DARK : BASELINE_LIGHT)[producer];
  }
  const i = recorded.indexOf(producer);
  return (dark ? DARK : LIGHT)[i] ?? OTHER;
}
