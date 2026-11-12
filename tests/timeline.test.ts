import { describe, expect, it } from 'vitest';
import {
  localDays,
  midnight,
  timelineDays,
  unrecorded,
} from '../src/metrics/timeline';

const ZONE = 'Europe/Zurich';
const s = (iso: string) => Date.parse(iso) / 1000;

describe('local days', () => {
  it('finds local midnight in the zone', () => {
    expect(midnight(2026, 11, 12, ZONE)).toBe(s('2026-11-11T23:00:00Z'));
    expect(midnight(2026, 7, 1, ZONE)).toBe(s('2026-06-30T22:00:00Z'));
  });

  it('lists each day once, with 23 h on the spring change', () => {
    const days = localDays(
      s('2026-03-28T12:00:00Z'),
      s('2026-03-30T01:00:00Z'),
      ZONE
    );
    expect(days.map((d) => d.date)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
    expect(days[1].end - days[1].start).toBe(23 * 3600);
  });
});

describe('unrecorded', () => {
  it('returns the stretches no span covers, ignoring short ones', () => {
    expect(
      unrecorded(
        [
          [100, 1000],
          [1060, 2000],
          [3000, 4000],
          [9000, 9500],
        ],
        0,
        5000
      )
    ).toEqual([
      [2000, 3000],
      [4000, 5000],
    ]);
  });
});

describe('timelineDays', () => {
  it('counts each vehicle once per bin and splits days', () => {
    const start = midnight(2026, 11, 12, ZONE);
    const t = Float64Array.from([
      start + 10,
      start + 20,
      start + 30,
      start + 400,
      start + 86_400 + 5,
    ]);
    const days = timelineDays(
      t,
      ['A', 'A', 'B', 'A', ''],
      ['', '', '', '', 'T9'],
      [[start, start + 86_400 + 600]],
      ZONE,
      300
    );
    expect(days.map((d) => d.date)).toEqual(['2026-11-12', '2026-11-13']);
    expect(days[0].counts.length).toBe(288);
    expect([...days[0].counts.slice(0, 2)]).toEqual([2, 1]);
    expect(days[1].counts[0]).toBe(1);
    expect(days[0].recorded).toBe(1);
    expect(days[0].gaps).toEqual([]);
    expect(days[1].gaps).toEqual([[start + 86_400 + 600, days[1].end]]);
  });
});
