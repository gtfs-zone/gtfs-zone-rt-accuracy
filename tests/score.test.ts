import { describe, expect, it } from 'vitest';
import {
  BaselineCache,
  distAtSchedule,
  gpsDelay,
  gpsSeries,
  lastStopDelay,
  lastStopSeries,
  pointAt,
  scheduleAt,
  stopPolyline,
} from '../src/metrics/baselines';
import { buildDataset, type Fix, type Trip } from '../src/metrics/dataset';
import { ghostsAt } from '../src/metrics/ghosts';
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

  const fix = (hhmm: string, lat: number, lon = 0): Fix => ({
    t: at(hhmm),
    lat,
    lon,
    vehicle: 'V1',
  });

  it('inverts the schedule along the line', () => {
    expect(distAtSchedule(line, at('09:00'))).toBe(0);
    expect(scheduleAt(line, distAtSchedule(line, at('10:15')))).toBeCloseTo(
      at('10:15'),
      0
    );
    expect(distAtSchedule(line, at('11:00'))).toBe(line.cum[2]);
    expect(pointAt(line, distAtSchedule(line, at('10:05')))[0]).toBeCloseTo(
      0.005,
      6
    );
  });

  it('keeps a fix far down the line before departure at the origin', () => {
    // At stop C, 10 min before the trip leaves A.
    const series = gpsSeries(line, [fix('09:50', 0.02)]);
    expect(series.delay[0]).toBe(0);
  });

  it('snaps a loop trip at its terminal to the start', () => {
    const loop: Trip = {
      key: `${D}|L1`,
      serviceDate: D,
      tripId: 'L1',
      routeId: 'R1',
      visits: [
        ['A', '10:00'],
        ['B', '10:10'],
        ['E', '10:20'],
        ['A', '10:30'],
      ].map(([stopId, hhmm], i) => ({
        seq: i + 1,
        stopId,
        schedArr: at(hhmm),
        schedDep: at(hhmm),
        actArr: null,
        actDep: null,
      })),
    };
    const stops = new Map(STOPS).set('E', [0.01, 0.01]);
    const loopLine = stopPolyline(loop, stops)!;
    const series = gpsSeries(loopLine, [fix('10:01', 0)]);
    // At the origin one minute after departure, not at the end of the loop.
    expect(series.delay[0]).toBe(60);
  });

  it('places a bus 45 min late', () => {
    const series = gpsSeries(line, [fix('10:55', 0.01)]);
    expect(series.delay[0]).toBeCloseTo(2700, 0);
  });

  it('caps the delay at 60 min late', () => {
    const series = gpsSeries(line, [fix('11:20', 0.005)]);
    expect(series.delay[0]).toBeCloseTo(3600, 0);
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

  it('scores only the trips and stops the filter keeps', () => {
    const data = buildDataset([fixturePackage()]);
    const all = score(data, { timeZone: 'UTC' });
    const route = score(data, { timeZone: 'UTC', filter: { routeId: 'R1' } });
    expect(route.counts).toEqual(all.counts);
    const trip = score(data, {
      timeZone: 'UTC',
      filter: { tripKey: `${D}|T1` },
    });
    expect(trip.counts.samples).toBe(25);
    const other = score(data, { timeZone: 'UTC', filter: { routeId: 'R2' } });
    expect(other.counts.trips).toBe(0);
    expect(other.counts.samples).toBe(0);
    const stopB = score(data, { timeZone: 'UTC', filter: { stopIds: ['B'] } });
    expect(stopB.counts.trips).toBe(1);
    expect(stopB.counts.visits).toBe(1);
    expect(stopB.counts.samples).toBe(0);
    const stopC = score(data, { timeZone: 'UTC', filter: { stopIds: ['C'] } });
    expect(stopC.counts.samples).toBe(25);
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

describe('ghosts', () => {
  const data = buildDataset([fixturePackage(undefined, [['10:15', 0.012]])]);
  const cache = new BaselineCache(data, STOPS);

  it('places each producer where its delay puts the vehicle', () => {
    const ghosts = ghostsAt(
      data,
      cache,
      at('10:16'),
      ['p', 'schedule', 'last-stop'],
      300
    );
    const by = Object.fromEntries(ghosts.map((g) => [g.producer, g]));
    expect(ghosts.every((g) => g.tripKey === `${D}|T1`)).toBe(true);
    expect(by.p.fromLat).toBe(0.012);
    // On time: scheduled position at 10:16, 60% from B to C.
    expect(by.schedule.lat).toBeCloseTo(0.016, 6);
    // p predicts C at 10:24, 4 min late: scheduled position at 10:12.
    expect(by.p.lat).toBeCloseTo(0.012, 6);
    // last-stop: left B 3 min late, scheduled position at 10:13.
    expect(by['last-stop'].lat).toBeCloseTo(0.013, 6);
  });

  it('skips stale fixes and other trips', () => {
    expect(ghostsAt(data, cache, at('10:21'), ['schedule'], 300)).toEqual([]);
    expect(
      ghostsAt(data, cache, at('10:16'), ['schedule'], 300, { routeId: 'R2' })
    ).toEqual([]);
  });
});
