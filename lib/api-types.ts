// Vertrag zwischen /api/plan und dem Frontend.

export interface PlanRequest {
  date: string; // YYYY-MM-DD
  nowMin: number; // Minuten seit Mitternacht
  poolSize: number; // wie viele Fahrer aus dem Pool beruecksichtigt werden
  absent: string[]; // Fahrer-IDs, die ausfallen
  locked: Record<string, string>; // tripId -> driverId (bereits gefahren)
  bump: Record<string, number>; // Liniennummer -> Stau-Zuschlag
}

export interface PlanTrip { id: string; line: string; dep: number; arr: number; locked: boolean }
export interface PlanDriver { id: string; name: string; trips: PlanTrip[]; driveMin: number }
export interface PlanGap { id: string; line: string; dep: number; arr: number; head: string; reason: { limit: number; pause: number; busy: number } }
export interface PlanLine { line: string; trips: number; uncovered: number; factor: number; color: number } // color: Rang der Linie nach Fahrtenzahl, bestimmt die eigene Farbe

export interface PlanResponse {
  date: string;
  nowMin: number;
  coverage: number;
  source: "supabase" | "synthetic";
  roster: { id: string; name: string; absent: boolean }[];
  drivers: PlanDriver[]; // nur Fahrer mit mindestens einer Fahrt, nach erster Abfahrt sortiert
  gaps: PlanGap[];
  lines: PlanLine[];
  stats: { trips: number; future: number; uncoveredFuture: number; driversUsed: number; avgFactor: number };
  ms: number;
}
