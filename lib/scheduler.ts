// Planungslogik: teilt Fahrten auf verfuegbare Fahrer auf (Greedy-Heuristik).
// Reine Funktion ohne Datenbank- oder Netzwerkzugriff: Eingabe PlanInput, Ausgabe Plan.
//
// Ablauf: Fahrten nach Abfahrt sortieren, jede Fahrt dem am besten passenden Fahrer geben.
// Ein Fahrer passt, wenn er rechtzeitig am Startpunkt sein kann (Wendezeit + Leerfahrt) und
// Lenkzeit, Pausenpflicht und maximale Schichtlaenge eingehalten bleiben.
// Passt niemand, bleibt die Fahrt unbesetzt und wird mit Grund gemeldet.

import type { Assignment, Plan, PlanInput, Trip, UncoveredTrip } from "./types.ts";

interface DriverState {
  id: string;
  maxDriveMin: number;
  used: boolean;
  end: number; // Ende der letzten Fahrt
  drive: number; // Lenkzeit gesamt
  cont: number; // Lenkzeit seit der letzten Pause
  first: number | null; // Beginn der Schicht
  lastStop: string | null;
  lastRoute: string | null;
}

// 30 % der Fahrer starten erst ab 14:00 (an einem Werktag mit dem Nuernberger Netz ca. +6 Prozentpunkte Deckung)
export const DEFAULT_LATE_RESERVE = { fromMin: 840, share: 0.3 };

const station = (stopId: string) => stopId.split(":").slice(0, 3).join(":");

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function buildPlan(input: PlanInput): Plan {
  const { drivers, rules, locked, nowMin, traffic, stops } = input;

  // Leerfahrt-Minuten zwischen zwei Haltestellen (gleiche Station = 2 Min, sonst ca. 20 km/h)
  const deadhead = (from: string | null, to: string): number => {
    if (!from || from === to) return 0;
    if (station(from) === station(to)) return 2;
    const a = stops?.[from], b = stops?.[to];
    return a && b ? Math.round(3 + haversineKm(a, b) * 3) : 0;
  };

  const state = new Map<string, DriverState>(
    drivers.map((d) => [
      d.id,
      { id: d.id, maxDriveMin: Math.min(d.maxDriveMin, rules.maxDriveMin), used: false, end: -1, drive: 0, cont: 0, first: null, lastStop: null, lastRoute: null },
    ]),
  );
  const list = [...state.values()];

  // Spaetschicht-Reserve: ein Teil der Fahrer darf erst ab lateFromMin starten. Ohne diese Regel
  // verbraucht die Fruehspitze alle Fahrer (13 Stunden Schichtlaenge), und abends fehlt jeder.
  const lateOnly = new Set<string>();
  let lateFromMin = 0;
  const reserve = input.lateReserve === undefined ? DEFAULT_LATE_RESERVE : input.lateReserve; // null = aus
  if (reserve) {
    lateFromMin = reserve.fromMin;
    const k = Math.round(list.length * reserve.share);
    list.slice(list.length - k).forEach((d) => lateOnly.add(d.id));
  }

  const place = (d: DriverState, t: Trip, dur: number) => {
    const gap = d.used ? t.depMin - d.end : Infinity;
    d.cont = d.used && gap < rules.breakMin ? d.cont + dur : dur;
    d.drive += dur;
    d.first ??= t.depMin;
    d.end = t.depMin + dur;
    d.lastStop = t.toStop;
    d.lastRoute = t.routeId;
    d.used = true;
  };

  const assignments: Assignment[] = [];
  const uncovered: UncoveredTrip[] = [];
  const trips = [...input.trips].sort((a, b) => a.depMin - b.depMin || a.id.localeCompare(b.id));

  for (const t of trips) {
    const dur = Math.max(1, Math.round((t.arrMin - t.depMin) * traffic(t.routeId, t.depMin)));

    // Gefahrene oder vom Disponenten fixierte Fahrten bleiben unveraendert
    const pinned = locked[t.id];
    if (pinned !== undefined) {
      const d = state.get(pinned);
      if (d) place(d, t, dur);
      assignments.push({ tripId: t.id, driverId: pinned, depMin: t.depMin, arrMin: t.depMin + dur, locked: true, source: t.depMin < nowMin ? "auto" : "manual" });
      continue;
    }

    let best: DriverState | null = null;
    let bestScore = Infinity;
    const why = { limit: 0, pause: 0, busy: 0 };
    for (const d of list) {
      let gap = Infinity, need = 0;
      if (!d.used && t.depMin < lateFromMin && lateOnly.has(d.id)) continue;
      if (d.used) {
        gap = t.depMin - d.end;
        need = rules.turnaroundMin + deadhead(d.lastStop, t.fromStop);
        if (gap < need) { why.busy++; continue; }
      }
      const cont = d.used && gap < rules.breakMin ? d.cont : 0;
      if (cont + dur > rules.breakAfterMin) { why.pause++; continue; }
      if (d.drive + dur > d.maxDriveMin) { why.limit++; continue; }
      if (d.first !== null && t.depMin + dur - d.first > rules.maxSpanMin) { why.limit++; continue; }

      // Bewertung: kleine Wartezeit, gleiche Linie, nicht kurz vor dem Limit; neue Fahrer zuletzt
      let score = d.used ? gap - need + (d.lastRoute === t.routeId ? 0 : 20) + (d.drive > 420 ? 40 : 0) : 1000;
      if (score < bestScore) { bestScore = score; best = d; }
    }

    if (best) {
      place(best, t, dur);
      assignments.push({ tripId: t.id, driverId: best.id, depMin: t.depMin, arrMin: t.depMin + dur, locked: false, source: "auto" });
    } else {
      uncovered.push({ tripId: t.id, reason: why });
    }
  }

  const future = trips.filter((t) => t.depMin >= nowMin).length;
  const futureGaps = uncovered.filter((u) => trips.find((t) => t.id === u.tripId)!.depMin >= nowMin).length;
  const coverage = future ? Math.round((1 - futureGaps / future) * 1000) / 10 : 100;

  return {
    date: input.date,
    nowMin,
    assignments,
    uncovered,
    coverage,
    driveMinByDriver: Object.fromEntries(list.filter((d) => d.used).map((d) => [d.id, d.drive])),
  };
}
