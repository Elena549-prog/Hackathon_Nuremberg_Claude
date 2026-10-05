// Statische Fahrplandaten fuer die App. Als JSON-Import gebuendelt, damit es ohne Dateizugriff auf Vercel laeuft.

import tripsRaw from "../data/bus_trips.json";
import servicesRaw from "../data/bus_services.json";
import stopsRaw from "../data/bus_stops.json";
import routesRaw from "../data/bus_routes.json";
import { convert } from "./gtfs.ts";
import type { RawRoute, RawService, RawStop, RawTrip } from "./gtfs.ts";

let cache: ReturnType<typeof convert> | null = null;

export function getStaticData() {
  cache ??= convert(
    tripsRaw as unknown as RawTrip[],
    servicesRaw as unknown as Record<string, RawService>,
    stopsRaw as unknown as Record<string, RawStop>,
    routesRaw as unknown as RawRoute[],
  );
  return cache;
}
