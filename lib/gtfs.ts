// Wandelt die kompakten Bus-JSON-Dateien (data/*.json) in die Typen aus types.ts um.
// Ohne Dateizugriff, damit es in Next.js (Server und Tests) gleich funktioniert.

import type { Route, Service, Stop, Trip } from "./types.ts";

export interface RawTrip { id: string; route: string; service: string; dir: number; head: string; block: string | null; dep: number; arr: number; from: string; to: string; n: number }
export interface RawService { days: number[]; start: string; end: string; add: string[]; remove: string[] }
export interface RawRoute { id: string; name: string; long: string; kind: string }
export interface RawStop { name: string; lat: number; lon: number }

export function convert(rawTrips: RawTrip[], rawServices: Record<string, RawService>, rawStops: Record<string, RawStop>, rawRoutes: RawRoute[]) {
  const trips: Trip[] = rawTrips.map((t) => ({
    id: t.id, routeId: t.route, serviceId: t.service, direction: (t.dir ? 1 : 0) as 0 | 1, headsign: t.head,
    blockId: t.block, depMin: t.dep, arrMin: t.arr, fromStop: t.from, toStop: t.to, stopCount: t.n,
  }));
  const services: Record<string, Service> = {};
  for (const [id, s] of Object.entries(rawServices)) {
    services[id] = { id, days: s.days.map(Boolean), startDate: s.start || null, endDate: s.end || null, add: s.add, remove: s.remove };
  }
  const stops: Record<string, Stop> = {};
  for (const [id, s] of Object.entries(rawStops)) stops[id] = { id, ...s };
  const routes: Route[] = rawRoutes.map((r) => ({ id: r.id, shortName: r.name, longName: r.long, kind: r.kind }));
  return { trips, services, stops, routes };
}

// Gleiche Logik wie die SQL-Funktion service_runs_on (date als "YYYY-MM-DD")
export function serviceRunsOn(s: Service, date: string): boolean {
  const ymd = date.replaceAll("-", "");
  if (s.remove.includes(ymd)) return false;
  if (s.add.includes(ymd)) return true;
  const weekdayMonFirst = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return (!s.startDate || s.startDate <= ymd) && (!s.endDate || ymd <= s.endDate) && s.days[weekdayMonFirst];
}

export function tripsOnDate(trips: Trip[], services: Record<string, Service>, date: string): Trip[] {
  const running = new Set(Object.values(services).filter((s) => serviceRunsOn(s, date)).map((s) => s.id));
  return trips.filter((t) => running.has(t.serviceId));
}
