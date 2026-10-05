// Vertrag zwischen /api/plan und dem Frontend.

export interface PlanRequest {
  date: string; // YYYY-MM-DD
  nowMin: number; // Minuten seit Mitternacht
  poolSize: number; // wie viele Fahrer aus dem Pool beruecksichtigt werden
  absent: string[]; // Fahrer-IDs, die ausfallen
  locked: Record<string, string>; // tripId -> driverId (bereits gefahren)
  bump: Record<string, number>; // Liniennummer -> simulierter Stau-Zuschlag (nur Modus "simulated")
  traffic?: "live" | "simulated"; // Standard: live (VAG), mit Rueckfall auf simuliert
}

export interface PlanTrip { id: string; line: string; dep: number; arr: number; locked: boolean; from: string; to: string } // from/to: Haltestellennamen
export interface PlanDriver { id: string; name: string; trips: PlanTrip[]; driveMin: number }
export interface PlanGap { id: string; line: string; dep: number; arr: number; head: string; reason: { limit: number; pause: number; busy: number } }
export interface PlanLine {
  line: string; trips: number; uncovered: number;
  factor: number; // Stau-Faktor bei "Jetzt"
  delaySec: number | null; // aktuelle Verspaetung (Median, live), null = keine Live-Daten
  color: number; // Rang der Linie nach Fahrtenzahl, bestimmt die eigene Farbe
}

export interface TrafficInfo {
  requested: "live" | "simulated";
  used: "live" | "simulated";
  fetchedAt: string | null; // Zeitpunkt der Live-Messung
  liveLines: number; // Linien mit Live-Werten
  historyCells: number; // gelernte Faktoren (Linie x Wochentag x Stunde)
  note: string | null; // Hinweis, z. B. Rueckfall auf Simulation
}

export interface PlanResponse {
  date: string;
  nowMin: number;
  coverage: number;
  source: "supabase" | "synthetic";
  traffic: TrafficInfo;
  roster: { id: string; name: string; absent: boolean }[];
  drivers: PlanDriver[]; // nur Fahrer mit mindestens einer Fahrt, nach erster Abfahrt sortiert
  gaps: PlanGap[];
  lines: PlanLine[];
  stats: { trips: number; future: number; uncoveredFuture: number; driversUsed: number; avgFactor: number };
  ms: number;
}
