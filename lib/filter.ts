// Filter nach Buslinien: reduziert eine Planantwort auf die gewaehlten Liniennummern.
// Rein auf dem Client, ohne neue Berechnung. Kennzahlen werden fuer die gewaehlten Linien neu gebildet.

import type { PlanResponse } from "./api-types.ts";

export function filterByLines(data: PlanResponse, sel: Set<string>): PlanResponse {
  if (!sel.size) return data;

  const drivers = data.drivers
    .map((d) => {
      const trips = d.trips.filter((t) => sel.has(t.line));
      return { ...d, trips, driveMin: trips.reduce((s, t) => s + t.arr - t.dep, 0) };
    })
    .filter((d) => d.trips.length > 0);
  const gaps = data.gaps.filter((g) => sel.has(g.line));
  const lines = data.lines.filter((l) => sel.has(l.line));

  const assignedFuture = drivers.reduce((s, d) => s + d.trips.filter((t) => t.dep >= data.nowMin).length, 0);
  const uncoveredFuture = gaps.filter((g) => g.dep >= data.nowMin).length;
  const future = assignedFuture + uncoveredFuture;
  const avgFactor = lines.length ? lines.reduce((s, l) => s + l.factor, 0) / lines.length : 1;

  return {
    ...data,
    drivers,
    gaps,
    lines,
    coverage: future ? Math.round((1 - uncoveredFuture / future) * 1000) / 10 : 100,
    stats: {
      trips: lines.reduce((s, l) => s + l.trips, 0),
      future,
      uncoveredFuture,
      driversUsed: drivers.length,
      avgFactor: Math.round(avgFactor * 100) / 100,
    },
  };
}
