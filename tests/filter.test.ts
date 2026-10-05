// Ausfuehren:  node --test tests/filter.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByLines } from "../lib/filter.ts";
import type { PlanResponse } from "../lib/api-types.ts";

const base: PlanResponse = {
  date: "2026-10-08", nowMin: 480, coverage: 50, source: "synthetic",
  traffic: { requested: "simulated", used: "simulated", fetchedAt: null, liveLines: 0, historyCells: 0, note: null },
  roster: [{ id: "a", name: "A", absent: false }, { id: "b", name: "B", absent: false }],
  drivers: [
    { id: "a", name: "A", driveMin: 90, trips: [{ id: "1", line: "36", from: "A", to: "B", dep: 400, arr: 430, locked: true }, { id: "2", line: "36", from: "A", to: "B", dep: 500, arr: 530, locked: false }, { id: "3", line: "43", from: "A", to: "B", dep: 540, arr: 600, locked: false }] },
    { id: "b", name: "B", driveMin: 30, trips: [{ id: "4", line: "43", from: "A", to: "B", dep: 500, arr: 530, locked: false }] },
  ],
  gaps: [
    { id: "5", line: "36", from: "A", to: "B", dep: 520, arr: 550, head: "X", reason: { limit: 1, pause: 0, busy: 0 } },
    { id: "6", line: "65", from: "A", to: "B", dep: 520, arr: 550, head: "Y", reason: { limit: 1, pause: 0, busy: 0 } },
  ],
  lines: [
    { line: "36", trips: 4, uncovered: 1, factor: 1.2, delaySec: null, color: 0 },
    { line: "43", trips: 2, uncovered: 0, factor: 1.0, delaySec: null, color: 1 },
    { line: "65", trips: 1, uncovered: 1, factor: 1.1, delaySec: null, color: 2 },
  ],
  stats: { trips: 7, future: 5, uncoveredFuture: 2, driversUsed: 2, avgFactor: 1.1 },
  ms: 1,
};

test("ohne Auswahl bleibt alles unveraendert", () => {
  assert.equal(filterByLines(base, new Set()), base);
});

test("nur gewaehlte Linien bleiben, Fahrer ohne Fahrten verschwinden", () => {
  const f = filterByLines(base, new Set(["36"]));
  assert.deepEqual(f.drivers.map((d) => d.id), ["a"]);
  assert.equal(f.drivers[0].trips.length, 2);
  assert.equal(f.drivers[0].driveMin, 60);
  assert.deepEqual(f.gaps.map((g) => g.id), ["5"]);
  assert.deepEqual(f.lines.map((l) => l.line), ["36"]);
});

test("Deckungsgrad wird fuer die gewaehlten Linien neu berechnet", () => {
  const f = filterByLines(base, new Set(["36"]));
  // ab 08:00: 1 besetzte Fahrt (id 2) und 1 Luecke (id 5) bei Linie 36
  assert.equal(f.stats.future, 2);
  assert.equal(f.stats.uncoveredFuture, 1);
  assert.equal(f.coverage, 50);
  const both = filterByLines(base, new Set(["36", "43"]));
  assert.equal(both.stats.future, 4); // 2 + 3 + 4 besetzt ab 08:00 plus Luecke 5
  assert.equal(both.coverage, 75);
});

test("mehrere Linien: Stau-Durchschnitt nur ueber die gewaehlten", () => {
  const f = filterByLines(base, new Set(["36", "43"]));
  assert.equal(f.stats.avgFactor, 1.1);
  assert.equal(filterByLines(base, new Set(["43"])).stats.avgFactor, 1);
});
