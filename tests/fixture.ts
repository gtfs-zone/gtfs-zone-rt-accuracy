/**
 * One trip T1 on 2026-11-04, three stops 0.01 degrees of latitude apart
 * (about 1.1 km), scheduled 10:00, 10:10, 10:20 UTC at GTFS stop_sequence
 * 10, 20, 30. Actuals: departs 10:02, reaches stop 20 at 10:13 and stop 30
 * at 10:25.
 */

import Papa from 'papaparse';
import type { PackageTables, Row } from '../src/metrics/dataset';

export const D = '2026-11-04';
export const STOPS = new Map<string, [number, number]>([
  ['A', [0, 0]],
  ['B', [0.01, 0]],
  ['C', [0.02, 0]],
]);

/** Epoch seconds of hh:mm UTC on the service date. */
export function at(hhmm: string): number {
  return Date.parse(`${D}T${hhmm}:00Z`) / 1000;
}

export function iso(hhmm: string): string {
  return `${D}T${hhmm}:00Z`;
}

export function csv(text: string): Row[] {
  return Papa.parse<Row>(text.trim(), { header: true, skipEmptyLines: true })
    .data;
}

const TRIPS = `
service_date,trip_id_performed,trip_id_scheduled,route_id
${D},T1,T1,R1
`;

const VISITS = `
service_date,trip_id_performed,trip_stop_sequence,scheduled_stop_sequence,stop_id,schedule_arrival_time,schedule_departure_time,actual_arrival_time,actual_departure_time
${D},T1,1,10,A,${iso('10:00')},${iso('10:00')},,${iso('10:02')}
${D},T1,2,20,B,${iso('10:10')},${iso('10:10')},${iso('10:13')},${iso('10:13')}
${D},T1,3,30,C,${iso('10:20')},${iso('10:20')},${iso('10:25')},
`;

/**
 * Prediction rows for stop C as [time, predicted]; an empty predicted time is
 * a withdrawal. Without `scheduled_stop_sequence`, as packages published
 * before that column existed.
 */
export function predictions(rows: [string, string | null][]): Row[] {
  const lines = rows.map(([t, p]) => {
    const v = p ? iso(p) : '';
    return `${D},T1,3,p,${iso(t)},T1,C,${v},${v}`;
  });
  return csv(
    [
      'service_date,trip_id_performed,trip_stop_sequence,producer,prediction_timestamp,trip_id_scheduled,stop_id,predicted_arrival_time,predicted_departure_time',
      ...lines,
    ].join('\n')
  );
}

export function fixes(rows: [string, number][]): Row[] {
  return csv(
    [
      'service_date,trip_id_performed,trip_id_scheduled,event_timestamp,latitude,longitude',
      ...rows.map(([t, lat]) => `${D},T1,T1,${iso(t)},${lat},0`),
    ].join('\n')
  );
}

export function fixturePackage(
  preds: [string, string | null][] = [
    ['10:00', '10:20'],
    ['10:10', '10:24'],
  ],
  vls: [string, number][] = []
): PackageTables {
  return {
    trips_performed: csv(TRIPS),
    stop_visits: csv(VISITS),
    vehicle_locations: fixes(vls),
    stop_time_predictions: predictions(preds),
  };
}
