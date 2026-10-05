// Berechnet einen Tagesplan aus einer Anfrage. Wird von der API-Route (Server) und von der
// eigenstaendigen Browser-Version (Artifact) benutzt. Die Datenquellen kommen als "deps" herein.

import { buildPlan } from "./scheduler.ts";
import { getStaticData } from "./data.ts";
import { tripsOnDate } from "./gtfs.ts";
import { LIVE_MIN_SAMPLES, liveExcess, makeFactor } from "./traffic.ts";
import type { LiveSnapshot } from "./vag-live.ts";
import { DEFAULT_RULES } from "./types.ts";
import type { Driver } from "./types.ts";
import type { PlanDriver, PlanGap, PlanLine, PlanRequest, PlanResponse, TrafficInfo } from "./api-types.ts";

export interface PlanDeps {
  getDrivers(date: string): Promise<{ drivers: Driver[]; source: "supabase" | "synthetic" }>;
  getLive(): Promise<LiveSnapshot>; // wirft oder liefert stationsOk = 0, wenn nicht erreichbar
  getHistory(): Promise<Map<string, number>>;
}

export type PlanResult = { ok: true; data: PlanResponse } | { ok: false; status: number; error: string };

export async function computePlan(body: Partial<PlanRequest>, deps: PlanDeps): Promise<PlanResult> {
  const t0 = Date.now();
  const date = body.date ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return { ok: false, status: 400, error: "date muss YYYY-MM-DD sein" };
  }
  const nowMin = Math.min(1700, Math.max(0, Math.round(body.nowMin ?? 0)));
  const absent = new Set(body.absent ?? []);
  const locked = body.locked ?? {};
  const requested = body.traffic === "simulated" ? "simulated" : "live";
  const weekday = ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

  try {
    const { trips, services, stops, routes } = getStaticData();
    const short = new Map(routes.map((r) => [r.id, r.shortName]));
    const tripById = new Map(trips.map((t) => [t.id, t]));
    const dayTrips = tripsOnDate(trips, services, date);

    // Typische Fahrtdauer je Linie (Minuten), Grundlage fuer den Live-Zuschlag
    const dur = new Map<string, { sum: number; n: number }>();
    for (const t of dayTrips) {
      const l = short.get(t.routeId) ?? "?";
      const e = dur.get(l) ?? { sum: 0, n: 0 };
      e.sum += t.arrMin - t.depMin; e.n++;
      dur.set(l, e);
    }
    const avgTripMin = (l: string) => { const e = dur.get(l); return e ? e.sum / e.n : 30; };

    // Verkehrslage: live (VAG), mit Rueckfall auf Simulation
    let live: LiveSnapshot | null = null;
    let note: string | null = null;
    if (requested === "live") {
      try {
        live = await deps.getLive();
        if (!live.stationsOk) { note = "VAG-Schnittstelle nicht erreichbar, Simulation aktiv."; live = null; }
        else if (live.stationsOk < live.stationsTotal) note = `${live.stationsOk} von ${live.stationsTotal} Stationen erreichbar.`;
      } catch {
        note = "Live-Abruf fehlgeschlagen, Simulation aktiv.";
      }
    }
    const excess: Record<string, number> = {};
    if (live) for (const l of Object.values(live.lines)) if (l.samples >= LIVE_MIN_SAMPLES) excess[l.line] = liveExcess(l.medianDelaySec, avgTripMin(l.line));
    const history = live ? await deps.getHistory() : new Map<string, number>();
    const factor = makeFactor({ nowMin, weekday, excess, history, bump: live ? {} : body.bump ?? {} });
    const traffic: TrafficInfo = {
      requested, used: live ? "live" : "simulated", fetchedAt: live?.fetchedAt ?? null,
      liveLines: Object.keys(excess).length, historyCells: history.size, note,
    };

    const { drivers: all, source } = await deps.getDrivers(date);
    const poolSize = Math.min(all.length, Math.max(1, Math.round(body.poolSize ?? all.length)));
    const pool = all.slice(0, poolSize);
    const roster = pool.map((d) => ({ id: d.id, name: d.name, absent: absent.has(d.id) }));

    const plan = buildPlan({
      date, nowMin, trips: dayTrips, drivers: pool.filter((d) => !absent.has(d.id)),
      traffic: (routeId, minute) => factor(short.get(routeId) ?? "", minute),
      locked, rules: DEFAULT_RULES, stops,
    });

    const names = new Map(pool.map((d) => [d.id, d.name]));
    const byDriver = new Map<string, PlanDriver>();
    for (const a of plan.assignments) {
      let d = byDriver.get(a.driverId);
      if (!d) { d = { id: a.driverId, name: names.get(a.driverId) ?? a.driverId, trips: [], driveMin: 0 }; byDriver.set(a.driverId, d); }
      const tr = tripById.get(a.tripId)!;
      d.trips.push({ id: a.tripId, line: short.get(tr.routeId) ?? "?", dep: a.depMin, arr: a.arrMin, locked: a.locked, from: stops[tr.fromStop]?.name ?? "", to: stops[tr.toStop]?.name ?? "" });
      d.driveMin += a.arrMin - a.depMin;
    }
    const drivers = [...byDriver.values()];
    drivers.forEach((d) => d.trips.sort((x, y) => x.dep - y.dep));
    drivers.sort((x, y) => x.trips[0].dep - y.trips[0].dep || x.name.localeCompare(y.name));

    const gaps: PlanGap[] = plan.uncovered.map((u) => {
      const t = tripById.get(u.tripId)!;
      return { id: t.id, line: short.get(t.routeId) ?? "?", dep: t.depMin, arr: t.arrMin, head: t.headsign, reason: u.reason };
    });

    // Linienuebersicht: nach Fahrtenzahl sortiert, jede Linie bekommt ihre Farbe (Rang)
    const agg = new Map<string, { trips: number; uncovered: number }>();
    for (const t of dayTrips) {
      const l = short.get(t.routeId) ?? "?";
      const e = agg.get(l) ?? { trips: 0, uncovered: 0 };
      e.trips++;
      agg.set(l, e);
    }
    for (const g of gaps) if (g.dep >= nowMin) agg.get(g.line)!.uncovered++;
    const lines: PlanLine[] = [...agg.entries()]
      .sort((a, b) => b[1].trips - a[1].trips)
      .map(([line, e], i) => ({
        line, ...e, factor: Math.round(factor(line, nowMin) * 100) / 100,
        delaySec: live?.lines[line] && live.lines[line].samples >= LIVE_MIN_SAMPLES ? live.lines[line].medianDelaySec : null, color: i,
      }));

    const future = dayTrips.filter((t) => t.depMin >= nowMin).length;
    const avgFactor = lines.reduce((s, l) => s + l.factor, 0) / Math.max(1, lines.length);
    return {
      ok: true,
      data: {
        date, nowMin, coverage: plan.coverage, source, traffic, roster, drivers, gaps, lines,
        stats: { trips: dayTrips.length, future, uncoveredFuture: gaps.filter((g) => g.dep >= nowMin).length, driversUsed: drivers.length, avgFactor: Math.round(avgFactor * 100) / 100 },
        ms: Date.now() - t0,
      },
    };
  } catch (e) {
    return { ok: false, status: 500, error: e instanceof Error ? e.message : "Fehler" };
  }
}
