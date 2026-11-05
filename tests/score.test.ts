import { describe, expect, it } from 'vitest';
import {
  gpsDelay,
  gpsSeries,
  lastStopDelay,
  lastStopSeries,
  stopPolyline,
} from '../src/metrics/baselines';
import { buildDataset } from '../src/metrics/dataset';
import { score } from '../src/metrics/score';
import { STOPS, at, csv, fixturePackage, iso, D } from './fixture';

function onlyTrip() {
  const data = buildDataset([fixturePackage()]);
  return data.trips.get(`${D}|T1`)!;
}

describe('dataset', () => {
  it('resolves scheduled_stop_sequence through the package stop_visits', () => {
    const data = buildDataset([fixturePackage()]);
    expect(data.producers).toEqual(['p']);
    expect([...data.predictions.keys()]).toEqual([`${D}|T1|30`]);
    expect(data.unresolvedPredictions).toBe(0);
  });

  it('takes stop visits from the actuals package when given', () => {
    const actuals = {
      trips_performed: csv(
        `service_date,trip_id_performed,trip_id_scheduled,route_id\n${D},X1,T1,R1`
      ),
      stop_visits: csv(
        [
          'service_date,trip_id_performed,trip_stop_sequence,scheduled_stop_sequence,stop_id,schedule_arrival_time,schedule_departure_time,actual_arrival_time,actual_departure_time',
          `${D},X1,1,10,A,${iso('10:00')},${iso('10:00')},,${iso('10:00')}`,
          `${D},X1,3,30,C,${iso('10:20')},${iso('10:20')},${iso('10:24')},`,
        ].join('\n')
      ),
      vehicle_locations: [],
      stop_time_predictions: [],
    };
    const data = buildDataset([fixturePackage()], actuals);
    const trip = data.trips.get(`${D}|T1`)!;
    expect(trip.visits.map((v) => v.seq)).toEqual([10, 30]);
    const report = score(data, { timeZone: 'UTC' });
    // From 10:10 on, p predicts 10:24, the uploaded actual.
    expect(report.byHorizon[0].producers.p.mae).toBe(0);
  });
});

describe('last-stop baseline', () => {
  const trip = onlyTrip();
  const series = lastStopSeries(trip);

  it('waits for the origin departure', () => {
    expect(lastStopDelay(trip, series, at('09:58'))).toBe(0);
    expect(lastStopDelay(trip, series, at('10:01'))).toBe(60);
  });

  it('carries the delay of the last stop left', () => {
    expect(lastStopDelay(trip, series, at('10:03'))).toBe(120);
    expect(lastStopDelay(trip, series, at('10:14'))).toBe(180);
  });
});

describe('gps baseline', () => {
  const trip = onlyTrip();
  const line = stopPolyline(trip, STOPS)!;

  it('compares the fix with the schedule at its distance', () => {
    const data = buildDataset([fixturePackage(undefined, [['10:15', 0.015]])]);
    const series = gpsSeries(line, data.fixes.get(`${D}|T1`)!);
    // Halfway from B (10:10) to C (10:20) at 10:15: on time.
    expect(series.delay[0]).toBeCloseTo(0, 0);
    expect(gpsDelay(series, at('10:16'))).toBeCloseTo(0, 0);
  });

  it('drops a fix older than five minutes', () => {
    const data = buildDataset([fixturePackage(undefined, [['10:05', 0.005]])]);
    const series = gpsSeries(line, data.fixes.get(`${D}|T1`)!);
    expect(gpsDelay(series, at('10:10'))).not.toBeNull();
    expect(gpsDelay(series, at('10:10') + 1)).toBeNull();
  });

  it('counts a fix at the origin as not late before departure', () => {
    const data = buildDataset([fixturePackage(undefined, [['09:55', 0]])]);
    const series = gpsSeries(line, data.fixes.get(`${D}|T1`)!);
    expect(series.delay[0]).toBe(0);
  });
});

describe('score', () => {
  it('samples once a minute from the first prediction to the actual', () => {
    const report = score(buildDataset([fixturePackage()]), {
      timeZone: 'UTC',
    });
    expect(report.counts.samples).toBe(25);
    expect(report.byHorizon.map((g) => [g.key, g.samples])).toEqual([
      ['0-5', 4],
      ['5-15', 10],
      ['15-30', 11],
    ]);
  });

  it('scores the prediction in effect at each sample', () => {
    const report = score(buildDataset([fixturePackage()]), {
      timeZone: 'UTC',
    });
    const p = report.overall.producers.p;
    // 10 samples at -300 s, 15 at -60 s.
    expect(p.n).toBe(25);
    expect(p.mae).toBe(156);
    expect(p.bias).toBe(-156);
    expect(p.median).toBe(65);
    expect(p.p90).toBe(305);
    expect(report.overall.producers.schedule.mae).toBe(300);
    // 2 samples before departure (-300, -240), 11 at -180, 11 at -120, and
    // 10:24 held at the sample time (-60).
    expect(report.overall.producers['last-stop'].mae).toBe(156);
    expect(report.producers).toEqual(['p', 'schedule', 'last-stop']);
  });

  it('leaves withdrawn samples out of the head to head', () => {
    const report = score(
      buildDataset([
        fixturePackage([
          ['10:00', '10:20'],
          ['10:10', '10:24'],
          ['10:20', null],
        ]),
      ]),
      { timeZone: 'UTC' }
    );
    const p = report.overall.producers.p;
    expect(p.coverage).toBe(20 / 25);
    expect(p.n).toBe(20);
    expect(report.overall.producers.schedule.coverage).toBe(1);
    expect(report.overall.producers.schedule.n).toBe(20);
  });

  it('adds the gps baseline when stop positions are known', () => {
    const report = score(
      buildDataset([fixturePackage(undefined, [['10:00', 0]])]),
      { timeZone: 'UTC', stops: STOPS }
    );
    expect(report.producers).toContain('gps');
    // The one fix ages out after 10:05, so the head to head stops there.
    expect(report.overall.producers.gps.coverage).toBe(6 / 25);
    expect(report.overall.producers.p.n).toBe(6);
  });

  it('breaks samples down by local hour', () => {
    const report = score(buildDataset([fixturePackage()]), {
      timeZone: 'America/New_York',
    });
    expect(report.byHour.map((g) => g.key)).toEqual(['5']);
    expect(report.byRoute.map((g) => g.key)).toEqual(['R1']);
    expect(report.byDate.map((g) => g.key)).toEqual([D]);
  });
});
