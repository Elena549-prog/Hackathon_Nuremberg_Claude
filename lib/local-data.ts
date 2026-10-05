// Liest die kompakten Bus-Dateien aus data/*.json per Dateizugriff (fuer Tests und Skripte).
// Die App selbst nutzt lib/data.ts (statische Imports, laeuft auch auf Vercel).

import { readFileSync } from "node:fs";
import { convert } from "./gtfs.ts";
import type { RawRoute, RawService, RawStop, RawTrip } from "./gtfs.ts";

export { serviceRunsOn, tripsOnDate } from "./gtfs.ts";

const read = <T>(dir: string, name: string): T => JSON.parse(readFileSync(`${dir}/${name}.json`, "utf-8"));

export function loadLocalData(dir = "data") {
  return convert(
    read<RawTrip[]>(dir, "bus_trips"),
    read<Record<string, RawService>>(dir, "bus_services"),
    read<Record<string, RawStop>>(dir, "bus_stops"),
    read<RawRoute[]>(dir, "bus_routes"),
  );
}
