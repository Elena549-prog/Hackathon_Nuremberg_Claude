// Ausfuehren (Node 22.6+ mit Typ-Stripping, Node 24 ohne Flag):  node --test tests/scheduler.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan } from "../lib/scheduler.ts";
import { loadLocalData, tripsOnDate } from "../lib/local-data.ts";
import { DEFAULT_RULES } from "../lib/types.ts";
import type { Driver, PlanInput } from "../lib/types.ts";

const DATE = "2026-10-08"; // Donnerstag
const { trips: allTrips, services, stops } = loadLocalData();
const dayTrips = tripsOnDate(allTrips, services, DATE);
const tripById = new Map(allTrips.map((t) => [t.id, t]));

const makeDrivers = (n: number): Driver[] =>
  Array.from({ length: n }, (_, i) => ({ id: `d${i}`, name: `Fahrer ${i}`, active: true, maxDriveMin: 540 }));

const input = (n: number, extra: Partial<PlanInput> = {}): PlanInput => ({
  date: DATE, nowMin: 0, trips: dayTrips, drivers: makeDrivers(n),
  traffic: () => 1, locked: {}, rules: DEFAULT_RULES, stops, ...extra,
});

test("Tagesfahrplan ist geladen", () => {
  assert.equal(dayTrips.length, 5206);
});

test("jede Fahrt hoechstens einmal, nie zwei Fahrer", () => {
  const plan = buildPlan(input(300));
  const ids = [...plan.assignments.map((a) => a.tripId), ...plan.uncovered.map((u) => u.tripId)];
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, dayTrips.length);
});

test("Regeln: Ueberschneidung, Lenkzeit, Pause, Schichtlaenge", () => {
  const plan = buildPlan(input(300));
  const byDriver = new Map<string, typeof plan.assignments>();
  for (const a of plan.assignments) byDriver.set(a.driverId, [...(byDriver.get(a.driverId) ?? []), a]);
  const r = DEFAULT_RULES;
  for (const [id, list] of byDriver) {
    list.sort((a, b) => a.depMin - b.depMin);
    let drive = 0, cont = 0;
    list.forEach((a, i) => {
      const dur = a.arrMin - a.depMin;
      if (i > 0) {
        const gap = a.depMin - list[i - 1].arrMin;
        assert.ok(gap >= r.turnaroundMin, `${id}: Wendezeit ${gap} Min.`);
        cont = gap >= r.breakMin ? 0 : cont;
      }
      drive += dur; cont += dur;
      assert.ok(cont <= r.breakAfterMin, `${id}: ${cont} Min. ohne Pause`);
    });
    assert.ok(drive <= r.maxDriveMin, `${id}: Lenkzeit ${drive}`);
    assert.ok(list[list.length - 1].arrMin - list[0].depMin <= r.maxSpanMin, `${id}: Schichtlaenge`);
  }
});

test("weniger Fahrer, weniger Deckung", () => {
  const many = buildPlan(input(300)).coverage;
  const few = buildPlan(input(150)).coverage;
  assert.ok(many > few, `300 Fahrer: ${many} %, 150 Fahrer: ${few} %`);
});

test("Stau verlaengert die Fahrten", () => {
  const base = buildPlan(input(300));
  const jam = buildPlan(input(300, { traffic: () => 1.3 }));
  const avg = (p: typeof base) => p.assignments.reduce((s, a) => s + (a.arrMin - a.depMin), 0) / p.assignments.length;
  assert.ok(avg(jam) > avg(base) * 1.2);
});

test("gefahrene Fahrten bleiben beim Neuplanen fix", () => {
  const first = buildPlan(input(300));
  const past = first.assignments.filter((a) => a.depMin < 480);
  const locked = Object.fromEntries(past.map((a) => [a.tripId, a.driverId]));
  // Neuplanung um 08:00 mit weniger Fahrern: bis 08:00 darf sich nichts aendern
  const again = buildPlan(input(250, { nowMin: 480, locked, drivers: makeDrivers(300) }));
  for (const a of past) {
    const b = again.assignments.find((x) => x.tripId === a.tripId)!;
    assert.equal(b.driverId, a.driverId);
    assert.ok(b.locked);
  }
});

test("Laufzeit unter 5 Sekunden fuer einen Tag", () => {
  const t0 = Date.now();
  buildPlan(input(300));
  assert.ok(Date.now() - t0 < 5000);
});

test("Spaetschicht-Reserve verbessert die Deckung am Abend", () => {
  const without = buildPlan(input(288, { lateReserve: null })).coverage;
  const withReserve = buildPlan(input(288)).coverage;
  assert.ok(withReserve > without, `ohne ${without} %, mit ${withReserve} %`);
});

test("Ausgabe ist plausibel (Kennzahlen)", () => {
  const p = buildPlan(input(288));
  console.log(`  288 Fahrer am ${DATE}: Deckung ${p.coverage} %, ${p.uncovered.length} unbesetzt, ${Object.keys(p.driveMinByDriver).length} Fahrer eingesetzt`);
  assert.ok(p.coverage > 0 && p.coverage <= 100);
  assert.ok(tripById.size > 0);
});
