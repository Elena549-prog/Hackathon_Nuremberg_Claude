import { NextResponse } from "next/server";
import { buildPlan } from "@/lib/scheduler.ts";
import { getStaticData } from "@/lib/data.ts";
import { tripsOnDate } from "@/lib/gtfs.ts";
import { loadDrivers } from "@/lib/drivers.ts";
import { trafficFactor } from "@/lib/traffic.ts";
import { DEFAULT_RULES } from "@/lib/types.ts";
import type { PlanDriver, PlanGap, PlanLine, PlanRequest, PlanResponse } from "@/lib/api-types.ts";

export const maxDuration = 30;

export async function POST(req: Request) {
  const t0 = Date.now();
  let body: Partial<PlanRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungueltiges JSON" }, { status: 400 });
  }
  const date = body.date ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    return NextResponse.json({ error: "date muss YYYY-MM-DD sein" }, { status: 400 });
  }
  const nowMin = Math.min(1700, Math.max(0, Math.round(body.nowMin ?? 0)));
  const absent = new Set(body.absent ?? []);
  const bump = body.bump ?? {};
  const locked = body.locked ?? {};

  try {
    const { trips, services, stops, routes } = getStaticData();
    const short = new Map(routes.map((r) => [r.id, r.shortName]));
    const tripById = new Map(trips.map((t) => [t.id, t]));
    const dayTrips = tripsOnDate(trips, services, date);

    const { drivers: all, source } = await loadDrivers(date);
    const poolSize = Math.min(all.length, Math.max(1, Math.round(body.poolSize ?? all.length)));
    const pool = all.slice(0, poolSize);
    const roster = pool.map((d) => ({ id: d.id, name: d.name, absent: absent.has(d.id) }));

    const plan = buildPlan({
      date, nowMin, trips: dayTrips, drivers: pool.filter((d) => !absent.has(d.id)),
      traffic: (routeId, minute) => trafficFactor(short.get(routeId) ?? "", minute, bump),
      locked, rules: DEFAULT_RULES, stops,
    });

    const names = new Map(pool.map((d) => [d.id, d.name]));
    const byDriver = new Map<string, PlanDriver>();
    for (const a of plan.assignments) {
      let d = byDriver.get(a.driverId);
      if (!d) { d = { id: a.driverId, name: names.get(a.driverId) ?? a.driverId, trips: [], driveMin: 0 }; byDriver.set(a.driverId, d); }
      d.trips.push({ id: a.tripId, line: short.get(tripById.get(a.tripId)!.routeId) ?? "?", dep: a.depMin, arr: a.arrMin, locked: a.locked });
      d.driveMin += a.arrMin - a.depMin;
    }
    const drivers = [...byDriver.values()];
    drivers.forEach((d) => d.trips.sort((x, y) => x.dep - y.dep));
    drivers.sort((x, y) => x.trips[0].dep - y.trips[0].dep || x.name.localeCompare(y.name));

    const gaps: PlanGap[] = plan.uncovered.map((u) => {
      const t = tripById.get(u.tripId)!;
      return { id: t.id, line: short.get(t.routeId) ?? "?", dep: t.depMin, arr: t.arrMin, head: t.headsign, reason: u.reason };
    });

    // Linienuebersicht: die sechs groessten Linien bekommen eine eigene Farbe, der Rest ist "sonstige"
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
      .map(([line, e], i) => ({ line, ...e, factor: Math.round(trafficFactor(line, Math.max(nowMin, 0), bump) * 100) / 100, color: i < 6 ? i : -1 }));

    const future = dayTrips.filter((t) => t.depMin >= nowMin).length;
    const avgFactor = lines.reduce((s, l) => s + l.factor, 0) / Math.max(1, lines.length);
    const res: PlanResponse = {
      date, nowMin, coverage: plan.coverage, source, roster, drivers, gaps, lines,
      stats: { trips: dayTrips.length, future, uncoveredFuture: gaps.filter((g) => g.dep >= nowMin).length, driversUsed: drivers.length, avgFactor: Math.round(avgFactor * 100) / 100 },
      ms: Date.now() - t0,
    };
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fehler" }, { status: 500 });
  }
}
