/**
 * One line per producer of the selected metric by horizon bucket. Baselines
 * are dashed, so identity does not rest on color alone; uPlot's live legend
 * is the hover readout.
 */

import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Report } from '../metrics/score';
import { isBaseline, producerColor } from './producer-colors';
import { metricValue, type Metric } from './metrics-format';

let chart: uPlot | null = null;

function ink(): { axis: string; grid: string } {
  const style = getComputedStyle(document.documentElement);
  const text = style.getPropertyValue('--color-base-content').trim() || '#888';
  return {
    axis: `color-mix(in oklab, ${text} 70%, transparent)`,
    grid: `color-mix(in oklab, ${text} 12%, transparent)`,
  };
}

export function renderHorizonChart(
  el: HTMLElement,
  report: Report,
  metric: Metric,
  format: (v: number | null) => string
): void {
  chart?.destroy();
  chart = null;
  el.replaceChildren();
  const groups = report.byHorizon;
  if (groups.length === 0) {
    return;
  }
  const recorded = report.producers.filter((p) => !isBaseline(p));
  const { axis, grid } = ink();
  const xs = groups.map((_, i) => i);
  const data: uPlot.AlignedData = [
    xs,
    ...report.producers.map((p) =>
      groups.map((g) => metricValue(g.producers[p], metric))
    ),
  ];
  const axisStyle = {
    stroke: axis,
    grid: { stroke: grid, width: 1 },
    ticks: { show: false },
  };
  chart = new uPlot(
    {
      width: Math.max(240, el.clientWidth),
      height: 220,
      scales: { x: { time: false } },
      cursor: { points: { size: 8 } },
      legend: { live: true },
      axes: [
        {
          ...axisStyle,
          values: (_u, splits) =>
            splits.map((s) =>
              Number.isInteger(s) ? (groups[s]?.key ?? '') : ''
            ),
          splits: () => xs,
        },
        { ...axisStyle, values: (_u, splits) => splits.map((s) => format(s)) },
      ],
      series: [
        { label: 'min', value: (_u, v) => groups[v]?.key ?? '' },
        ...report.producers.map((p) => ({
          label: p,
          stroke: producerColor(p, recorded),
          width: 2,
          dash: isBaseline(p) ? [6, 4] : undefined,
          points: { size: 8, fill: producerColor(p, recorded) },
          value: (_u: uPlot, v: number | null) => format(v),
        })),
      ],
    },
    data,
    el
  );
}

/** Keep the chart as wide as its container. */
export function resizeHorizonChart(el: HTMLElement): void {
  chart?.setSize({ width: Math.max(240, el.clientWidth), height: 220 });
}
