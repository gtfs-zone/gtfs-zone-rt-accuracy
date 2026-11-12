/**
 * Local days, recorded spans and vehicle counts for the timeline. Times are
 * epoch seconds; days run from local midnight to the next in `zone`.
 */

/** Recording gaps shorter than this are not shown, in seconds. */
export const GAP_MIN_S = 120;

export interface TimelineDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  start: number;
  end: number;
  /** Distinct vehicles with a fix in each bin. */
  counts: Uint16Array;
  /** Unrecorded stretches of at least GAP_MIN_S inside the day. */
  gaps: [number, number][];
  /** Share of the day covered by recorded spans, 0 to 1. */
  recorded: number;
}

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
export function midnight(
  y: number,
  m: number,
  d: number,
  zone: string
): number {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - zoneOffset(guess, zone);
  return (guess - zoneOffset(first, zone)) / 1000;
}

/** The local date holding `time`, as [y, m, d]. */
function localDate(time: number, zone: string): [number, number, number] {
  const ms = time * 1000;
  const local = new Date(ms + zoneOffset(ms, zone));
  return [local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate()];
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Local days from the one holding `from` to the one holding `to`. */
export function localDays(
  from: number,
  to: number,
  zone: string
): { date: string; start: number; end: number }[] {
  const out: { date: string; start: number; end: number }[] = [];
  let [y, m, d] = localDate(from, zone);
  for (;;) {
    const start = midnight(y, m, d, zone);
    // Date.UTC rolls an overflowing day into the next month.
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const [ny, nm, nd] = [
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
    ];
    const end = midnight(ny, nm, nd, zone);
    out.push({ date: iso(y, m, d), start, end });
    if (end > to) {
      return out;
    }
    [y, m, d] = [ny, nm, nd];
  }
}

/** Gaps of at least GAP_MIN_S in [start, end] not covered by `spans`. */
export function unrecorded(
  spans: [number, number][],
  start: number,
  end: number
): [number, number][] {
  const gaps: [number, number][] = [];
  let at = start;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    if (a >= end) {
      break;
    }
    if (b <= at) {
      continue;
    }
    if (a - at >= GAP_MIN_S) {
      gaps.push([at, a]);
    }
    at = Math.max(at, b);
  }
  if (end - at >= GAP_MIN_S) {
    gaps.push([at, end]);
  }
  return gaps;
}

/** Seconds of [start, end] covered by `spans`, which may overlap. */
function coveredSeconds(
  spans: [number, number][],
  start: number,
  end: number
): number {
  let total = 0;
  let at = start;
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) {
    const lo = Math.max(a, at);
    const hi = Math.min(b, end);
    if (hi > lo) {
      total += hi - lo;
      at = hi;
    }
  }
  return total;
}

/**
 * One day per local date from the first to the last fix or span, with
 * vehicle counts in `binS` bins. `t` is sorted; a fix's vehicle is its
 * vehicle id, else its trip; fixes with neither are not counted.
 */
export function timelineDays(
  t: Float64Array,
  vehicle: string[],
  trip: string[],
  spans: [number, number][],
  zone: string,
  binS: number
): TimelineDay[] {
  const bounds = [
    ...(t.length ? [t[0], t[t.length - 1]] : []),
    ...spans.flat(),
  ];
  if (!bounds.length) {
    return [];
  }
  const days = localDays(Math.min(...bounds), Math.max(...bounds), zone).map(
    (day) => ({
      ...day,
      counts: new Uint16Array(Math.ceil((day.end - day.start) / binS)),
      gaps: spans.length ? unrecorded(spans, day.start, day.end) : [],
      recorded: spans.length
        ? coveredSeconds(spans, day.start, day.end) / (day.end - day.start)
        : 1,
    })
  );

  const lastBin = new Map<string, number>();
  let d = 0;
  for (let i = 0; i < t.length; i++) {
    const key = vehicle[i] || trip[i];
    if (!key) {
      continue;
    }
    while (d < days.length - 1 && t[i] >= days[d].end) {
      d++;
    }
    const day = days[d];
    const bin = Math.min(
      day.counts.length - 1,
      Math.floor((t[i] - day.start) / binS)
    );
    // A global bin number, so the same vehicle counts once per bin.
    const global = d * 100_000 + bin;
    if (lastBin.get(key) !== global) {
      lastBin.set(key, global);
      day.counts[bin]++;
    }
  }
  return days;
}
