/** The metrics the panel can show, and how each is displayed. */

import type { ProducerStats } from '../metrics/score';
import { t } from '../i18n/messages';

export const METRICS = [
  'mae',
  'median',
  'p90',
  'bias',
  'coverage',
  'n',
] as const;
export type Metric = (typeof METRICS)[number];

export function isMetric(value: unknown): value is Metric {
  return METRICS.includes(value as Metric);
}

/** The plotted value: minutes for errors, percent for coverage. */
export function metricValue(
  stats: ProducerStats | undefined,
  metric: Metric
): number | null {
  if (!stats) {
    return null;
  }
  if (metric === 'coverage') {
    return stats.coverage * 100;
  }
  if (metric === 'n') {
    return stats.n;
  }
  const v = stats[metric];
  return v === null ? null : v / 60;
}

export function formatMetric(metric: Metric): (v: number | null) => string {
  return (v) => {
    if (v === null || !Number.isFinite(v)) {
      return '-';
    }
    switch (metric) {
      case 'coverage':
        return `${Math.round(v)}%`;
      case 'n':
        return Math.round(v).toLocaleString();
      case 'bias':
        return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
      default:
        return v.toFixed(1);
    }
  };
}

export function metricLabel(metric: Metric): string {
  return t(`metric.${metric}`);
}

export function metricLongLabel(metric: Metric): string {
  return t(`metric.${metric}Long`);
}
