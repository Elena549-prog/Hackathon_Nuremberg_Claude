// Gemeinsame Datentypen fuer Scheduler, API und Frontend.
// Spiegeln db/schema.sql (Supabase) und die kompakten Dateien in data/*.json.
// Zeiten sind Minuten seit Mitternacht; Werte > 1440 liegen nach Mitternacht.

// ---------- A) Fahrplan (statisch) ----------

export interface Route {
  id: string;
  shortName: string; // Liniennummer, z. B. "36"
  longName: string;
  kind: string; // "Stadtbus", ...
}

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Trip {
  id: string;
  routeId: string;
  serviceId: string;
  direction: 0 | 1;
  headsign: string;
  blockId: string | null;
  depMin: number;
  arrMin: number;
  fromStop: string;
  toStop: string;
  stopCount: number;
}

export interface Service {
  id: string;
  days: boolean[]; // [Mo, Di, Mi, Do, Fr, Sa, So]
  startDate: string | null; // ISO-Datum
  endDate: string | null;
  add: string[]; // zusaetzliche Betriebstage
  remove: string[]; // Ausfalltage
}

export interface RoutePattern {
  routeId: string;
  direction: 0 | 1;
  stopIds: string[];
}

// ---------- B) Betrieb ----------

export interface Driver {
  id: string;
  name: string;
  personnelNo?: string;
  active: boolean;
  maxDriveMin: number; // Standard 540 (9 Stunden)
}

export type AbsenceReason = "krank" | "urlaub" | "sonstiges";

export interface DriverAbsence {
  id: string;
  driverId: string;
  dateFrom: string;
  dateTo: string;
  reason: AbsenceReason;
  note?: string;
}

// Regeln, nach denen der Scheduler plant (vereinfacht nach EU VO 561/2006)
export interface PlanRules {
  maxDriveMin: number; // 540
  maxSpanMin: number; // 780, laengste Schicht vom ersten Start bis zum letzten Ende
  breakAfterMin: number; // 270, nach so viel Lenkzeit ist Pause Pflicht
  breakMin: number; // 45
  turnaroundMin: number; // 5, Wendezeit zwischen zwei Fahrten
}

export const DEFAULT_RULES: PlanRules = {
  maxDriveMin: 540,
  maxSpanMin: 780,
  breakAfterMin: 270,
  breakMin: 45,
  turnaroundMin: 5,
};

// ---------- C) Verkehr ----------

// 1.00 = Fahrplanzeit, 1.20 = 20 % laenger
export interface TrafficFactor {
  line: string; // Liniennummer, z. B. "36"
  weekday: number; // 1 = Montag
  hour: number; // 0 bis 23
  factor: number;
  samples: number;
}

// ---------- Scheduler: Ein- und Ausgabe ----------

export interface PlanInput {
  date: string; // ISO
  nowMin: number; // Fahrten davor sind gefahren und bleiben fix
  trips: Trip[]; // Fahrten, die an dem Tag stattfinden (trips_on_date)
  drivers: Driver[]; // bereits ohne abwesende Fahrer
  traffic: (routeId: string, minute: number) => number; // Stau-Faktor, Fallback 1.0
  stops?: Record<string, { lat: number; lon: number }>; // optional: Leerfahrt-Zeit zwischen Endhalt und naechstem Start
  lateReserve?: { fromMin: number; share: number } | null; // Anteil der Fahrer, der erst ab fromMin starten darf (Spaetschicht); null = aus, weggelassen = Standard
  locked: Record<string, string>; // tripId -> driverId (gefahren oder manuell fixiert)
  rules: PlanRules;
}

export interface Assignment {
  tripId: string;
  driverId: string;
  depMin: number;
  arrMin: number; // inklusive Stau-Zuschlag
  locked: boolean;
  source: "auto" | "manual";
}

export interface UncoveredTrip {
  tripId: string;
  reason: { limit: number; pause: number; busy: number }; // wie viele Fahrer scheiterten woran
}

export interface Plan {
  date: string;
  nowMin: number;
  assignments: Assignment[];
  uncovered: UncoveredTrip[];
  coverage: number; // Prozent, nur Rest des Tages ab nowMin
  driveMinByDriver: Record<string, number>;
}
