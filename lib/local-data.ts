// Liest die kompakten Bus-Dateien aus data/*.json (fuer Tests und Entwicklung ohne Datenbank).
// In der App kommen dieselben Daten aus Supabase (trips_on_date, available_drivers).

import { readFileSync } from "node:fs";
import type { Service, Stop, Trip } from "./types.ts";

interface RawTrip { id: string; route: string; service: string; dir: number; head: string; block: string | null; dep: number; arr: number; from: string; to: string; n: number }
interface RawService { days: number[]; start: string; end: string; add: string[]; remove: string[] }

const read = <T>(dir: string, name: string): T => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf-8"));

export function loadLocalData(dir = "data") {
  const rawTrips = read<RawTrip[]>(dir, "bus_trips");
  const rawServices = read<Record<string, RawService>>(dir, "bus_services");
  const stops = read<Record<string, Omit<Stop, "id">>>(dir, "bus_stops");

  const trips: Trip[] = rawTrips.map((t) => ({
    id: t.id, routeId: t.route, serviceId: t.service, direction: (t.dir ? 1 : 0) as 0 | 1, headsign: t.head,
    blockId: t.block, depMin: t.dep, arrMin: t.arr, fromStop: t.from, toStop: t.to, stopCount: t.n,
  }));
  const services: Record<string, Service> = {};
  for (const [id, s] of Object.entries(rawServices)) {
    services[id] = { id, days: s.days.map(Boolean), startDate: s.start || null, endDate: s.end || null, add: s.add, remove: s.remove };
  }
  return { trips, services, stops };
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
