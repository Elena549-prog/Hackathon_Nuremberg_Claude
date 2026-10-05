// Datenquellen der eigenstaendigen Browser-Version: Beispielfahrer, keine Live-Daten, keine Historie.
import type { PlanDeps } from "../lib/plan-service.ts";
import { syntheticDrivers } from "../lib/synthetic-drivers.ts";

export const browserDeps: PlanDeps = {
  getDrivers: async () => ({ drivers: syntheticDrivers(400), source: "synthetic" }),
  getLive: async () => { throw new Error("Live-Daten sind in dieser Ansicht nicht verfuegbar"); },
  getHistory: async () => new Map(),
};

// Startanfrage der Oberflaeche (Standardwerte). Der Plan dazu wird beim Bauen vorberechnet.
export const DEFAULT_REQUEST = { date: "2026-10-08", nowMin: 360, poolSize: 400, absent: [] as string[], locked: {} as Record<string, string>, bump: {} as Record<string, number>, traffic: "simulated" as const };
